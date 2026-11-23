"""Fake Docker contracts only: no daemon, network, credentials or live data."""
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import tarfile
import time
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("compose_restore", Path(__file__).with_name("compose_restore.py"))
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)


class FakeValidator(adapter.ComposeValidator):
    def docker(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if getattr(self, "fail_create", False) and args[0] == "compose":
            raise adapter.restore.GateError("docker-command-failed")
        return subprocess.CompletedProcess(args, 0, b"", b"")


class Contracts(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.validator = FakeValidator(self.root)
        self.validator.temp = self.root
        self.validator.calls = []
        self.validator.services = {role: {"image": role + ":test@sha256:" + "a" * 64}
                                   for role in adapter.ROLES}
        self.validator.resources.append(("network", self.validator.network))
        for role in adapter.ROLES:
            self.validator.resources.append(("volume", self.volume(role)))

    def volume(self, role):
        return self.validator.owner + "-" + role + "-data"

    def create(self, role="redis", command=None):
        self.validator.create_container(role, "/bin/sh", {"LITERAL": "${UNCHANGED}-$x-$(id)-$$"},
                                        [(self.volume(role), "/data", False)],
                                        command or ["-ec", adapter.restore.REDIS_START])
        return json.loads(self.validator.compose_file.read_text())

    def test_opt_in_contract_and_recovery_owner(self):
        self.assertIs(adapter.Validator, adapter.ComposeValidator)
        self.assertIsInstance(self.validator, adapter.restore.Validator)
        self.assertTrue(self.validator.owner.startswith("kan133-restore-"))
        other = FakeValidator(self.root)
        self.assertNotEqual(other.project, self.validator.project)

    def test_compose_command_and_external_only_source(self):
        document = self.create()
        args = self.validator.calls[-1][0]
        self.assertEqual(args, ("compose", "--project-name", self.validator.project,
                               "--file", str(self.validator.compose_file), "--env-file",
                               str(self.root / "compose-empty.env"), "create", "--no-build",
                               "--pull", "never", "redis"))
        self.assertEqual(document["networks"], {"isolated": {"external": True,
                                                           "name": self.validator.network}})
        self.assertEqual(document["volumes"], {self.volume("redis"): {
            "external": True, "name": self.volume("redis")}})
        service = document["services"]["redis"]
        self.assertEqual(service["container_name"], self.validator.containers["redis"])
        self.assertEqual(service["image"], self.validator.services["redis"]["image"])
        self.assertEqual(service["dns"], ["127.0.0.1"])
        self.assertEqual(service["cap_drop"], ["NET_RAW"])
        self.assertEqual(service["security_opt"], ["no-new-privileges:true"])
        self.assertFalse(service["privileged"])
        self.assertEqual(service["restart"], "no")
        self.assertEqual(service["logging"], {"driver": "none"})
        self.assertEqual(service["memswap_limit"], service["mem_limit"])
        self.assertEqual(service["pids_limit"], 256)
        for forbidden in ("ports", "env_file", "depends_on", "build", "configs", "secrets"):
            self.assertNotIn(forbidden, service)
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(self.validator.compose_file.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((self.root / "compose-empty.env").stat().st_mode), 0o600)

    def test_all_startup_dollars_literal_once(self):
        for startup in (adapter.restore.EVO_START, adapter.restore.REDIS_START):
            document = self.create(command=["-e", startup])
            source = document["services"]["redis"]
            self.assertEqual(source["command"][1], startup.replace("$", "$$"))
            self.assertEqual(source["command"][1].replace("$$", "$"), startup)
            self.assertEqual(source["environment"]["LITERAL"], "$${UNCHANGED}-$$x-$$(id)-$$$$")
        self.assertEqual(adapter.encode({"key": ["${x}", 1]}), {"key": ["$${x}", 1]})

    def test_redis_recreation_keeps_aof_source_and_other_roles(self):
        self.create("evolution", ["-e", adapter.restore.EVO_START])
        initial = self.create()
        initial_file = self.validator.compose_file
        final = self.create(command=["redis-server", "/data/restore.conf"])
        self.assertNotEqual(initial_file, self.validator.compose_file)
        self.assertEqual(json.loads(initial_file.read_text()), initial)
        self.assertEqual(final["services"]["redis"]["command"], ["redis-server", "/data/restore.conf"])
        self.assertEqual(final["services"]["evolution"], initial["services"]["evolution"])
        self.assertEqual(set(final["volumes"]), {self.volume("redis"), self.volume("evolution")})

    def test_creation_failure_registered_before_docker(self):
        self.validator.fail_create = True
        with self.assertRaises(adapter.restore.GateError):
            self.create()
        self.assertIn(("container", self.validator.containers["redis"]), self.validator.resources)
        self.assertTrue(self.validator.compose_file.is_file())
        self.assertIs(adapter.ComposeValidator.cleanup, adapter.restore.Validator.cleanup)

    def test_foreign_volume_and_network_rejected(self):
        with self.assertRaisesRegex(adapter.restore.GateError, "compose-unowned-volume"):
            self.validator.create_container("redis", "sh", {}, [("live-data", "/data", False)], [])
        self.validator.resources.remove(("network", self.validator.network))
        with self.assertRaisesRegex(adapter.restore.GateError, "compose-unowned-network"):
            self.create()

    def test_supplied_bind_retained_no_host_path_creation(self):
        source = self.root / "mount-copy"
        source.touch(mode=0o444)
        # Linux /tmp fixtures have writable ancestors; trust is checked separately.
        with patch.object(self.validator, "_bind", return_value=str(source)) as trust:
            self.validator.create_container("redis", "sh", {}, [(source, "/run/input", True)], [])
        trust.assert_called_once_with(source)
        mount = json.loads(self.validator.compose_file.read_text())["services"]["redis"]["volumes"][0]
        self.assertEqual(mount, {"type": "bind", "source": str(source), "target": "/run/input",
                                 "read_only": True, "bind": {"create_host_path": False}})
        with self.assertRaisesRegex(adapter.restore.GateError, "compose-bind-missing"):
            self.validator._bind(self.root / "absent")
        with self.assertRaisesRegex(adapter.restore.GateError, "compose-bind-path"):
            self.validator._bind(self.root / "$HOST")

    def test_pg_exec_uses_private_runtime_file_and_psql_flags(self):
        self.validator.pg_exec("SELECT 1;")
        args, kwargs = self.validator.calls[-1]
        self.assertEqual(args[:5], ("exec", "-i", self.validator.containers["postgres"], "sh", "-ec"))
        self.assertIn("-X -qAt -v ON_ERROR_STOP=1", args[-1])
        self.assertIn("$(cat /run/secrets/pg_admin_password)", args[-1])
        self.assertEqual(kwargs, {"stdin": b"SELECT 1;"})

    def test_deep_snapshot_augments_original_before_and_after_start(self):
        original = {"counts": {"Instance": 1}, "schema_hash": "schema", "session_hash": "session"}
        deep = {"policy": "test", "tables": {}, "sequences": {}}
        with patch.object(adapter.restore.Validator, "pg_snapshot", return_value=original.copy()), \
                patch.object(self.validator, "fingerprint", return_value=deep), \
                patch.object(self.validator, "dependency_proof", return_value={"verified": True}):
            before = self.validator.pg_snapshot()
            self.assertEqual(self.validator.calls, [])
            after = self.validator.pg_snapshot()
        self.assertEqual(before, after)
        self.assertEqual(before["counts"], original["counts"])
        self.assertEqual(before["data_snapshot"], deep)
        self.assertEqual(self.validator.calls[0][0], ("stop", "--time", "3", self.validator.containers["evolution"]))

    def test_invalid_fingerprint_is_controlled_failure(self):
        with patch.object(adapter.data_snapshot, "collect", side_effect=adapter.data_snapshot.SnapshotError):
            with self.assertRaisesRegex(adapter.restore.GateError, "postgres-data-fingerprint-rejected"):
                self.validator.fingerprint()

    def dependency_fixture(self, address="172.30.0.4"):
        return json.dumps([{"NetworkSettings": {"Networks": {
            self.validator.network: {"IPAddress": address}}}}])

    def test_dependencies_attributed_to_evolution_not_loopback_or_ping(self):
        clients = ("addr=127.0.0.1:123 cmd=client|list\n"
                   "addr=172.30.0.4:124 cmd=ping\n"
                   "addr=172.30.0.4:125 cmd=get\n"
                   "addr=172.30.0.5:126 cmd=get\n")
        with patch.object(self.validator, "output", return_value=self.dependency_fixture()), \
                patch.object(self.validator, "pg_exec", return_value="2\n") as pg, \
                patch.object(self.validator, "redis", return_value=clients):
            proof = self.validator.dependency_proof()
        self.assertEqual(proof, {"verified": True, "postgres_connections": 2,
                                 "redis_non_ping_connections": 1})
        self.assertIn("client_addr='172.30.0.4'::inet", pg.call_args.args[0])
        self.assertNotIn("172.30.0.4", json.dumps(proof))

    def test_dependency_retry_rejects_probe_only_and_requires_pg(self):
        for count, clients in (("0", "addr=172.30.0.4:123 cmd=get"),
                               ("1", "addr=127.0.0.1:123 cmd=get\naddr=172.30.0.4:124 cmd=ping")):
            attempts = []

            def bounded_poll(action, gate):
                for _ in range(2):
                    try:
                        return action()
                    except adapter.restore.GateError:
                        attempts.append(gate)
                raise adapter.restore.GateError(gate)

            with patch.object(self.validator, "output", return_value=self.dependency_fixture()), \
                    patch.object(self.validator, "pg_exec", return_value=count), \
                    patch.object(self.validator, "redis", return_value=clients), \
                    patch.object(self.validator, "poll", side_effect=bounded_poll):
                with self.assertRaisesRegex(adapter.restore.GateError, "dependencies-unproven"):
                    self.validator.dependency_proof()
            self.assertEqual(len(attempts), 2)

    def test_dependency_address_injection_rejected_before_query(self):
        for address in ("127.0.0.1", "0.0.0.0", "172.30.0.4'; SELECT 1;--"):
            with patch.object(self.validator, "output", return_value=self.dependency_fixture(address)), \
                    patch.object(self.validator, "pg_exec") as pg:
                with self.assertRaisesRegex(adapter.restore.GateError, "compose-dependency-address"):
                    self.validator.dependency_proof()
                pg.assert_not_called()

    def test_restart_integrity_order_and_backend_evidence(self):
        deep = {"policy": "test", "tables": {}, "sequences": {}}

        def redis(*args):
            return {"GET": "canary-observation", "PING": "PONG", "INFO": "aof_enabled:1"}[args[0]]

        with patch.object(adapter.restore.Validator, "validate"), \
                patch.object(self.validator, "fingerprint", return_value=deep) as fingerprint, \
                patch.object(self.validator, "session_manifest", return_value=[]), \
                patch.object(self.validator, "redis", side_effect=redis), \
                patch.object(self.validator, "redis_snapshot", return_value={"0": [0, "hash"]}), \
                patch.object(self.validator, "pg", return_value="1"), \
                patch.object(self.validator, "output", return_value="{}"), \
                patch.object(self.validator, "dependency_proof", return_value={"verified": True}) as proof, \
                patch.object(self.validator, "isolation") as isolation:
            self.validator.validate()
        commands = [args for args, _ in self.validator.calls]
        self.assertEqual(commands, [("restart", "--time", "3", self.validator.containers["postgres"]),
                                    ("restart", "--time", "3", self.validator.containers["redis"]),
                                    ("start", self.validator.containers["evolution"]),
                                    ("stop", "--time", "3", self.validator.containers["evolution"])])
        self.assertEqual(fingerprint.call_count, 3)
        proof.assert_called_once()
        isolation.assert_called_once()
        self.assertEqual(self.validator.evidence["backend"], "compose")
        self.assertFalse(self.validator.evidence["production_migration"])
        self.assertEqual(self.validator.evidence["compose_restart_baseline"],
                         "post-application-quiesced-observation")

    def test_quiesced_session_manifest_detects_file_content_changes(self):
        def collect(value):
            raw = io.BytesIO()
            with tarfile.open(fileobj=raw, mode='w') as archive:
                entry = tarfile.TarInfo('fixture-session')
                entry.size = len(value)
                archive.addfile(entry, io.BytesIO(value))
            raw.seek(0)
            return adapter.tar_manifest(raw, time.monotonic() + 5)
        self.assertNotEqual(collect(b'fixture-first'), collect(b'fixture-second'))

    def test_tar_limits_file_size_before_reading_and_counts_directories(self):
        for directories in (False, True):
            raw = io.BytesIO()
            if directories:
                with tarfile.open(fileobj=raw, mode='w') as archive:
                    for n in range(10001):
                        entry = tarfile.TarInfo('fixture-' + str(n))
                        entry.type = tarfile.DIRTYPE
                        archive.addfile(entry)
            else:
                entry = tarfile.TarInfo('fixture-large')
                entry.size = 64 * 1024 * 1024 + 1
                raw.write(entry.tobuf() + b'\0' * 1024)
            raw.seek(0)
            with self.subTest(directories=directories), self.assertRaisesRegex(
                    adapter.restore.GateError, 'session-snapshot-limit'):
                adapter.tar_manifest(raw, time.monotonic() + 10)

    def test_restart_rejects_changed_session_volume(self):
        with patch.object(adapter.restore.Validator, 'validate'), \
                patch.object(self.validator, 'fingerprint', return_value={}), \
                patch.object(self.validator, 'session_manifest', side_effect=[[], [['fixture', 'changed']]]), \
                patch.object(self.validator, 'redis', side_effect=lambda *a: {'GET':'fixture','PING':'PONG','INFO':'aof_enabled:1'}[a[0]]), \
                patch.object(self.validator, 'redis_snapshot', return_value={}), \
                patch.object(self.validator, 'pg', return_value='1'), \
                patch.object(self.validator, 'output', return_value='{}'), \
                patch.object(self.validator, 'dependency_proof', return_value={'verified':True}), \
                self.assertRaisesRegex(adapter.restore.GateError, 'session-volume-restart-mismatch'):
            self.validator.validate()
        self.assertNotIn('compose_restart_verified', self.validator.evidence)

    def test_identity_isolation_rejects_foreign_project_and_mounts(self):
        for role in adapter.ROLES:
            self.create(role)
        containers = {}
        for role, name in self.validator.containers.items():
            definition = self.validator.definitions[role]
            cpus, memory = adapter.LIMITS[role]
            containers[name] = {
                "Id": role, "Name": "/" + name,
                "Config": {"Image": definition["image"], "Labels": {
                    adapter.restore.LABEL: self.validator.owner,
                    "com.docker.compose.project": self.validator.project,
                    "com.docker.compose.service": role, "com.docker.compose.oneoff": "False"}},
                "HostConfig": {"NanoCpus": int(float(cpus) * 10**9),
                               "Memory": int(memory[:-1]) * 1024**2,
                               "MemorySwap": int(memory[:-1]) * 1024**2, "PidsLimit": 256,
                               "CapDrop": ["NET_RAW"], "SecurityOpt": ["no-new-privileges:true"],
                               "RestartPolicy": {"Name": "no"}, "LogConfig": {"Type": "none"}},
                "Mounts": [{"Type": "volume", "Name": self.volume(role),
                            "Destination": "/data", "RW": True}]}

        def output(*args):
            return "\n".join(adapter.ROLES) if args[1] == "ls" else json.dumps([containers[args[-1]]])

        with patch.object(adapter.restore.Validator, "isolation"), \
                patch.object(self.validator, "output", side_effect=output):
            self.validator.isolation()
            container = containers[self.validator.containers["redis"]]
            container['HostConfig']['CapDrop'] = ['CAP_NET_RAW']
            self.validator.isolation()
            container['HostConfig']['CapDrop'] = []
            with self.assertRaisesRegex(adapter.restore.GateError, 'compose-security'):
                self.validator.isolation()
            container['HostConfig']['CapDrop'] = ['NET_RAW']
            container["Config"]["Labels"]["com.docker.compose.project"] = "foreign"
            with self.assertRaisesRegex(adapter.restore.GateError, "compose-identity"):
                self.validator.isolation()
            container["Config"]["Labels"]["com.docker.compose.project"] = self.validator.project
            container["Mounts"][0]["Name"] = "foreign-volume"
            with self.assertRaisesRegex(adapter.restore.GateError, "compose-mounts"):
                self.validator.isolation()


if __name__ == "__main__":
    unittest.main()
