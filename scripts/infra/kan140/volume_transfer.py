"""Programmatic OFFLINE physical transfer; no CLI and no volume deletion.

Interface: OfflineVolumeTransfer(transport, policy).transfer(phase) returns only
per-volume {digest, entries, bytes} evidence. A trusted fixture caller may pass
an explicit phase -> sequence of (source, fresh destination) allowlist. Production
uses transfer_managed(), whose two maps and helper image are not caller supplied.

The caller MUST hold backup.lock, quiesce ALL three services, and exclude other
Docker mutators for the whole call (Docker has no exclusive volume-create API).
Checks detect writers, not an adversarial concurrent daemon administrator.
Rollback copies CURRENT managed data to FRESH rollback volumes, never old bytes
over a legacy volume. Partial destinations remain on failure for operator review.
Work shares one <=900s deadline; helper cleanup has a separate <=5s reserve
(plus <=2s CLI reaping). Cleanup failure is fatal, never successful evidence.
"""
import hashlib
import json
import os
import queue
import re
import subprocess
import tarfile
import threading
import time
import uuid


PG_IMAGE = ('postgres:17.11-bookworm@sha256:'
            '3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826')
OWNER_LABEL = 'clicaepede.kan140.transfer-owner'
PHASE_LABEL = 'clicaepede.kan140.transfer-phase'
SUFFIXES = ('postgres_data', 'redis_data', 'evolution_instances')
MAX_BYTES = 1024 ** 3
MAX_ENTRIES = 50000
MAX_WIRE = MAX_BYTES + MAX_ENTRIES * 4096 + 1024 ** 2
MAX_CONTROL = 2 * 1024 ** 2


class TransferError(Exception):
    """Only fixed codes, never Docker diagnostics, names or payloads."""


def require(condition, code):
    if not condition:
        raise TransferError(code)


def tar_manifest(stream, deadline, *, max_bytes=MAX_BYTES, max_entries=MAX_ENTRIES):
    """Hash bounded streaming TAR without extraction; include root/dirs and IDs.

    Fail closed on links, devices, sparse files, unsafe/duplicate names, extended
    metadata and truncation. PostgreSQL external tablespaces are not supported.
    Names are internal hash input only; neither names nor content are returned.
    """
    require(0 < max_bytes <= MAX_BYTES and 0 < max_entries <= MAX_ENTRIES,
            'manifest-policy')

    class Bounded:
        used = 0

        def read(self, size):
            require(time.monotonic() < deadline, 'manifest-deadline')
            require(size > 0, 'manifest-read')
            data = stream.read(min(size, 65536, MAX_WIRE - self.used + 1))
            self.used += len(data)
            require(self.used <= MAX_WIRE, 'manifest-wire-limit')
            return data

    class PhysicalInfo(tarfile.TarInfo):
        def _proc_member(self, archive):
            # Reject extension headers BEFORE tarfile can allocate their payload.
            require(self.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE),
                    'manifest-type')
            require(0 <= self.size <= max_bytes, 'manifest-byte-limit')
            return super()._proc_member(archive)

    bounded = Bounded()
    rows, names, total = [], set(), 0
    try:
        with tarfile.open(fileobj=bounded, mode='r|', tarinfo=PhysicalInfo) as archive:
            for member in archive:
                require(time.monotonic() < deadline, 'manifest-deadline')
                name = member.name
                # GNU tar -C /source -cf - . emits '.' and './relative/path'.
                normalized = name[2:] if name.startswith('./') else name
                require(name == '.' or (name.startswith('./') and normalized and
                        all(p not in ('', '.', '..') for p in normalized.split('/'))),
                        'manifest-name')
                require(len(name.encode('utf-8', 'surrogateescape')) <= 4096 and
                        normalized not in names, 'manifest-name')
                names.add(normalized)
                require(len(names) <= max_entries, 'manifest-entry-limit')
                require((member.isdir() or member.isreg()) and not member.sparse and
                        not member.pax_headers, 'manifest-type')
                require(name != '.' or member.isdir(), 'manifest-root')
                require(member.uid >= 0 and member.gid >= 0 and
                        0 <= member.mode <= 0o7777, 'manifest-metadata')
                require(0 <= member.size <= max_bytes, 'manifest-byte-limit')
                require(not member.isdir() or member.size == 0, 'manifest-type')
                total += member.size
                require(total <= max_bytes, 'manifest-byte-limit')
                digest = hashlib.sha256()
                if member.isreg():
                    file = archive.extractfile(member)
                    remaining = member.size
                    while remaining:
                        require(time.monotonic() < deadline, 'manifest-deadline')
                        chunk = file.read(min(65536, remaining))
                        require(bool(chunk), 'manifest-truncated')
                        remaining -= len(chunk)
                        digest.update(chunk)
                rows.append((normalized, 'd' if member.isdir() else 'f', member.uid,
                             member.gid, member.mode, member.size, digest.hexdigest()))
        # Drain to EOF before waiting, bounding even trailing garbage/padding.
        while bounded.read(65536):
            pass
        require('.' in names, 'manifest-root')
        digest = hashlib.sha256()
        for row in sorted(rows):
            require(time.monotonic() < deadline, 'manifest-deadline')
            digest.update(json.dumps(row, ensure_ascii=True, separators=(',', ':')).encode())
            digest.update(b'\n')
        return {'digest': digest.hexdigest(), 'entries': len(rows), 'bytes': total}
    except TransferError:
        raise
    except Exception:
        raise TransferError('manifest-invalid') from None


class DockerProcess:
    """Bounded CLI adapter. execute(args, deadline, consumer=None) -> bytes/result.

    A consumer receives a deadline-aware binary read(size) stream. Stderr is
    discarded; stdout/control JSON is bounded, never printed. A bounded reader
    queue works for both Windows fake-process tests and native POSIX pipes.
    """
    def __init__(self, docker_config, *, popen=subprocess.Popen):
        self.prefix = ['docker', '--host', 'unix:///var/run/docker.sock',
                       '--config', os.fspath(docker_config)]
        self.popen = popen

    def execute(self, args, deadline, consumer=None):
        process = None
        stop = threading.Event()
        chunks = queue.Queue(maxsize=2)

        def publish(value):
            while not stop.is_set():
                try:
                    chunks.put(value, timeout=0.05)
                    return
                except queue.Full:
                    pass

        try:
            require(time.monotonic() < deadline, 'docker-deadline')
            env = {k: v for k, v in os.environ.items() if not k.startswith('DOCKER_')}
            process = self.popen(self.prefix + list(args), stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)

            def reader():
                try:
                    while not stop.is_set():
                        value = process.stdout.read(65536)
                        publish(value)
                        if not value:
                            return
                except Exception:
                    publish(None)

            thread = threading.Thread(target=reader, daemon=True)
            thread.start()

            class Pipe:
                pending = b''
                ended = False

                def read(self, size):
                    require(size > 0, 'docker-read')
                    require(time.monotonic() < deadline, 'docker-deadline')
                    if not self.pending and not self.ended:
                        try:
                            value = chunks.get(timeout=max(0.001, deadline - time.monotonic()))
                        except queue.Empty:
                            raise TransferError('docker-deadline') from None
                        require(value is not None, 'docker-stream')
                        self.pending = value
                        self.ended = not value
                    value, self.pending = self.pending[:size], self.pending[size:]
                    return value

            pipe = Pipe()
            if consumer is not None:
                result = consumer(pipe)
                require(pipe.ended, 'docker-stream-undrained')
            else:
                output = bytearray()
                while True:
                    chunk = pipe.read(65536)
                    if not chunk:
                        break
                    output.extend(chunk)
                    require(len(output) <= MAX_CONTROL, 'docker-output-limit')
                result = bytes(output)
            require(process.wait(timeout=max(0.001, deadline - time.monotonic())) == 0,
                    'docker-command')
            return result
        except TransferError:
            raise
        except Exception:
            raise TransferError('docker-command') from None
        finally:
            stop.set()
            if process is not None:
                try:
                    if process.poll() is None:
                        process.kill()
                    process.wait(timeout=2)
                    process.stdout.close()
                except Exception:
                    raise TransferError('docker-cleanup-failed') from None


class OfflineVolumeTransfer:
    """Single-use operation; injected transport has DockerProcess.execute contract."""
    def __init__(self, transport, policy, *, timeout=300):
        require(type(timeout) in (int, float) and 0 < timeout <= 900, 'transfer-policy')
        try:
            self.policy = {phase: tuple(tuple(pair) for pair in pairs)
                           for phase, pairs in policy.items()}
            require(self.policy and set(self.policy) <= {'cutover', 'rollback'}, 'transfer-policy')
            for pairs in self.policy.values():
                require(0 < len(pairs) <= 3, 'transfer-policy')
                sources, targets = set(), set()
                for source, target in pairs:
                    require(all(isinstance(n, str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', n)
                                for n in (source, target)), 'transfer-policy')
                    require(source not in sources and target not in targets, 'transfer-policy')
                    sources.add(source)
                    targets.add(target)
                require(not sources & targets, 'transfer-policy')
        except TransferError:
            raise
        except Exception:
            raise TransferError('transfer-policy') from None
        self.transport, self.timeout = transport, timeout
        self.owner = uuid.uuid4().hex
        self.used = False

    def _run(self, *args, consumer=None):
        require(time.monotonic() < self.deadline, 'transfer-deadline')
        result = self.transport.execute(args, self.deadline, consumer)
        require(time.monotonic() < self.deadline, 'transfer-deadline')
        return result

    def _json(self, *args):
        try:
            return json.loads(self._run(*args))
        except TransferError:
            raise
        except Exception:
            raise TransferError('docker-inspect-invalid') from None

    def _volume(self, name, fresh=False):
        rows = self._json('volume', 'inspect', name)
        require(isinstance(rows, list) and len(rows) == 1, 'volume-inspect')
        volume = rows[0]
        require(volume['Name'] == name and volume['Driver'] == 'local' and
                not volume.get('Options') and volume.get('Scope') == 'local', 'volume-policy')
        if fresh:
            labels = volume.get('Labels') or {}
            require(labels.get(OWNER_LABEL) == self.owner and
                    labels.get(PHASE_LABEL) == self.phase, 'volume-ownership')

    def _quiescent(self, volumes):
        # Inspect ALL containers, including stopped containers with auto-restart.
        ids = self._run('container', 'ls', '--all', '--quiet', '--no-trunc').decode('ascii').split()
        require(len(ids) <= 512 and len(set(ids)) == len(ids) and
                all(re.fullmatch(r'[a-f0-9]{64}', cid) for cid in ids), 'container-inventory')
        for cid in ids:
            rows = self._json('container', 'inspect', cid)
            require(isinstance(rows, list) and len(rows) == 1 and rows[0]['Id'] == cid,
                    'container-inspect')
            item = rows[0]
            for mount in item['Mounts']:
                if mount['Type'] != 'volume' or mount['Name'] not in volumes:
                    continue
                require(type(mount['RW']) is bool, 'container-inspect')
                if not mount['RW']:
                    continue
                state, restart = item['State'], item['HostConfig']['RestartPolicy']['Name']
                require(type(state['Running']) is bool and type(state['Restarting']) is bool and
                        restart in ('no', 'always', 'unless-stopped', 'on-failure'), 'container-inspect')
                require(not state['Running'] and not state['Restarting'] and restart == 'no',
                        'volume-writer-attached')

    def _helper(self, source, target=None, manifest=False):
        name = 'kan140-transfer-' + self.owner + '-' + uuid.uuid4().hex
        args = ['container', 'create', '--name', name, '--pull', 'never',
                '--label', OWNER_LABEL + '=' + self.owner,
                '--label', PHASE_LABEL + '=' + self.phase,
                '--network', 'none', '--restart', 'no', '--read-only', '--user', '0:0',
                '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'CHOWN',
                '--cap-add', 'FOWNER', '--cap-add', 'FSETID',
                '--security-opt', 'no-new-privileges:true', '--cpus', '0.5',
                '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '32',
                '--log-driver', 'none', '--no-healthcheck', '--stop-timeout', '1',
                '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=1m',
                '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=1m',
                '--mount', 'type=volume,source=' + source + ',target=/source,readonly,volume-nocopy']
        if target:
            args += ['--mount', 'type=volume,source=' + target + ',target=/target,volume-nocopy']
        # Fixed commands only. The approved Debian image supplies GNU coreutils;
        # explicitly prove that before cp -a (no Python/runtime installation).
        command = ("case \"$(tar --version)\" in 'tar (GNU tar)'*) ;; *) exit 70;; esac; "
                   "exec tar --format=gnu -C /source -cf - .") if manifest else (
                   "case \"$(cp --version)\" in 'cp (GNU coreutils)'*) ;; *) exit 70;; esac; "
                   "exec cp -a -- /source/. /target/")
        args += ['--entrypoint', '/bin/sh', PG_IMAGE, '-ec', command]
        try:
            self._run(*args)
            # A fresh inspection immediately precedes every helper start.
            self._quiescent(self.volumes)
            result = self._run('container', 'start', '--attach', name,
                               consumer=(lambda pipe: tar_manifest(pipe, self.deadline)) if manifest else None)
            rows = self._json('container', 'inspect', name)
            require(isinstance(rows, list) and len(rows) == 1, 'helper-exit')
            state = rows[0]['State']
            require(state['Running'] is False and state['Restarting'] is False and
                    state['OOMKilled'] is False and type(state['ExitCode']) is int and
                    state['ExitCode'] == 0 and state['Error'] == '', 'helper-exit')
            return result
        finally:
            # Removing only our randomly named, ownership-verified helper also
            # stops a daemon-side copy if its attached CLI timed out. Never -v.
            cleanup_end = time.monotonic() + 5
            try:
                rows = json.loads(self.transport.execute(('container', 'inspect', name), cleanup_end))
                require(len(rows) == 1 and rows[0]['Name'] == '/' + name and
                        rows[0]['Config']['Labels'].get(OWNER_LABEL) == self.owner and
                        rows[0]['Config']['Labels'].get(PHASE_LABEL) == self.phase,
                        'helper-ownership')
                self.transport.execute(('container', 'rm', '--force', name), cleanup_end)
            except Exception:
                raise TransferError('helper-cleanup-failed') from None

    def transfer(self, phase):
        require(not self.used and isinstance(phase, str) and phase in self.policy, 'transfer-phase')
        self.used, self.phase = True, phase
        self.deadline = time.monotonic() + self.timeout
        try:
            pairs = self.policy[phase]
            volumes = {name for pair in pairs for name in pair}
            self.volumes = volumes
            listed = set(self._run('volume', 'ls', '--quiet').decode('ascii').split())
            require(all(source in listed and target not in listed for source, target in pairs),
                    'volume-not-fresh')
            for source, _ in pairs:
                self._volume(source)
            self._quiescent(volumes)
            evidence = []
            for source, target in pairs:
                before = self._helper(source, manifest=True)
                # Recheck freshness immediately before create; reuse is forbidden.
                listed = set(self._run('volume', 'ls', '--quiet').decode('ascii').split())
                require(target not in listed, 'volume-not-fresh')
                self._run('volume', 'create', '--driver', 'local',
                          '--label', OWNER_LABEL + '=' + self.owner,
                          '--label', PHASE_LABEL + '=' + phase, target)
                self._volume(target, fresh=True)
                self._helper(source, target)
                after = self._helper(source, manifest=True)
                copied = self._helper(target, manifest=True)
                self._quiescent(volumes)
                require(before == after == copied, 'volume-manifest-mismatch')
                evidence.append(copied)
            self._quiescent(volumes)
            return tuple(evidence)
        except TransferError:
            raise
        except Exception:
            raise TransferError('transfer-inspect-invalid') from None


def transfer_managed(phase, docker_config, *, timeout=300):
    """Production-only fixed maps; caller owns backup.lock and full quiescence."""
    policy = {
        'cutover': tuple(('clica-evolution-qa_' + suffix, 'kan140_qa_' + suffix)
                         for suffix in SUFFIXES),
        'rollback': tuple(('kan140_qa_' + suffix, 'kan140_rollback_' + suffix)
                          for suffix in SUFFIXES),
    }
    return OfflineVolumeTransfer(DockerProcess(docker_config), policy, timeout=timeout).transfer(phase)
