"""Offline latest-return contracts, separate from opt-in native acceptance."""
import ast
import copy
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


latest = load("latest_return", "latest_return.py")
compose = load("latest_return_compose", "compose_restore.py")
transfer = load("latest_return_transfer", "volume_transfer.py")
Validator = latest.build_validator(compose.ComposeValidator, compose.restore, transfer)


class Contracts(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.v = Validator(Path(self.directory.name))
        self.v.temp = Path(self.directory.name)
        self.v.latest_return_lease = Mock(spec=["assert_recoverable", "register"])
        self.v.latest_return_lease.assert_recoverable.return_value = True
        self.v.latest_return_lease.register.return_value = True

    def definitions(self):
        v = self.v
        v.definitions = {}
        for role in latest.ROLES:
            source = v.owner + "-" + role + "-data"
            v.resources.extend([("container", v.containers[role]), ("volume", source)])
            v.definitions[role] = {"container_name": v.containers[role], "restart": "no",
                                   "labels": {compose.restore.LABEL: v.owner},
                                   "command": ["-e", "literal $$x"], "dns": ["127.0.0.1"],
                                   "environment": {"FOO": "$${literal}"},
                                   "volumes": [{"type": "volume", "source": source,
                                                "target": latest.TARGETS[role]},
                                               {"type": "bind", "source": "/private/secret",
                                                "target": "/run/secrets/test", "read_only": True}]}

    def test_subclass_deadlines_and_cleanup_unchanged(self):
        self.assertIsInstance(self.v, compose.ComposeValidator)
        self.assertIs(Validator.cleanup, compose.restore.Validator.cleanup)
        self.assertEqual(compose.restore.MAX_SECONDS, 200)
        self.assertLessEqual(self.v.work_end, self.v.end - 30)

    def test_v1_recovery_allowlist_stays_strict_without_registered_extras(self):
        path = Path(__file__).parent.parent / "kan133" / "restore-recover.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "Recovery")
        method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "expected")
        namespace = {"SERVICES": latest.ROLES}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(path), "exec"), namespace)
        r = Mock()
        r.owner = self.v.owner
        r.extra = {"container": set(), "volume": set()}
        self.assertNotIn(self.v.owner + "-return-" + "a" * 32, namespace["expected"](r, "volume"))
        self.assertNotIn("kan140-transfer-" + "a" * 32 + "-" + "b" * 32,
                         namespace["expected"](r, "container"))

    def test_missing_or_rejected_lease_blocks_after_parent_before_writes(self):
        for lease in (None, Mock(assert_recoverable=Mock(return_value=False))):
            with self.subTest(lease=lease):
                self.v.latest_return_lease = lease
                self.v._write_latest = Mock()
                with patch.object(compose.ComposeValidator, "validate") as parent:
                    with self.assertRaisesRegex(compose.restore.GateError, "canonical-lease-unavailable"):
                        self.v.validate()
                parent.assert_called_once()
                self.v._write_latest.assert_not_called()
                self.assertNotIn("latest_data_return_verified", self.v.evidence)

    def test_registration_failure_has_no_in_memory_ownership(self):
        self.v.latest_return_lease.register.return_value = False
        with self.assertRaisesRegex(compose.restore.GateError, "lease-registration"):
            self.v._register_return_resource("volume", "fixture")
        self.assertNotIn(("volume", "fixture"), self.v.resources)

    def test_recreated_container_cleanup_precedes_new_volume(self):
        name = self.v.containers["postgres"]
        self.v.resources.extend([("container", name), ("volume", "fresh")])
        self.v._register_return_resource("container", name)
        self.assertEqual(list(reversed(self.v.resources)),
                         [("container", name), ("volume", "fresh")])

    def test_label_without_registry_and_prefix_without_label_rejected(self):
        name = self.v.owner + "-postgres"
        self.v.output = Mock(return_value=json.dumps([{"Name": "/" + name,
                                                       "Config": {"Labels": {}}}]))
        with self.assertRaisesRegex(compose.restore.GateError, "unregistered"):
            self.v._owned("container", name)
        self.v.resources.append(("container", name))
        with self.assertRaisesRegex(compose.restore.GateError, "ownership"):
            self.v._owned("container", name)

    def test_source_policy_uuid_and_no_production_mapping(self):
        self.definitions()
        self.v._owned = Mock(return_value={"Driver": "local", "Scope": "local", "Options": {}})
        first, second = self.v._source_pairs(), self.v._source_pairs()
        self.assertTrue(set(t for _, t in first).isdisjoint(t for _, t in second))
        for role, (source, target) in zip(latest.ROLES, first):
            self.assertEqual(source, self.v.owner + "-" + role + "-data")
            self.assertRegex(target, "^" + self.v.owner + r"-return-[a-f0-9]{32}$")
        self.v.definitions["postgres"]["volumes"][0]["source"] = "production"
        with self.assertRaisesRegex(compose.restore.GateError, "source-volume"):
            self.v._source_pairs()

    def test_recreate_uses_native_compose_preserves_source_and_secrets(self):
        self.definitions()
        old = copy.deepcopy(self.v.definitions)
        pairs = tuple((self.v.owner + "-" + role + "-data", "fresh-" + role)
                      for role in latest.ROLES)
        self.v._owned = Mock()
        self.v._states = Mock()
        self.v.docker = Mock()
        self.v.create_container = Mock(side_effect=AssertionError("restricted create called"))
        self.v._recreate_return(pairs)
        document = json.loads(self.v.compose_file.read_text())
        self.assertEqual(document["networks"]["isolated"]["name"], self.v.network)
        calls = self.v.docker.call_args_list
        self.assertEqual(len(calls), 6)
        for index, role in enumerate(latest.ROLES):
            expected = copy.deepcopy(old[role])
            expected["volumes"][0]["source"] = "fresh-" + role
            self.assertEqual(document["services"][role], expected)
            self.assertEqual(self.v.definitions[role], expected)
            self.assertEqual(calls[index].args, ("container", "rm", self.v.containers[role]))
            self.assertEqual(calls[index + 3].args[-5:],
                             ("create", "--no-build", "--pull", "never", role))
        self.v.create_container.assert_not_called()
        for source, _ in pairs:
            self.assertIn(("volume", source), self.v.resources)

    def test_canary_freshness_tar_and_no_secret_payload(self):
        self.v.pg_exec = Mock(side_effect=["t", ""])
        self.v.redis = Mock(return_value="OK")
        manifests = [[], [["kan140-return-" + "a" * 32 + ".txt", latest.hashlib.sha256(
            ("kan140-latest-return:" + "a" * 32 + "\n").encode()).hexdigest()]]]
        self.v.session_manifest = Mock(side_effect=manifests)
        self.v._states = Mock()
        self.v.docker = Mock()
        with patch.object(latest.uuid, "uuid4", return_value=Mock(hex="a" * 32)):
            self.v._write_latest()
        sql = self.v.pg_exec.call_args.args[0]
        self.assertIn("CREATE TABLE public.kan140_return_" + "a" * 32, sql)
        self.assertNotIn("IF NOT EXISTS", sql)
        self.assertEqual(self.v.redis.call_args.args[-1], "NX")
        call = self.v.docker.call_args
        self.assertEqual(call.args[:2], ("cp", "-"))
        with tarfile.open(fileobj=io.BytesIO(call.kwargs["stdin"])) as archive:
            self.assertEqual(len(archive.getmembers()), 1)
            self.assertEqual(archive.extractfile(archive.getmembers()[0]).read(),
                             ("kan140-latest-return:" + "a" * 32 + "\n").encode())

    def test_pg_collision_prevents_all_canary_writes(self):
        self.v.pg_exec = Mock(return_value="f")
        self.v.redis = Mock()
        self.v.docker = Mock()
        with self.assertRaisesRegex(compose.restore.GateError, "table-collision"):
            self.v._write_latest()
        self.assertEqual(self.v.pg_exec.call_count, 1)
        self.v.redis.assert_not_called()
        self.v.docker.assert_not_called()

    def test_post_return_api_checks_auth_and_same_sessions_not_only_connections(self):
        self.v._latest_canary = ('fixture-table', 'fixture-key', 'fixture-nonce')
        self.v.evidence['evolution'] = {'instances': 1, 'sessions': 1}
        proof = {'instances': 1, 'sessions': 1, 'instance_hash': 'a' * 64}
        self.v.output = Mock(return_value=json.dumps(proof))
        self.v.poll = lambda action, gate: action()
        self.assertEqual(self.v._api_proof(), {'verified': True})
        args = self.v.output.call_args.args
        self.assertEqual(args, ('exec', self.v.containers['evolution'], 'node', '-e',
                                compose.restore.EVO_CHECK, 'fixture-key', 'fixture-nonce'))
        for bad in ('not-json', json.dumps(dict(proof, sessions=0)),
                    json.dumps(dict(proof, instances=True)), json.dumps({'verified': True})):
            self.v.output.return_value = bad
            with self.subTest(bad=bad), self.assertRaises(compose.restore.GateError):
                self.v._api_proof()

    def test_redis_collision_prevents_session_write(self):
        self.v.pg_exec = Mock(side_effect=["t", ""])
        self.v.redis = Mock(return_value="")
        self.v.docker = Mock()
        with self.assertRaisesRegex(compose.restore.GateError, "key-collision"):
            self.v._write_latest()
        self.v.docker.assert_not_called()

    def test_service_gate_rejects_running_evolution_or_auto_restart(self):
        self.v.isolation = Mock()
        for wrong_role, wrong_state, restart in (("evolution", True, "no"),
                                                   ("postgres", True, "always")):
            def owned(kind, name):
                role = next(r for r in latest.ROLES if name == self.v.containers[r])
                return {"State": {"Running": wrong_state if role == wrong_role else role != "evolution",
                                  "Restarting": False},
                        "HostConfig": {"RestartPolicy": {"Name": restart if role == wrong_role else "no"}}}
            self.v._owned = owned
            with self.assertRaisesRegex(compose.restore.GateError, "service-state"):
                self.v._states({"postgres", "redis"})

    def test_transport_labels_register_before_create_and_checks_removal(self):
        self.definitions()
        pairs = tuple((self.v.owner + "-" + r + "-data", "fresh-" + r) for r in latest.ROLES)
        self.v._states = Mock()
        self.v._source_pairs = Mock(return_value=pairs)
        self.v._write_latest = Mock()
        self.v._snapshot = Mock(return_value={"postgres": "latest", "redis": "all", "sessions": []})
        self.v.docker = Mock()
        self.v._recreate_return = Mock()
        self.v.poll = Mock()
        self.v._compare = Mock()
        self.v._api_proof = Mock(return_value={"verified": True})
        self.v.dependency_proof = Mock(return_value={"verified": True})
        self.v._owned = Mock()
        backend = Mock()
        helper = "kan140-transfer-" + "a" * 32 + "-" + "b" * 32
        deadline = self.v.work_end
        observed = []

        def execute(args, end, consumer=None):
            observed.append(tuple(args))
            if list(args[:2]) in (["volume", "create"], ["container", "create"]):
                kind = args[0]
                name = args[-1] if kind == "volume" else args[args.index("--name") + 1]
                self.assertIn((kind, name), self.v.resources)
                self.v.latest_return_lease.register.assert_any_call(self.v.owner, kind, name)
                self.assertIn(compose.restore.LABEL + "=" + self.v.owner, args)
            cleanup = list(args[:2]) in (["container", "inspect"], ["container", "rm"])
            self.assertLessEqual(end, self.v.end if cleanup else self.v.work_end)
            return b""
        backend.execute.side_effect = execute

        def operation(wrapped, policy, timeout):
            self.assertEqual(policy, {"rollback": pairs})
            self.assertLessEqual(timeout, 200)
            def run(phase):
                wrapped.execute(("volume", "create", "--label", "transfer=nonce", "fresh-postgres"), deadline)
                wrapped.execute(("container", "create", "--name", helper, "--mount",
                                 "type=volume,source=" + pairs[0][0] + ",target=/source,readonly",
                                 "image", "-ec", "fixed"), deadline)
                work_end = self.v.work_end
                self.v.work_end = 0  # Helpers still get the independent cleanup reserve.
                wrapped.execute(("container", "inspect", helper), latest.time.monotonic() + 5)
                self.v._owned.side_effect = compose.restore.GateError("latest-return-ownership")
                with self.assertRaisesRegex(compose.restore.GateError, "ownership"):
                    wrapped.execute(("container", "rm", "--force", helper), latest.time.monotonic() + 5)
                self.v._owned.side_effect = None
                wrapped.execute(("container", "rm", "--force", helper), latest.time.monotonic() + 5)
                self.v._owned.assert_called_with("container", helper, cleanup=True)
                self.v.work_end = work_end
                self.v.latest_return_lease.register.return_value = False
                count = len(observed)
                with self.assertRaisesRegex(compose.restore.GateError, "lease-registration"):
                    wrapped.execute(("volume", "create", "fresh-redis"), deadline)
                self.assertEqual(len(observed), count)
                self.v.latest_return_lease.register.return_value = True
                with self.assertRaisesRegex(compose.restore.GateError, "volume-policy"):
                    wrapped.execute(("volume", "create", "production"), deadline)
                with self.assertRaisesRegex(compose.restore.GateError, "helper-volume"):
                    wrapped.execute(("container", "create", "--name", helper, "--mount",
                                     "type=volume,source=production,target=/source", "image"), deadline)
                return ({"digest": "a"},) * 3
            return Mock(transfer=run)

        with patch.object(compose.ComposeValidator, "validate"), \
                patch.object(transfer, "DockerProcess", return_value=backend), \
                patch.object(transfer, "OfflineVolumeTransfer", side_effect=operation):
            self.v.validate()
        self.assertEqual(len(observed), 4)

    def test_insufficient_cleanup_reserve_blocks_before_writes(self):
        self.v.work_end = self.v.end - 1
        self.v._write_latest = Mock()
        with patch.object(compose.ComposeValidator, "validate"):
            with self.assertRaisesRegex(compose.restore.GateError, "budget"):
                self.v.validate()
        self.v._write_latest.assert_not_called()

    def test_all_semantic_mismatches_fail(self):
        baseline = {"postgres": {"hash": "a"}, "redis": {"0": [1, "hash"]}, "sessions": []}
        for key in baseline:
            current = copy.deepcopy(baseline)
            current[key] = "changed"
            self.v._snapshot = Mock(return_value=current)
            with self.assertRaisesRegex(compose.restore.GateError, key + "-mismatch"):
                self.v._compare(baseline)

    def test_snapshot_excludes_only_proven_absent_key_includes_canaries_and_empty_key(self):
        self.v.redis = Mock(return_value="0")
        self.v.fingerprint = Mock(return_value="pg-with-canary")
        self.v.redis_snapshot = Mock(return_value="all-keys")
        self.v.session_manifest = Mock(return_value=[])
        snapshot = self.v._snapshot()
        marker = self.v.redis_snapshot.call_args.args[0]
        self.assertRegex(marker, "^" + self.v.owner + r":absent-snapshot-marker:[a-f0-9]{32}$")
        self.assertEqual(self.v.redis.call_args_list[0].args, ("EXISTS", marker))
        self.assertEqual(self.v.redis.call_args_list[1].args, ("EXISTS", marker))
        self.assertEqual(snapshot["postgres"], "pg-with-canary")
        self.assertEqual(snapshot["redis"], "all-keys")
        for results in (["1"], ["0", "1"]):
            self.v.redis.side_effect = results
            with self.assertRaisesRegex(compose.restore.GateError, "snapshot-marker"):
                self.v._snapshot()

    def test_orchestration_faults_never_publish_pass(self):
        self.definitions()
        self.v._states = Mock()
        pairs = tuple((self.v.owner + "-" + r + "-data", "fresh-" + r) for r in latest.ROLES)
        self.v._source_pairs = Mock(return_value=pairs)
        self.v._write_latest = Mock()
        self.v._snapshot = Mock(return_value={"postgres": "latest", "redis": "all", "sessions": []})
        self.v.docker = Mock()
        self.v._recreate_return = Mock()
        self.v.poll = Mock()
        self.v._compare = Mock()
        self.v._api_proof = Mock(return_value={"verified": True})
        self.v.dependency_proof = Mock(return_value={"verified": True})
        for fault in ("transfer", "compare", "api", "dependency", None):
            with self.subTest(fault=fault):
                self.v.evidence = {}
                self.v._compare.side_effect = compose.restore.GateError("mismatch") if fault == "compare" else None
                self.v._api_proof.side_effect = compose.restore.GateError("api") if fault == "api" else None
                self.v.dependency_proof.side_effect = compose.restore.GateError("dependency") if fault == "dependency" else None
                operation = Mock()
                operation.transfer.return_value = ({"digest": "a"},) * 3
                if fault == "transfer":
                    operation.transfer.side_effect = transfer.TransferError("fixture")
                with patch.object(compose.ComposeValidator, "validate"), \
                        patch.object(transfer, "OfflineVolumeTransfer", return_value=operation):
                    if fault:
                        with self.assertRaises(compose.restore.GateError):
                            self.v.validate()
                        self.assertNotIn("latest_data_return_verified", self.v.evidence)
                    else:
                        self.v.validate()
                        self.assertTrue(self.v.evidence["latest_data_return_verified"])
                        self.assertEqual(self.v.evidence["postgres_data_snapshot"], "latest")
                        args = self.v.docker.call_args_list
                        self.assertFalse(any("restart" in c.args or "exec" in c.args for c in args))


if __name__ == "__main__":
    unittest.main()
