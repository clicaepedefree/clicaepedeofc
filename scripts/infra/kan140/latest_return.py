"""Isolated latest-data return; requires the upgraded canonical recovery lease.

build_validator(compose.ComposeValidator, compose.restore, volume_transfer)
returns a subclass. The root wrapper must hold backup.lock and provide
validator.latest_return_lease with assert_recoverable(owner) and
register(owner, kind, name). Both must return True only after durable registration
accepted by the SAME SIGKILL recovery implementation. Without the upgraded
installed recovery this extension FAILS CLOSED before synthetic writes.
An in-memory resources append or an owner-prefix match is NOT that integration.

The wrapper owns any opt-in deadline extension. This module never changes
MAX_SECONDS, end, or work_end and keeps the parent's cleanup reserve intact.
"""
import copy
import hashlib
import io
import json
import re
import tarfile
import time
import uuid


ROLES = ("postgres", "redis", "evolution")
TARGETS = {"postgres": "/var/lib/postgresql/data", "redis": "/data",
           "evolution": "/evolution/instances"}


def build_validator(baseComposeValidator, restoreModule, transferModule):
    restore, transfer = restoreModule, transferModule
    require = restore.require

    class LeaseTransport:
        def __init__(self, validator, pairs):
            self.validator = validator
            self.sources = {source for source, _ in pairs}
            self.targets = {target for _, target in pairs}
            self.helpers = set()
            self.transport = transfer.DockerProcess(validator.temp)

        def execute(self, args, deadline, consumer=None):
            args = list(args)
            v = self.validator
            cleanup = args[:2] in (["container", "inspect"], ["container", "rm"]) and args[-1] in self.helpers
            deadline = min(deadline, v.end if cleanup else v.work_end)
            require(time.monotonic() < deadline, "latest-return-timeout")
            if args[:2] in (["volume", "create"], ["container", "create"]):
                kind = args[0]
                name = args[-1] if kind == "volume" else args[args.index("--name") + 1]
                if kind == "volume":
                    require(name in self.targets, "latest-return-volume-policy")
                else:
                    require(re.fullmatch(r"kan140-transfer-[a-f0-9]{32}-[a-f0-9]{32}", name),
                            "latest-return-helper-policy")
                    mounts = [args[i + 1] for i, arg in enumerate(args) if arg == "--mount"]
                    for mount in mounts:
                        fields = dict(field.split("=", 1) for field in mount.split(",") if "=" in field)
                        require(fields.get("source") in self.sources | self.targets,
                                "latest-return-helper-volume")
                    self.helpers.add(name)
                v._register_return_resource(kind, name)
                args[2:2] = ["--label", restore.LABEL + "=" + v.owner]
            if args[:2] == ["container", "rm"]:
                name = args[-1]
                require(name in self.helpers, "latest-return-helper-unregistered")
                v._owned("container", name, cleanup=True)
            return self.transport.execute(args, deadline, consumer)

    class LatestReturnValidator(baseComposeValidator):
        def _lease(self):
            lease = getattr(self, "latest_return_lease", None)
            require(lease is not None and callable(getattr(lease, "register", None)) and
                    callable(getattr(lease, "assert_recoverable", None)),
                    "latest-return-canonical-lease-unavailable")
            require(lease.assert_recoverable(self.owner) is True,
                    "latest-return-canonical-lease-unavailable")
            return lease

        def _register_return_resource(self, kind, name):
            lease = self._lease()
            require(lease.register(self.owner, kind, name) is True,
                    "latest-return-lease-registration")
            # Recreated containers must be cleaned before their NEW volumes.
            self.resources[:] = [item for item in self.resources if item != (kind, name)]
            self.resources.append((kind, name))

        def _owned(self, kind, name, *, cleanup=False):
            require((kind, name) in self.resources, "latest-return-unregistered")
            rows = json.loads(self.output(kind, "inspect", name, cleanup=cleanup))
            require(isinstance(rows, list) and len(rows) == 1, "latest-return-inspect")
            item = rows[0]
            labels = item.get("Config", {}).get("Labels", {}) if kind == "container" else item.get("Labels", {})
            require(item.get("Name") == ("/" + name if kind == "container" else name) and
                    labels.get(restore.LABEL) == self.owner, "latest-return-ownership")
            return item

        def _states(self, active):
            self.isolation()
            for role in ROLES:
                item = self._owned("container", self.containers[role])
                state = item["State"]
                require(state["Running"] is (role in active) and state["Restarting"] is False and
                        not state.get("Paused", False) and
                        item["HostConfig"]["RestartPolicy"]["Name"] == "no",
                        "latest-return-service-state")

        def _source_pairs(self):
            require(re.fullmatch(r"kan133-restore-[a-f0-9]{32}", self.owner),
                    "latest-return-owner")
            pairs = []
            for role in ROLES:
                mounts = [m for m in self.definitions[role]["volumes"] if m["type"] == "volume"]
                require(len(mounts) == 1 and mounts[0]["target"] == TARGETS[role] and
                        mounts[0]["source"] == self.owner + "-" + role + "-data" and
                        not mounts[0].get("read_only", False), "latest-return-source-volume")
                source = mounts[0]["source"]
                volume = self._owned("volume", source)
                require(volume["Driver"] == "local" and volume.get("Scope") == "local" and
                        not volume.get("Options"), "latest-return-source-driver")
                pairs.append((source, self.owner + "-return-" + uuid.uuid4().hex))
            return tuple(pairs)

        def _write_latest(self):
            nonce = uuid.uuid4().hex
            table = "kan140_return_" + nonce
            # Plain CREATE (not IF NOT EXISTS) also fences a collision after the check.
            require(self.pg_exec("SELECT to_regclass('public." + table + "') IS NULL;").strip() == "t",
                    "latest-return-table-collision")
            self.pg_exec("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'; "
                         f"CREATE TABLE public.{table} (nonce text PRIMARY KEY); "
                         f"INSERT INTO public.{table} VALUES ('{nonce}'); "
                         f"ALTER TABLE public.{table} OWNER TO evolution; COMMIT;")
            key = self.owner + ":latest-return:" + nonce
            require(self.redis("SET", key, nonce, "NX") == "OK", "latest-return-key-collision")
            filename = "kan140-return-" + nonce + ".txt"
            require(not any(row[0].lstrip("./") == filename for row in self.session_manifest()),
                    "latest-return-file-collision")
            payload = ("kan140-latest-return:" + nonce + "\n").encode("ascii")
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode="w", format=tarfile.USTAR_FORMAT) as stream:
                member = tarfile.TarInfo(filename)
                member.size, member.mode, member.uid, member.gid = len(payload), 0o644, 0, 0
                stream.addfile(member, io.BytesIO(payload))
            self._states({"postgres", "redis"})
            self.docker("cp", "-", self.containers["evolution"] + ":/evolution/instances/",
                        stdin=archive.getvalue())
            manifest = self.session_manifest()
            require(any(row[0].lstrip("./") == filename and row[1] == hashlib.sha256(payload).hexdigest()
                        for row in manifest), "latest-return-file-write")
            self._latest_canary = (table, key, nonce)
            return manifest

        def _snapshot(self):
            # Parent excludes one DB0 key; never exclude an existing empty key.
            marker = self.owner + ":absent-snapshot-marker:" + uuid.uuid4().hex
            require(self.redis("EXISTS", marker) == "0", "latest-return-snapshot-marker")
            postgres = self.fingerprint()
            redis = self.redis_snapshot(marker)
            require(self.redis("EXISTS", marker) == "0", "latest-return-snapshot-marker")
            return {"postgres": postgres, "redis": redis, "sessions": self.session_manifest()}

        def _compare(self, baseline):
            current = self._snapshot()
            for key in ("postgres", "redis", "sessions"):
                require(current[key] == baseline[key], "latest-return-" + key + "-mismatch")
            table, key, nonce = self._latest_canary
            require(self.pg_exec(f"SELECT nonce FROM public.{table};").strip() == nonce,
                    "latest-return-postgres-canary")
            require(self.redis("GET", key) == nonce and
                    "aof_enabled:1" in self.redis("INFO", "persistence"),
                    "latest-return-redis-canary")

        def _api_proof(self):
            _, key, nonce = self._latest_canary
            def ready():
                try:
                    proof = json.loads(self.output("exec", self.containers["evolution"],
                                                   "node", "-e", restore.EVO_CHECK, key, nonce))
                except (ValueError, TypeError):
                    raise restore.GateError("latest-return-api-result") from None
                expected = self.evidence["evolution"]
                require(isinstance(proof, dict) and
                        set(proof) == {"instances", "sessions", "instance_hash"} and
                        all(type(proof[k]) is int and proof[k] == expected[k]
                            for k in ("instances", "sessions")) and
                        isinstance(proof["instance_hash"], str) and
                        re.fullmatch(r"[a-f0-9]{64}", proof["instance_hash"]),
                        "latest-return-api-result")
                return {"verified": True}
            return self.poll(ready, "latest-return-api-unproven")

        def _recreate_return(self, pairs):
            replacements = dict(pairs)
            for _, target in pairs:
                self._owned("volume", target)
            definitions = copy.deepcopy(self.definitions)
            for role in ROLES:
                definition = definitions[role]
                require(definition["labels"].get(restore.LABEL) == self.owner and
                        definition["container_name"] == self.containers[role] and
                        definition["restart"] == "no", "latest-return-compose-identity")
                for mount in definition["volumes"]:
                    if mount["type"] == "volume":
                        mount["source"] = replacements[mount["source"]]
            # The source already escaped dollars. Do NOT encode a second time.
            document = {"services": definitions,
                        "volumes": {target: {"external": True, "name": target} for _, target in pairs},
                        "networks": {"isolated": {"external": True, "name": self.network}}}
            path = self._private_json(document)
            for role in ROLES:
                self._owned("container", self.containers[role])
                self.docker("container", "rm", self.containers[role])  # No -v; preserve old volumes.
            self.definitions, self.compose_file = definitions, path
            for role in ROLES:
                self._register_return_resource("container", self.containers[role])
                self.docker("compose", "--project-name", self.project, "--file", str(path),
                            "--env-file", str(self.temp / "compose-empty.env"), "create",
                            "--no-build", "--pull", "never", role)
            self._states(set())

        def validate(self):
            super().validate()
            self.stage = "latest-data-return"
            self._lease()
            require(self.work_end <= self.end - 30 and time.monotonic() < self.work_end,
                    "latest-return-budget")
            self._states({"postgres", "redis"})
            pairs = self._source_pairs()
            self._write_latest()
            baseline = self._snapshot()
            for role in ROLES:
                self.docker("stop", "--time", "3", self.containers[role])
            self._states(set())
            transport = LeaseTransport(self, pairs)
            remaining = self.work_end - time.monotonic()
            require(remaining > 0, "latest-return-timeout")
            try:
                proof = transfer.OfflineVolumeTransfer(transport, {"rollback": pairs},
                                                       timeout=min(900, remaining)).transfer("rollback")
            except transfer.TransferError:
                raise restore.GateError("latest-return-volume-transfer") from None
            require(len(proof) == 3, "latest-return-volume-proof")
            self._recreate_return(pairs)
            for role in ("postgres", "redis"):
                self.docker("start", self.containers[role])
            self.poll(lambda: require(self.pg("SELECT 1;") == "1", "latest-return-pg-ready"))
            self.poll(lambda: require(self.redis("PING") == "PONG", "latest-return-redis-ready"))
            self._states({"postgres", "redis"})
            self._compare(baseline)
            # Same exact EVO_START source (no migration and no default route).
            self.docker("start", self.containers["evolution"])
            api = self._api_proof()  # Recheck HTTP auth and restored sessions AFTER volume replacement.
            require(api.get("verified") is True, "latest-return-api-unproven")
            dependencies = self.dependency_proof()  # Real app PG/Redis, no connect/send/QR API.
            self.docker("stop", "--time", "3", self.containers["evolution"])
            self._states({"postgres", "redis"})
            self._compare(baseline)
            self.evidence.update(latest_data_return_verified=True,
                                 latest_return_api_verified=True,
                                 latest_return_volume_manifests=proof,
                                 latest_return_dependencies=dependencies,
                                 latest_return_session_verified=True,
                                 latest_return_redis_verified=True,
                                 latest_return_postgres_verified=True,
                                 latest_return_old_volumes_preserved=True,
                                 postgres_data_snapshot=baseline["postgres"],
                                 postgres_baseline="latest-synthetic-writes-before-offline-return",
                                 latest_return_redis_snapshot=baseline["redis"],
                                 latest_return_session_manifest=baseline["sessions"])

    return LatestReturnValidator
