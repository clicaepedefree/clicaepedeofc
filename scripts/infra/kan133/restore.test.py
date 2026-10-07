#!/usr/bin/env python3
"""Stdlib tests. No Docker daemon, VPS, production data or secrets accessed."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("kan133_restore", Path(__file__).with_name("restore.py"))
restore = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(restore)


def result(stdout=b"", code=0, stderr=b""):
    return subprocess.CompletedProcess([], code, stdout, stderr)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "postgres.dump").write_bytes(b"PGDMP-test-not-real")
        (self.root / "redis.rdb").write_bytes(b"REDIS0011-test-not-real")
        (self.root / "evolution-instances").mkdir()
        (self.root / "config" / "evolution-qa" / "secrets").mkdir(parents=True)
        for name in restore.SECRET_NAMES:
            path = self.root / "config" / "evolution-qa" / "secrets" / restore.SECRET_FILES[name]
            path.write_text("TEST_ONLY_NOT_A_REAL_SECRET_" + name + "\n")
            path.chmod(0o600)

    def contract(self, relative="config/evolution-qa/secrets"):
        # Linux ownership is exercised separately so fixtures run on Windows too.
        with patch.object(restore.sys, "platform", "win32"):
            return restore.input_contract(self.root, relative, time.monotonic() + 5)

    def test_expected_decrypted_contract(self):
        root, secrets = self.contract()
        self.assertEqual(root, self.root.resolve())
        self.assertEqual(set(secrets), set(restore.SECRET_NAMES))

    def test_missing_backup_rejected(self):
        (self.root / "redis.rdb").unlink()
        with self.assertRaisesRegex(restore.GateError, "backup-file-missing"):
            self.contract()

    def test_wrong_dump_format_rejected(self):
        (self.root / "postgres.dump").write_bytes(b"encrypted-not-a-dump")
        with self.assertRaisesRegex(restore.GateError, "backup-format"):
            self.contract()

    def test_missing_session_directory_rejected(self):
        (self.root / "evolution-instances").rmdir()
        with self.assertRaisesRegex(restore.GateError, "backup-directory-missing"):
            self.contract()

    def test_secret_directory_cannot_escape(self):
        for relative in ("../secrets", str(self.root.resolve())):
            with self.assertRaisesRegex(restore.GateError, "secret-path-outside-input"):
                self.contract(relative)

    def test_extracted_etc_secret_mapping_supported(self):
        target = self.root / "config" / "etc" / "clicaepede" / "evolution-qa"
        target.mkdir(parents=True)
        (self.root / "config" / "evolution-qa" / "secrets").rename(target / "secrets")
        self.assertEqual(len(self.contract("config/etc/clicaepede/evolution-qa/secrets")[1]), 4)

    def test_empty_short_multiline_secrets_fail_closed(self):
        path = self.root / "config" / "evolution-qa" / "secrets" / "api"
        for value in ("", "short", "x" * 32 + "\ny" * 32):
            path.write_text(value)
            with self.assertRaisesRegex(restore.GateError, "secret-format"):
                self.contract()

    def test_symlink_and_hardlink_rejected(self):
        source = self.root / "redis.rdb"
        alias = self.root / "linked.rdb"
        os.link(source, alias)
        with self.assertRaisesRegex(restore.GateError, "input-hardlink"):
            self.contract()
        alias.unlink()
        try:
            alias.symlink_to(source)
        except OSError:
            self.skipTest("Creating symlinks requires an OS privilege")
        with self.assertRaisesRegex(restore.GateError, "input-symlink-or-special-file"):
            self.contract()

    @unittest.skipUnless(restore.sys.platform == "linux" and os.geteuid() == 0,
                         "Actual Linux root permissions test")
    def test_world_readable_secret_rejected(self):
        (self.root / "config" / "evolution-qa" / "secrets" / "api").chmod(0o644)
        with self.assertRaisesRegex(restore.GateError, "secret-not-private-root-owned"):
            restore.input_contract(self.root, "config/evolution-qa/secrets", time.monotonic() + 5)


class DockerPolicyTests(unittest.TestCase):
    def setUp(self):
        self.validator = restore.Validator("unused")
        self.validator.temp = Path("private-runtime")
        self.validator.services = restore.stack_contract()

    def test_images_are_existing_kan132_digest_pins(self):
        self.assertTrue(self.validator.services["postgres"]["image"].startswith("postgres:17.11-bookworm@sha256:"))
        for service in self.validator.services.values():
            self.assertRegex(service["image"], r"@sha256:[a-f0-9]{64}$")

    def test_container_policy_no_ports_proxy_or_extra_network(self):
        with patch.object(self.validator, "docker", return_value=result()) as docker:
            for service in self.validator.containers:
                self.validator.create_container(service, "sh", {}, [], ["-c", "true"])
        for call in docker.call_args_list:
            args = list(call.args)
            self.assertEqual(args.count("--network"), 1)
            self.assertEqual(args[args.index("--network") + 1], self.validator.network)
            for flag in ("--cpus", "--memory", "--memory-swap", "--pids-limit", "--security-opt"):
                self.assertIn(flag, args)
            self.assertEqual(args[args.index("--pull") + 1], "never")
            self.assertEqual(args[args.index("--log-driver") + 1], "none")
            for forbidden in ("-p", "--publish", "--publish-all", "--privileged", "host", "easypanel", "proxy"):
                self.assertNotIn(forbidden, args)
            self.assertNotIn("/var/run/docker.sock", " ".join(args))

    def test_local_daemon_and_no_environment_redirect(self):
        with patch.dict(os.environ, {"DOCKER_HOST": "tcp://outside:2375", "DOCKER_CONTEXT": "prod"}), \
                patch.object(restore.subprocess, "run", return_value=result()) as run:
            self.validator.docker("version")
        args, kwargs = run.call_args
        self.assertEqual(args[0][1:3], ["--host", "unix:///var/run/docker.sock"])
        self.assertNotIn("DOCKER_HOST", kwargs["env"])
        self.assertNotIn("DOCKER_CONTEXT", kwargs["env"])
        self.assertLessEqual(kwargs["timeout"], 20)

    def test_subprocess_failure_diagnostics_never_escape(self):
        with patch.object(restore.subprocess, "run", return_value=result(b"TOKEN-SECRET", 1, b"TOKEN-SECRET")):
            with self.assertRaisesRegex(restore.GateError, "^docker-command-failed$"):
                self.validator.docker("version")

    def test_deadline_prevents_any_new_command(self):
        self.validator.work_end = time.monotonic() - 1
        with patch.object(restore.subprocess, "run") as run:
            with self.assertRaisesRegex(restore.GateError, "restore-timeout"):
                self.validator.docker("version")
            run.assert_not_called()

    def test_redis_initial_boot_does_not_ignore_rdb_for_aof(self):
        self.assertIn("'appendonly no'", restore.REDIS_START)
        self.assertNotIn("'appendonly yes'", restore.REDIS_START)
        self.assertIn("'save \"\"'", restore.REDIS_START)

    def test_evolution_start_never_migrates_or_logs_secret(self):
        self.assertIn("npm run db:generate", restore.EVO_START)
        self.assertNotIn("db:deploy", restore.EVO_START)
        self.assertNotIn("deploy_database.sh", restore.EVO_START)
        self.assertIn("stdio:'ignore'", restore.EVO_START)
        self.assertIn("encodeURIComponent", restore.EVO_START)
        self.assertIn("/proc/net/route", restore.EVO_START)

    @unittest.skipUnless(shutil.which("node"), "Node executable unavailable")
    def test_embedded_node_scripts_parse(self):
        for script in (restore.EVO_START, restore.EVO_CHECK, restore.VOLUME_CHECK):
            process = subprocess.run([shutil.which("node"), "--check"], input=script.encode(),
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
            self.assertEqual(process.returncode, 0, process.stderr.decode())

    def test_unique_ownership_per_invocation(self):
        another = restore.Validator("unused")
        self.assertNotEqual(self.validator.owner, another.owner)
        self.assertNotEqual(self.validator.network, another.network)

    def test_no_platform_or_privilege_bypass(self):
        with patch.object(restore.sys, "platform", "win32"):
            output = restore.Validator("unused").run()
        self.assertEqual(output["gate"], "linux-root-required")
        self.assertTrue(output["cleanup_verified"])
        self.assertEqual(output["status"], "fail")


class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.validator = restore.Validator("unused")
        self.network = {"Internal": True, "Driver": "bridge", "Containers": {}, "Options": {
            "com.docker.network.bridge.gateway_mode_ipv4": "isolated",
            "com.docker.network.bridge.gateway_mode_ipv6": "isolated"}}
        self.container = {"Id": "owned", "HostConfig": {"NetworkMode": self.validator.network,
            "Memory": 1, "NanoCpus": 1, "PidsLimit": 256, "Dns": ["127.0.0.1"]},
            "NetworkSettings": {"Networks": {self.validator.network: {}}}}

    def run_isolation(self):
        def output(kind, *_args):
            return json.dumps([self.network if kind == "network" else self.container])
        with patch.object(self.validator, "output", side_effect=output):
            self.validator.isolation()

    def test_safe_configuration(self):
        self.run_isolation()

    def test_egress_network_rejected(self):
        for field, value in (("Internal", False), ("Driver", "overlay"), ("Options", {})):
            with self.subTest(field=field):
                old = self.network[field]
                self.network[field] = value
                with self.assertRaisesRegex(restore.GateError, "network-not-isolated"):
                    self.run_isolation()
                self.network[field] = old

    def test_published_ports_privileged_or_external_dns_rejected(self):
        for field, value in (("PortBindings", {"8080/tcp": [{"HostPort": "8080"}]}),
                             ("PublishAllPorts", True), ("Privileged", True), ("Dns", ["8.8.8.8"]),
                             ("Memory", 0), ("NanoCpus", 0), ("PidsLimit", 0)):
            with self.subTest(field=field):
                host = self.container["HostConfig"]
                old = host.get(field)
                host[field] = value
                with self.assertRaisesRegex(restore.GateError, "container-isolation-or-caps"):
                    self.run_isolation()
                host[field] = old

    def test_second_network_and_foreign_endpoint_rejected(self):
        self.container["NetworkSettings"]["Networks"]["easypanel"] = {}
        with self.assertRaises(restore.GateError):
            self.run_isolation()
        del self.container["NetworkSettings"]["Networks"]["easypanel"]
        self.network["Containers"] = {"foreign": {}}
        with self.assertRaisesRegex(restore.GateError, "foreign-network-endpoint"):
            self.run_isolation()


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.validator = restore.Validator("unused")
        self.calls = []

    def fake_docker(self, kind, operation, *args, **kwargs):
        self.calls.append((kind, operation, args, kwargs))
        if operation == "inspect":
            labels = {restore.LABEL: self.validator.owner}
            body = {"Config": {"Labels": labels}} if kind == "container" else {"Labels": labels}
            return result(json.dumps([body]).encode())
        return result()

    def test_partial_create_failure_cleaned_and_only_registered_resources(self):
        def validate():
            self.validator.resources.extend([("network", self.validator.network),
                ("volume", self.validator.owner + "-data"),
                ("container", self.validator.containers["postgres"])])
            raise restore.GateError("partial-create-test")
        with patch.object(self.validator, "validate", side_effect=validate), \
                patch.object(self.validator, "docker", side_effect=self.fake_docker):
            output = self.validator.run()
        self.assertEqual(output["status"], "fail")
        self.assertTrue(output["cleanup_verified"])
        removed = [(kind, args[-1]) for kind, operation, args, _ in self.calls if operation == "rm"]
        self.assertEqual(removed, list(reversed(self.validator.resources)))
        self.assertNotIn("prune", repr(self.calls))

    def test_ownership_mismatch_never_removed(self):
        self.validator.resources = [("container", self.validator.containers["postgres"])]
        with patch.object(self.validator, "docker", return_value=result(b'[{"Config":{"Labels":{}}}]')) as docker:
            self.assertFalse(self.validator.cleanup())
        self.assertEqual(len(docker.call_args_list), 1)

    def test_cleanup_failure_overrides_success(self):
        with patch.object(self.validator, "validate"), patch.object(self.validator, "cleanup", return_value=False):
            output = self.validator.run()
        self.assertEqual(output["status"], "fail")
        self.assertEqual(output["gate"], "cleanup-failed")

    def test_unexpected_error_does_not_print_payload_and_always_cleans(self):
        with patch.object(self.validator, "validate", side_effect=ValueError("TOKEN-SECRET")), \
                patch.object(self.validator, "cleanup", return_value=True) as cleanup:
            output = self.validator.run()
        cleanup.assert_called_once()
        self.assertNotIn("TOKEN-SECRET", json.dumps(output))
        self.assertEqual(output["status"], "fail")

    def test_timeout_and_interrupt_always_cleanup(self):
        for error in (restore.GateError("restore-timeout"), KeyboardInterrupt()):
            with patch.object(self.validator, "validate", side_effect=error), \
                    patch.object(self.validator, "cleanup", return_value=True) as cleanup:
                self.assertEqual(self.validator.run()["status"], "fail")
                cleanup.assert_called_once()

    def test_missing_resources_are_safe_but_daemon_failure_is_not(self):
        self.validator.resources = [("network", self.validator.network)]
        with patch.object(self.validator, "docker", return_value=result(code=1, stderr=b"Error: No such network")):
            self.assertTrue(self.validator.cleanup())
        with patch.object(self.validator, "docker", return_value=result(code=1, stderr=b"daemon unavailable")):
            self.assertFalse(self.validator.cleanup())

    def test_evolution_gate_cannot_be_reported_as_pass(self):
        self.validator.work_end = time.monotonic() + 0.001
        with patch.object(self.validator, "validate", side_effect=lambda: self.validator.poll(
                lambda: restore.require(False, "not-ready"), "evolution-api-or-restored-session-gate-failed")), \
                patch.object(self.validator, "cleanup", return_value=True):
            output = self.validator.run()
        self.assertEqual(output["status"], "fail")
        self.assertEqual(output["gate"], "evolution-api-or-restored-session-gate-failed")


class OrchestrationTests(Fixture):
    """Fake daemon exercises the complete restore/cleanup order, not live proof."""

    def setUp(self):
        super().setUp()
        stack = self.root / "config" / "kan132" / "stack.yaml"
        stack.parent.mkdir()
        source = restore.trusted_stack_path()
        self.trusted_source = source
        stack.write_text(source.read_text())
        self.validator = restore.Validator(self.root)
        self.calls = []
        self.aof = False
        self.key = self.value = None
        self.app_superuser = False
        self.api_failure = False
        self.redis_corruption = False
        self.session_mutated = False
        self.snapshot_calls = 0

    def daemon(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if args[0] == "version":
            return result(b'{"Version":"28.5.0"}')
        if args[0] in ("network", "volume", "container") and args[1] == "inspect":
            labels = {restore.LABEL: self.validator.owner}
            return result(json.dumps([{"Config": {"Labels": labels}, "Labels": labels}]).encode())
        if args[0] == "exec" and restore.VOLUME_CHECK in args:
            return result(b"[]")
        if args[0] == "exec" and restore.EVO_CHECK in args:
            if self.api_failure:
                raise restore.GateError("docker-command-failed")
            return result(json.dumps({"instances": 1, "sessions": 1, "instance_hash": "a" * 64}).encode())
        return result()

    def pg(self, sql, app=False):
        return "f" if app and self.app_superuser else "t" if app else "1"

    def snapshot(self):
        self.snapshot_calls += 1
        return {"tables": 4, "rows": 4, "counts": {"NEVER_PRINT_TABLE_SECRET": 1},
                "schema_hash": "a" * 64,
                "session_hash": "b" * 32 if self.snapshot_calls == 1 or not self.session_mutated else "c" * 32}

    def redis(self, *args):
        self.calls.append((("redis-cli", *args), {}))
        if args == ("PING",):
            return "PONG"
        if args == ("INFO", "persistence"):
            return f"aof_enabled:{int(self.aof)}\nloading:0\naof_rewrite_in_progress:0\naof_rewrite_scheduled:0\naof_last_bgrewrite_status:ok\naof_last_write_status:ok\naof_current_size:100"
        if args == ("INFO", "keyspace"):
            return "db0:keys=2,expires=0,avg_ttl=0\ndb2:keys=1,expires=0,avg_ttl=0"
        if args[0] == "DBSIZE":
            return "3" if self.key else "2"
        if args[0] == "SET":
            _, self.key, self.value, _ = args
            return "OK"
        if args[0] == "GET":
            return "corrupt" if self.redis_corruption else self.value
        if args[:3] == ("CONFIG", "SET", "appendonly"):
            self.aof = True
            return "OK"
        if args[:2] == ("CONFIG", "REWRITE"):
            return "OK"
        if "EVAL" in args:
            return json.dumps([1, "a" * 40])
        raise AssertionError("Unexpected fake Redis command")

    def execute(self):
        contract = restore.input_contract
        cleanup = self.validator.cleanup
        def portable_cleanup():
            # Windows cannot unlink read-only binds; Linux root can. This fixture
            # adapts only the fake runtime directory, not production semantics.
            if os.name == "nt" and self.validator.temp:
                for path in self.validator.temp.iterdir():
                    path.chmod(0o600)
            return cleanup()
        def mapped(root, relative, deadline):
            with patch.object(restore.sys, "platform", "win32"):
                return contract(root, relative, deadline)
        with patch.object(restore.sys, "platform", "linux"), \
                patch.object(restore.os, "geteuid", return_value=0, create=True), \
                patch.object(restore, "trusted_stack_path", return_value=self.trusted_source), \
                patch.object(restore, "input_contract", side_effect=mapped), \
                patch.object(self.validator, "docker", side_effect=self.daemon), \
                patch.object(self.validator, "isolation"), \
                patch.object(self.validator, "pg", side_effect=self.pg), \
                patch.object(self.validator, "pg_snapshot", side_effect=self.snapshot), \
                patch.object(self.validator, "redis", side_effect=self.redis), \
                patch.object(self.validator, "cleanup", side_effect=portable_cleanup):
            if self.api_failure:
                original_poll = self.validator.poll
                def fast_poll(action, gate="restore-readiness-timeout"):
                    if gate.startswith("evolution"):
                        self.validator.work_end = time.monotonic() + 0.001
                    return original_poll(action, gate)
                with patch.object(self.validator, "poll", side_effect=fast_poll):
                    return self.validator.run()
            return self.validator.run()

    def test_full_order_and_safe_evidence(self):
        output = self.execute()
        self.assertEqual(output["status"], "pass", output)
        self.assertTrue(output["cleanup_verified"])
        self.assertNotIn("NEVER_PRINT_TABLE_SECRET", json.dumps(output))
        self.assertNotIn("TEST_ONLY_NOT_A_REAL_SECRET", repr(self.calls))
        commands = [args for args, _kwargs in self.calls]
        aof_index = commands.index(("redis-cli", "CONFIG", "SET", "appendonly", "yes"))
        rewrite_index = commands.index(("redis-cli", "CONFIG", "REWRITE"))
        redis_starts = [i for i, args in enumerate(commands) if args == ("start", self.validator.containers["redis"])]
        self.assertLess(redis_starts[0], aof_index)
        self.assertLess(aof_index, rewrite_index)
        self.assertLess(rewrite_index, redis_starts[1])
        pg_restore = next(args for args in commands if "pg_restore" in args)
        for flag in ("--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--role=evolution"):
            self.assertIn(flag, pg_restore)
        self.assertEqual(set(output["evidence"]["redis_databases"]), {"0", "2"})
        self.assertFalse(self.validator.temp.exists())

    def test_canary_failure_never_launches_evolution(self):
        self.redis_corruption = True
        output = self.execute()
        self.assertEqual(output["gate"], "redis-aof-restart-canary")
        self.assertTrue(output["cleanup_verified"])
        self.assertNotIn(("start", self.validator.containers["evolution"]), [args for args, _ in self.calls])

    def test_superuser_role_fails_before_redis_start(self):
        self.app_superuser = True
        output = self.execute()
        self.assertEqual(output["gate"], "postgres-app-privileges")
        self.assertTrue(output["cleanup_verified"])
        self.assertNotIn(("start", self.validator.containers["redis"]), [args for args, _ in self.calls])

    def test_evolution_failure_returns_explicit_gate_and_cleans(self):
        self.api_failure = True
        output = self.execute()
        self.assertEqual(output["status"], "fail")
        self.assertEqual(output["gate"], "evolution-api-or-restored-session-gate-failed")
        self.assertTrue(output["cleanup_verified"])

    def test_evolution_cannot_mutate_restored_session_and_pass(self):
        self.session_mutated = True
        output = self.execute()
        self.assertEqual(output["gate"], "evolution-mutated-restored-schema-or-sessions")
        self.assertTrue(output["cleanup_verified"])

    def test_restored_stack_pin_changes_rejected(self):
        path = self.root / "config" / "kan132" / "stack.yaml"
        stack = json.loads(path.read_text())
        stack["services"]["redis"]["image"] = "redis:7.4.11-alpine@sha256:" + "0" * 64
        path.write_text(json.dumps(stack))
        output = self.execute()
        self.assertEqual(output["gate"], "restored-image-pin-mismatch")
        self.assertEqual(self.calls, [])

    def test_restored_stack_cannot_add_secret_env_or_node_preload(self):
        path = self.root / "config" / "kan132" / "stack.yaml"
        stack = json.loads(path.read_text())
        stack["services"]["evolution"]["environment"]["NODE_OPTIONS"] = "--require=/backup/malicious.js"
        path.write_text(json.dumps(stack))
        self.assertEqual(self.execute()["gate"], "restored-evolution-config-mismatch")

    def test_malformed_restored_stack_fails_clearly(self):
        (self.root / "config" / "kan132" / "stack.yaml").write_text("invalid-json")
        self.assertEqual(self.execute()["gate"], "restored-stack-format")


class TrustAnchorTests(unittest.TestCase):
    def info(self, mode=0o644, uid=0, links=1):
        from types import SimpleNamespace
        return SimpleNamespace(st_mode=restore.stat.S_IFREG | mode, st_uid=uid,
                               st_nlink=links, st_size=100)

    def check(self, unsafe=None):
        path = restore.CANONICAL_STACK
        def lstat(component):
            if unsafe and component == unsafe[0]:
                return unsafe[1]
            info = self.info()
            if component != path:
                info.st_mode = restore.stat.S_IFDIR | 0o755
            return info
        with patch.object(restore.sys, "platform", "linux"), patch.object(Path, "lstat", lstat):
            return restore.trusted_stack_path()

    def test_fixed_root_owned_reference_accepted(self):
        self.assertEqual(self.check(), Path("/opt/clicaepede/kan132/stack.yaml"))

    def test_file_group_write_foreign_owner_or_hardlink_rejected(self):
        for info in (self.info(mode=0o664), self.info(uid=1000), self.info(links=2)):
            with self.assertRaises(restore.GateError):
                self.check((restore.CANONICAL_STACK, info))

    def test_symlink_or_writable_ancestor_rejected(self):
        for mode in (restore.stat.S_IFLNK | 0o755, restore.stat.S_IFDIR | 0o777):
            info = self.info()
            info.st_mode = mode
            with self.assertRaises(restore.GateError):
                self.check((restore.CANONICAL_STACK.parent, info))

    def test_missing_reference_returns_controlled_gate(self):
        with patch.object(restore.sys, "platform", "linux"), \
                patch.object(Path, "lstat", side_effect=FileNotFoundError("private path")):
            with self.assertRaisesRegex(restore.GateError, "^trusted-stack-missing$"):
                restore.trusted_stack_path()


if __name__ == "__main__":
    unittest.main()
