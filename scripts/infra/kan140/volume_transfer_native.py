"""Opt-in LOCAL Linux/root fixture rehearsal, never a production migration.

Run only on an exclusively controlled local Docker daemon with PG_IMAGE already
present, under backup.lock held externally by the coordinator for the entire run
including cleanup. No pull, SSH, service control, policy, or fixed destinations.
stdout is a sanitized JSON receipt; failures deliberately omit diagnostics.
Uses private helper APIs as well as the public transfer/manifest APIs: review
against volume_transfer.py before native execution. No PostgreSQL server starts.
"""
import argparse
from contextlib import contextmanager
import io
import json
import os
import re
import signal
import sys
import tarfile
import tempfile
import time
import uuid

import volume_transfer as vt


PIN = ('postgres:17.11-bookworm@sha256:'
       '3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826')
TMPFS = {'/var/lib/postgresql/data': 'rw,noexec,nosuid,nodev,size=1m',
         '/tmp': 'rw,noexec,nosuid,nodev,size=1m'}
CAPS = ['DAC_OVERRIDE', 'CHOWN', 'FOWNER', 'FSETID']
SEED = ("umask 077; mkdir /target/sub; printf 'fixture-v1' > /target/sub/seed; "
        "chown 12005:12006 /target/sub/seed; chmod 0640 /target/sub/seed; "
        "chown 12003:12004 /target/sub; chmod 2750 /target/sub; "
        "chown 12001:12002 /target; chmod 0750 /target")
LATEST = ("umask 077; test ! -e /target/sub/latestwrite; "
          "printf 'managed-latest-v2' > /target/sub/latestwrite; "
          "chown 12007:12008 /target/sub/latestwrite; "
          "chmod 0600 /target/sub/latestwrite")


class NativeInterrupted(BaseException):
    """Unwind through transport Exception sanitizers to fixture cleanup."""


@contextmanager
def interruption_handlers(state):
    previous = {}

    def interrupt(signum, frame):
        if state['interrupted']:
            return
        state['interrupted'] = True
        if not state['restoring']:
            raise NativeInterrupted()

    try:
        for signum in (signal.SIGTERM, signal.SIGINT):
            previous[signum] = signal.getsignal(signum)
            signal.signal(signum, interrupt)
        yield
    finally:
        # Restoration must finish even if the first signal arrives here.
        state['restoring'] = True
        for signum, handler in previous.items():
            signal.signal(signum, handler)


def reject_interrupted(receipt):
    receipt['status'] = 'fail'
    if receipt['gate'] != 'native-fixture-cleanup-failed':
        receipt['gate'] = 'native-fixture-interrupted'
    receipt.pop('evidence', None)


def exact_caps(value):
    if not isinstance(value, list) or not all(isinstance(cap, str) for cap in value):
        return False
    canonical = [cap.removeprefix('CAP_') for cap in value]
    return len(canonical) == len(CAPS) and set(canonical) == set(CAPS)


def expected(latest=False):
    """Independent fixture oracle, including root and directory metadata."""
    data = io.BytesIO()
    rows = [('.', None, 12001, 12002, 0o750),
            ('./sub', None, 12003, 12004, 0o2750),
            ('./sub/seed', b'fixture-v1', 12005, 12006, 0o640)]
    if latest:
        rows.append(('./sub/latestwrite', b'managed-latest-v2', 12007, 12008, 0o600))
    with tarfile.open(fileobj=data, mode='w', format=tarfile.GNU_FORMAT) as archive:
        for name, payload, uid, gid, mode in rows:
            entry = tarfile.TarInfo(name)
            entry.uid, entry.gid, entry.mode = uid, gid, mode
            entry.type = tarfile.DIRTYPE if payload is None else tarfile.REGTYPE
            entry.size = 0 if payload is None else len(payload)
            archive.addfile(entry, None if payload is None else io.BytesIO(payload))
    return vt.tar_manifest(io.BytesIO(data.getvalue()), time.monotonic() + 5)


def values(args, flag):
    return [args[i + 1] for i, value in enumerate(args) if value == flag]


class FixtureTransport:
    """Reject drift before start; removal requires exact registered ownership.

    Registry is populated before creates so uncertain/partial creates can be
    inspected, but never deleted merely because their name has our prefix.
    """
    def __init__(self, transport, nonce):
        vt.require(re.fullmatch('[a-f0-9]{32}', nonce) is not None, 'native-nonce')
        self.transport = transport
        self.names = tuple('kan140-native-' + nonce + '-' + role
                           for role in ('fixture', 'managedfixture', 'rollback'))
        self.volumes, self.helpers = {}, {}

    def inspect(self, kind, name, deadline):
        rows = json.loads(self.transport.execute((kind, 'inspect', name), deadline))
        vt.require(isinstance(rows, list) and len(rows) == 1, 'native-inspect')
        return rows[0]

    def owned(self, kind, name, labels, deadline):
        item = self.inspect(kind, name, deadline)
        actual = item.get('Labels') if kind == 'volume' else item.get('Config', {}).get('Labels')
        vt.require(item.get('Name') == (name if kind == 'volume' else '/' + name)
                   and actual == labels, 'native-ownership')
        if kind == 'volume':
            vt.require(item.get('Driver') == 'local' and item.get('Scope') == 'local'
                       and not item.get('Options'), 'native-volume')
        return item

    def check_helper(self, args, labels, deadline):
        name = values(args, '--name')[0]
        item = self.owned('container', name, labels, deadline)
        host, config = item['HostConfig'], item['Config']
        vt.require(config['Image'] == PIN and config['User'] == '0:0'
                   and config['Entrypoint'] == ['/bin/sh'] and config['Cmd'] == list(args[-2:])
                   and config.get('Healthcheck', {}).get('Test') == ['NONE']
                   and config.get('ExposedPorts', {}) == {'5432/tcp': {}}
                   and host['NetworkMode'] == 'none' and host['ReadonlyRootfs'] is True
                   and host['Privileged'] is False and not host.get('Binds')
                   and not host.get('Devices') and not host.get('VolumesFrom')
                   and not host.get('PortBindings') and not host.get('PublishAllPorts')
                   and host.get('PidMode', '') == '' and host.get('IpcMode') == 'private'
                   and host['RestartPolicy']['Name'] == 'no'
                   and host['LogConfig']['Type'] == 'none'
                   and set(host['CapDrop']) == {'ALL'} and exact_caps(host['CapAdd'])
                   and host['SecurityOpt'] == ['no-new-privileges:true']
                   and host['Memory'] == 256 * 1024 ** 2
                   and host['MemorySwap'] == 256 * 1024 ** 2
                   and host['NanoCpus'] == 500000000 and host['PidsLimit'] == 32
                   and host['Tmpfs'] == TMPFS, 'native-helper-defaults')
        wanted = {}
        for mount in values(args, '--mount'):
            parts = dict(p.split('=', 1) if '=' in p else (p, True) for p in mount.split(','))
            vt.require(parts['type'] == 'volume' and parts['source'] in self.names
                       and 'volume-nocopy' in parts, 'native-mount')
            vt.require(parts['source'] in self.volumes, 'native-mount')
            self.owned('volume', parts['source'], self.volumes[parts['source']][0], deadline)
            wanted[parts['target']] = (parts['source'], 'readonly' not in parts)
        found = {}
        for mount in item['Mounts']:
            if mount['Type'] == 'tmpfs' and mount['Destination'] in TMPFS:
                continue
            vt.require(mount['Type'] == 'volume', 'native-mount')
            found[mount['Destination']] = (mount['Name'], mount['RW'])
        vt.require(found == wanted, 'native-mount')  # Reject image-created anonymous volumes.

    def execute(self, args, deadline, consumer=None):
        args = tuple(args)
        if args[:2] in (('volume', 'create'), ('container', 'create')):
            labels = dict(v.split('=', 1) for v in values(args, '--label'))
            vt.require(set(labels) == {vt.OWNER_LABEL, vt.PHASE_LABEL}
                       and re.fullmatch('[a-f0-9]{32}', labels[vt.OWNER_LABEL]) is not None
                       and labels[vt.PHASE_LABEL] in ('fixture', 'cutover', 'rollback'),
                       'native-labels')
            if args[0] == 'volume':
                name, registry = args[-1], self.volumes
                vt.require(name in self.names and name not in registry, 'native-volume-name')
            else:
                name, registry = values(args, '--name')[0], self.helpers
                vt.require(re.fullmatch('kan140-transfer-' + labels[vt.OWNER_LABEL]
                                        + '-[a-f0-9]{32}', name) is not None
                           and name not in registry and PIN in args
                           and values(args, '--pull') == ['never'], 'native-helper-name')
            registry[name] = (labels, args)
            result = self.transport.execute(args, deadline, consumer)
            if args[0] == 'container':
                self.check_helper(args, labels, deadline)
            return result
        if args[:3] == ('container', 'start', '--attach'):
            labels, create = self.helpers[args[3]]
            self.check_helper(create, labels, deadline)
        if args[:2] in (('container', 'rm'), ('volume', 'rm')):
            registry = self.helpers if args[0] == 'container' else self.volumes
            name = args[-1]
            vt.require(name in registry, 'native-cleanup-name')
            self.owned(args[0], name, registry[name][0], deadline)
            result = self.transport.execute(args, deadline, consumer)
            del registry[name]
            return result
        return self.transport.execute(args, deadline, consumer)

    def cleanup(self):
        failed = False
        # Separate bounded reserve per resource, including helpers left by failed creates.
        for name in tuple(self.helpers):
            try:
                self.execute(('container', 'rm', '--force', name), time.monotonic() + 5)
            except Exception:
                failed = True
        if not self.helpers:
            for name in reversed(tuple(self.volumes)):
                try:
                    self.execute(('volume', 'rm', name), time.monotonic() + 5)
                except Exception:
                    failed = True
        vt.require(not failed and not self.helpers and not self.volumes, 'native-cleanup')


def write_fixture(operation, name, command):
    """Only two fixed writes: seed source; add latestwrite to managed fixture."""
    transport = operation.transport
    vt.require((name, command) in ((transport.names[0], SEED),
                                  (transport.names[1], LATEST)), 'native-write')
    helper = 'kan140-transfer-' + operation.owner + '-' + uuid.uuid4().hex
    args = ['container', 'create', '--name', helper, '--pull', 'never',
            '--label', vt.OWNER_LABEL + '=' + operation.owner,
            '--label', vt.PHASE_LABEL + '=fixture', '--network', 'none',
            '--restart', 'no', '--read-only', '--user', '0:0', '--cap-drop', 'ALL']
    for cap in CAPS:
        args += ['--cap-add', cap]
    args += ['--security-opt', 'no-new-privileges:true', '--cpus', '0.5',
             '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '32',
             '--log-driver', 'none', '--no-healthcheck', '--stop-timeout', '1']
    for path, options in TMPFS.items():
        args += ['--tmpfs', path + ':' + options]
    args += ['--mount', 'type=volume,source=' + name + ',target=/target,volume-nocopy',
             '--entrypoint', '/bin/sh', PIN, '-ec', command]
    operation._quiescent(operation.volumes)
    transport.owned('volume', name, transport.volumes[name][0], operation.deadline)
    operation._run(*args)
    operation._quiescent(operation.volumes)
    operation._run('container', 'start', '--attach', helper)
    state = transport.inspect('container', helper, operation.deadline)['State']
    vt.require(state['Running'] is False and state['Restarting'] is False
               and state['OOMKilled'] is False and type(state['ExitCode']) is int
               and state['ExitCode'] == 0 and state['Error'] == '', 'native-write-exit')
    transport.execute(('container', 'rm', '--force', helper), time.monotonic() + 5)


def rehearse(transport, *, interruption=None):
    """Injected transport is for offline tests; CLI is the only native entrypoint."""
    guard = FixtureTransport(transport, uuid.uuid4().hex)
    source, managed, rollback = guard.names
    cut = vt.OfflineVolumeTransfer(guard, {'cutover': [(source, managed)]})
    back = vt.OfflineVolumeTransfer(guard, {'rollback': [(managed, rollback)]})
    probe = vt.OfflineVolumeTransfer(guard, {'cutover': [(source, managed)]})
    probe.phase, probe.volumes = 'fixture', set(guard.names)
    probe.deadline = time.monotonic() + 300
    receipt = {'status': 'fail', 'gate': 'native-fixture-rejected',
               'production_cutover': False, 'cleanup_verified': False}
    interrupted = False
    try:
        vt.require(vt.PG_IMAGE == PIN, 'native-image-drift')
        listed = set(probe._run('volume', 'ls', '--quiet').decode('ascii').split())
        vt.require(not listed.intersection(guard.names), 'native-collision')
        probe._run('volume', 'create', '--driver', 'local',
                   '--label', vt.OWNER_LABEL + '=' + probe.owner,
                   '--label', vt.PHASE_LABEL + '=fixture', source)
        write_fixture(probe, source, SEED)
        initial = expected()
        vt.require(cut.transfer('cutover') == (initial,), 'native-copy-proof')
        write_fixture(probe, managed, LATEST)
        current = expected(latest=True)
        vt.require(probe._helper(managed, manifest=True) == current
                   and probe._helper(source, manifest=True) == initial, 'native-latestwrite')
        vt.require(back.transfer('rollback') == (current,), 'native-rollback-proof')
        vt.require(probe._helper(source, manifest=True) == initial
                   and probe._helper(managed, manifest=True) == current
                   and probe._helper(rollback, manifest=True) == current, 'native-final-proof')
        receipt.update(status='pass', gate='isolated-native-volume-transfer',
                       evidence={'copy': initial, 'rollback': current,
                                 'latestwrite': True, 'metadata': True})
    except NativeInterrupted:
        interrupted = True
    except Exception:
        pass  # Never expose Docker output, paths, payloads, resource names or exceptions.
    finally:
        # A first signal may arrive during cleanup itself. Retry once after its
        # unwind; subsequent signals are ignored by the installed handler.
        for attempt in range(2):
            try:
                guard.cleanup()
                receipt['cleanup_verified'] = True
                break
            except NativeInterrupted:
                interrupted = True
                if attempt == 1:
                    receipt.update(status='fail', gate='native-fixture-cleanup-failed')
                    receipt.pop('evidence', None)
            except Exception:
                receipt.update(status='fail', gate='native-fixture-cleanup-failed')
                receipt.pop('evidence', None)
                break
        if interrupted or (interruption is not None and interruption['interrupted']):
            reject_interrupted(receipt)
    return receipt


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-native-fixtures', action='store_true')
    args = parser.parse_args(argv)
    if not args.run_native_fixtures or sys.platform != 'linux' or os.geteuid() != 0:
        result = {'status': 'fail', 'gate': 'native-optin-linux-root-required',
                  'production_cutover': False, 'cleanup_verified': False}
    else:
        state = {'interrupted': False, 'restoring': False}
        try:
            with interruption_handlers(state):
                with tempfile.TemporaryDirectory(prefix='kan140-native-config-') as config:
                    result = rehearse(vt.DockerProcess(config), interruption=state)
        except (Exception, NativeInterrupted):
            result = {'status': 'fail', 'gate': 'native-fixture-rejected',
                      'production_cutover': False, 'cleanup_verified': False}
        if state['interrupted']:
            reject_interrupted(result)
    print(json.dumps(result, sort_keys=True))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
