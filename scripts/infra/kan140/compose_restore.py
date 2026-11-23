"""Opt-in, programmatic Compose backend for the isolated KAN133 restore gate.

No CLI, downloader, installer, cutover or canonical configuration changes.
The operator wrapper supplies decrypted root input and owns the lease/signals.
"""
import importlib.util
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import stat
import time
import select
import subprocess
import tarfile
import uuid


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).resolve().parent.parent / "kan133" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


restore = _load("kan140_parent_restore", "restore.py")
data_snapshot = _load("kan140_data_snapshot", "data_snapshot.py")
require = restore.require
ROLES = ("postgres", "redis", "evolution")
LIMITS = {"postgres": ("0.50", "512m"), "redis": ("0.30", "384m"),
          "evolution": ("0.75", "1536m")}


def encode(value):
    """Escape literal Compose values, including nested JS template expressions."""
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [encode(item) for item in value]
    if isinstance(value, dict):
        return {key: encode(item) for key, item in value.items()}
    return value


def tar_manifest(stream, deadline):
    class Bounded:
        remaining = 72 * 1024 * 1024

        def read(self, size):
            require(time.monotonic() < deadline and size > 0, 'session-hash-timeout')
            value = stream.read(min(size, 1024 * 1024, self.remaining + 1))
            self.remaining -= len(value)
            require(self.remaining >= 0, 'session-snapshot-limit')
            return value

    source = Bounded()
    manifest, names, entries, total = [], set(), 0, 0
    with tarfile.open(fileobj=source, mode='r|') as archive:
        for member in archive:
            entries += 1
            require(entries <= 10000 and time.monotonic() < deadline, 'session-snapshot-limit')
            require(len(member.name.encode()) <= 4096 and member.name not in names,
                    'session-snapshot-name')
            names.add(member.name)
            require(member.isdir() or member.isfile(), 'session-snapshot-file')
            if member.isdir():
                continue
            total += member.size
            require(0 <= member.size <= 64 * 1024 * 1024 and total <= 64 * 1024 * 1024,
                    'session-snapshot-limit')
            digest = hashlib.sha256()
            file = archive.extractfile(member)
            size = 0
            while True:
                require(time.monotonic() < deadline, 'session-hash-timeout')
                chunk = file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                digest.update(chunk)
            require(size == member.size, 'session-snapshot-truncated')
            manifest.append([member.name, digest.hexdigest()])
    # Finish consuming the bounded pipe before waiting for the Docker CLI.
    while source.read(65536):
        pass
    return sorted(manifest)


class ComposeValidator(restore.Validator):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Keep the parent's owner prefix, labels, resource registry and cleanup.
        self.project = "kan140-rehearsal-" + uuid.uuid4().hex
        self.definitions = {}
        self.compose_file = None
        self.snapshot_calls = 0

    def _bind(self, source):
        path = Path(source)
        require(path.is_absolute() and "$" not in str(path), "compose-bind-path")
        try:
            for component in (path, *path.parents):
                info = component.lstat()
                require(not stat.S_ISLNK(info.st_mode), "compose-bind-symlink")
                require(stat.S_ISREG(info.st_mode) if component == path else
                        stat.S_ISDIR(info.st_mode), "compose-bind-type")
                if component == path:
                    require(info.st_nlink == 1, "compose-bind-hardlink")
                if os.name == "posix":
                    require(info.st_uid == 0 and not info.st_mode & 0o022,
                            "compose-bind-trust")
        except OSError:
            raise restore.GateError("compose-bind-missing") from None
        return str(path)

    def _private_json(self, document):
        path = self.temp / ("compose-" + uuid.uuid4().hex + ".json")
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(document, stream)
        return path

    def create_container(self, service, entrypoint, env, mounts, command):
        require(service in ROLES, "compose-service")
        require(("network", self.network) in self.resources, "compose-unowned-network")
        name = self.containers[service]
        self.resources.append(("container", name))
        volumes = []
        for source, target, readonly in mounts:
            if readonly:
                volumes.append({"type": "bind", "source": self._bind(source),
                                "target": target, "read_only": True,
                                "bind": {"create_host_path": False}})
            else:
                require(("volume", source) in self.resources and
                        source == self.owner + "-" + service + "-data",
                        "compose-unowned-volume")
                volumes.append({"type": "volume", "source": source, "target": target,
                                "volume": {"nocopy": True}})
        cpus, memory = LIMITS[service]
        self.definitions[service] = {
            "image": self.services[service]["image"], "container_name": name,
            "labels": {restore.LABEL: self.owner}, "entrypoint": encode([entrypoint]),
            "command": encode(command), "environment": encode(env),
            "volumes": volumes, "networks": {"isolated": {"aliases": [service]}},
            "dns": ["127.0.0.1"], "cpus": cpus, "mem_limit": memory,
            "memswap_limit": memory, "pids_limit": 256, "cap_drop": ["NET_RAW"],
            "security_opt": ["no-new-privileges:true"], "privileged": False,
            "restart": "no", "logging": {"driver": "none"},
            "healthcheck": {"disable": True}, "pull_policy": "never"}
        # Each version is immutable: Redis recreation must persist its AOF command.
        declared = {mount["source"]: {"external": True, "name": mount["source"]}
                    for definition in self.definitions.values()
                    for mount in definition["volumes"] if mount["type"] == "volume"}
        document = {"services": self.definitions, "volumes": declared,
                    "networks": {"isolated": {"external": True, "name": self.network}}}
        self.compose_file = self._private_json(document)
        empty_env = self.temp / "compose-empty.env"
        if not empty_env.exists():
            fd = os.open(empty_env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(fd)
        self.docker("compose", "--project-name", self.project, "--file", str(self.compose_file),
                    "--env-file", str(empty_env), "create", "--no-build", "--pull", "never", service)

    def pg_exec(self, sql):
        return self.output("exec", "-i", self.containers["postgres"], "sh", "-ec",
                           'export PGPASSWORD="$(cat /run/secrets/pg_admin_password)"; '
                           'exec psql -h 127.0.0.1 -U evolution_admin -d evolution '
                           '-X -qAt -v ON_ERROR_STOP=1', stdin=sql.encode())

    def fingerprint(self):
        try:
            return data_snapshot.collect(self.pg_exec)
        except data_snapshot.SnapshotError:
            raise restore.GateError("postgres-data-fingerprint-rejected") from None

    def pg_snapshot(self):
        # Parent calls before Evolution and after its real API checks. Quiesce
        # the second sample, including nontransactional sequence state.
        if self.snapshot_calls:
            self.evidence["evolution_dependencies"] = self.dependency_proof()
            self.docker("stop", "--time", "3", self.containers["evolution"])
        snapshot = super().pg_snapshot()
        snapshot["data_snapshot"] = self.fingerprint()
        self.snapshot_calls += 1
        return snapshot

    def dependency_proof(self):
        container = json.loads(self.output("container", "inspect", self.containers["evolution"]))[0]
        networks = container["NetworkSettings"]["Networks"]
        require(set(networks) == {self.network}, "compose-dependency-network")
        try:
            address = ipaddress.ip_address(networks[self.network]["IPAddress"])
        except (ValueError, KeyError, TypeError):
            raise restore.GateError("compose-dependency-address") from None
        require(not address.is_loopback and not address.is_unspecified and not address.is_multicast,
                "compose-dependency-address")

        def connected():
            # ipaddress serialization admits no SQL delimiters. Admin queries
            # originate at loopback; completed EVO_CHECK probes have closed.
            raw = self.pg_exec("SELECT count(*) FROM pg_stat_activity WHERE "
                               "datname='evolution' AND usename='evolution' AND "
                               f"client_addr='{address}'::inet;").strip()
            require(raw.isascii() and raw.isdecimal() and len(raw) <= 6,
                    "compose-dependency-postgres-result")
            postgres = int(raw)
            redis = 0
            for line in self.redis("CLIENT", "LIST").splitlines():
                fields = dict(part.split("=", 1) for part in line.split() if "=" in part)
                if not fields.get("cmd") or fields["cmd"].lower() == "ping":
                    continue
                try:
                    host, port = fields.get("addr", "").rsplit(":", 1)
                    peer = ipaddress.ip_address(host.strip("[]"))
                    if port.isdecimal() and peer == address:
                        redis += 1
                except ValueError:
                    continue
            require(postgres > 0 and redis > 0, "compose-evolution-dependencies-unproven")
            return {"postgres_connections": postgres, "redis_non_ping_connections": redis,
                    "verified": True}

        return self.poll(connected, "compose-evolution-dependencies-unproven")

    def isolation(self):
        super().isolation()
        listed = self.output("container", "ls", "--all", "--quiet", "--no-trunc",
                             "--filter", "label=com.docker.compose.project=" + self.project)
        ids = set()
        for role, name in self.containers.items():
            container = json.loads(self.output("container", "inspect", name))[0]
            host, config = container["HostConfig"], container["Config"]
            labels = config.get("Labels", {})
            require(labels.get("com.docker.compose.project") == self.project and
                    labels.get("com.docker.compose.service") == role and
                    labels.get("com.docker.compose.oneoff") == "False" and
                    labels.get(restore.LABEL) == self.owner and
                    container["Name"] == "/" + name and
                    config["Image"] == self.services[role]["image"], "compose-identity")
            cpu, memory = LIMITS[role]
            require(host.get("NanoCpus") == int(float(cpu) * 10**9) and
                    host.get("Memory") == int(memory[:-1]) * 1024**2 and
                    host.get("MemorySwap") == host["Memory"] and host.get("PidsLimit") == 256 and
                    host.get("CapDrop") in (["NET_RAW"], ["CAP_NET_RAW"]) and not host.get("CapAdd") and
                    "no-new-privileges:true" in host.get("SecurityOpt", []) and
                    host.get("RestartPolicy", {}).get("Name") == "no" and
                    host.get("LogConfig", {}).get("Type") == "none", "compose-security")
            expected = {(m["type"], m["source"], m["target"], not m.get("read_only", False))
                        for m in self.definitions[role]["volumes"]}
            actual = {(m["Type"], m.get("Name") if m["Type"] == "volume" else m["Source"],
                       m["Destination"], m["RW"]) for m in container["Mounts"]}
            require(actual == expected, "compose-mounts")
            ids.add(container["Id"])
        require(set(listed.split()) == ids, "compose-project-containers")

    def session_manifest(self):
        deadline = min(self.work_end, time.monotonic() + 20)
        command = ['docker', '--host', 'unix:///var/run/docker.sock', '--config', str(self.temp),
                   'cp', self.containers['evolution'] + ':/evolution/instances/.', '-']
        env = {k: v for k, v in os.environ.items() if not k.startswith('DOCKER_')}
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, env=env)
        class Pipe:
            def read(self, size):
                remaining = deadline - time.monotonic()
                require(remaining > 0 and select.select([process.stdout], [], [], remaining)[0],
                        'session-hash-timeout')
                return os.read(process.stdout.fileno(), size)
        try:
            manifest = tar_manifest(Pipe(), deadline)
            require(process.wait(timeout=max(0.1, deadline - time.monotonic())) == 0,
                    'session-snapshot-command')
            return manifest
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)

    def validate(self):
        super().validate()
        self.stage = "compose-restart-integrity"
        baseline = self.fingerprint()  # Evolution was quiesced by pg_snapshot.
        session_baseline = self.session_manifest()
        canary = self.owner + ":canary"
        value = self.redis("GET", canary)
        redis_baseline = self.redis_snapshot(canary)
        for role in ("postgres", "redis"):
            self.docker("restart", "--time", "3", self.containers[role])
        self.poll(lambda: self.pg("SELECT 1;"))
        self.poll(lambda: require(self.redis("PING") == "PONG", "redis-readiness"))
        require(self.fingerprint() == baseline, "compose-storage-restart-data-mismatch")
        require(self.redis_snapshot(canary) == redis_baseline and self.redis("GET", canary) == value and
                "aof_enabled:1" in self.redis("INFO", "persistence"), "compose-redis-restart-data-mismatch")
        self.docker("start", self.containers["evolution"])
        self.poll(lambda: json.loads(self.output("exec", self.containers["evolution"], "node",
                                                "-e", restore.EVO_CHECK, canary, value)))
        self.evidence["evolution_dependencies_after_restart"] = self.dependency_proof()
        self.docker("stop", "--time", "3", self.containers["evolution"])
        require(self.session_manifest() == session_baseline, 'compose-session-volume-restart-mismatch')
        final = self.fingerprint()
        require(final == baseline, "compose-application-restart-data-mismatch")
        self.isolation()
        self.evidence.update(backend="compose", production_migration=False,
                             postgres_data_snapshot=final,
                             postgres_baseline="pre-evolution-start; parent-counts-schema-sessions-plus-semantic-rows-sequences",
                             compose_restart_baseline="post-application-quiesced-observation",
                             compose_restart_verified=True)
        self.evidence['session_volume_restart_verified'] = True


Validator = ComposeValidator
