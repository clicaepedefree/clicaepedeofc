#!/usr/bin/env python3
"""Offline restore gate, not a deployment or a backup/decryption worker.

Main supplies postgres.dump, redis.rdb, evolution-instances/ and config/ in an
already decrypted/extracted directory. Default secrets:
config/evolution-qa/secrets/{pg_admin,pg_app,redis,api}. Restored stack:
config/kan132/stack.yaml (JSON-compatible YAML, with exact KAN132 image pins).
--secrets-relative can map an extracted etc/clicaepede/evolution-qa/secrets tree.
Requires Linux root, local Docker >=28, and all pinned KAN132 images preloaded.
Main installs the root-owned canonical reference at
/opt/clicaepede/kan132/stack.yaml; neither it nor its ancestors may be writable
by group/others or symlinks. Script location does not select Linux trust anchors.
Only generated, labelled resources are deleted; no prune or production access.
Exit 0 = all gates passed AND cleanup confirmed; exit 1 = explicit gate failure.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid


LABEL = "clicaepede.kan133.restore"
SECRET_NAMES = ("pg_admin_password", "pg_app_password", "redis_password", "api_key")  # secret-scan: allow-test - file names, not values
SECRET_FILES = dict(zip(SECRET_NAMES, ("pg_admin", "pg_app", "redis", "api")))  # secret-scan: allow-test - file-name mapping
MAX_SECONDS = 200
WORK_SECONDS = 170
CANONICAL_STACK = Path("/opt/clicaepede/kan132/stack.yaml")


class GateError(Exception):
    """Only controlled codes, never subprocess output or credential material."""


def require(condition, code):
    if not condition:
        raise GateError(code)


def checked_tree(root, deadline):
    count = size = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        require(time.monotonic() < deadline, "input-timeout")
        for name in dirs + files:
            require(time.monotonic() < deadline, "input-timeout")
            info = (Path(directory) / name).lstat()
            require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode),
                    "input-symlink-or-special-file")
            require(not stat.S_ISREG(info.st_mode) or info.st_nlink == 1,
                    "input-hardlink")
            count += 1
            size += info.st_size
            require(count <= 100000 and size <= 8 * 1024**3, "input-size-limit")


def input_contract(root, secrets_relative, deadline):
    require(not root.is_symlink() and root.is_dir(), "input-directory")
    checked_tree(root, deadline)
    root = root.resolve()
    relative = Path(secrets_relative)
    require(not relative.is_absolute() and ".." not in relative.parts,
            "secret-path-outside-input")
    secret_dir = root / relative
    require(secret_dir.is_dir() and secret_dir.resolve().is_relative_to(root),
            "secret-directory")
    for name, header in (("postgres.dump", b"PGDMP"), ("redis.rdb", b"REDIS")):
        path = root / name
        require(path.is_file() and path.stat().st_size > len(header), "backup-file-missing")
        with path.open("rb") as source:
            require(source.read(len(header)) == header, "backup-format")
    for name in ("evolution-instances", "config"):
        require((root / name).is_dir(), "backup-directory-missing")
    secrets = {}
    for name in SECRET_NAMES:
        path = secret_dir / SECRET_FILES[name]
        require(path.is_file() and path.stat().st_size <= 4096, "secret-missing-or-size")
        info = path.stat()
        if sys.platform == "linux":
            require(info.st_uid == 0 and not info.st_mode & 0o077,
                    "secret-not-private-root-owned")
        value = path.read_text(encoding="utf-8").strip()
        # KAN132 secrets are high-entropy printable single-line values. Redis
        # config uses a quoted escaped literal; Evolution URL-encodes passwords.
        require(32 <= len(value) <= 1024 and all(32 < ord(c) < 127 for c in value),
                "secret-format")
        secrets[name] = value
    return root, secrets


def trusted_stack_path():
    if sys.platform != "linux":
        # Development-only lookup; validate() rejects non-Linux before use.
        return Path(__file__).resolve().parent.parent / "kan132" / "stack.yaml"
    path = CANONICAL_STACK
    try:
        for component in (path, *path.parents):
            info = component.lstat()
            require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                    "trusted-stack-unsafe-permissions")
            if component == path:
                require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 1024 * 1024,
                        "trusted-stack-unsafe-file")
            else:
                require(stat.S_ISDIR(info.st_mode), "trusted-stack-unsafe-directory")
    except OSError:
        raise GateError("trusted-stack-missing") from None
    return path


def stack_contract(path=None):
    # KAN132 stack.yaml is JSON-compatible YAML; no third-party parser needed.
    trusted_path = trusted_stack_path()
    trusted = json.loads(trusted_path.read_text())
    try:
        stack = json.loads((path or trusted_path).read_text())
        require(isinstance(stack, dict) and isinstance(stack.get("services"), dict), "restored-stack-format")
        for service in ("postgres", "redis", "evolution"):
            require(isinstance(stack["services"].get(service), dict) and
                    isinstance(stack["services"][service].get("image"), str), "restored-stack-format")
        require(isinstance(stack["services"]["evolution"].get("environment"), dict), "restored-stack-format")
    except (ValueError, OSError, TypeError):
        raise GateError("restored-stack-format") from None
    services = stack["services"]
    for service in ("postgres", "redis", "evolution"):
        require(re.fullmatch(r"[a-z0-9./_-]+:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}",
                             services[service]["image"]), "unpinned-image")
        require(services[service]["image"] == trusted["services"][service]["image"],
                "restored-image-pin-mismatch")
    require(services["postgres"]["image"].startswith("postgres:17.11-bookworm@"),
            "postgres-version")
    require({k: v for k, v in services["evolution"]["environment"].items() if k != "SERVER_URL"} ==
            {k: v for k, v in trusted["services"]["evolution"]["environment"].items() if k != "SERVER_URL"},
            "restored-evolution-config-mismatch")
    return services


REDIS_START = r'''set -eu
umask 077
password=$(cat /run/secrets/redis_password)
escaped=$(printf '%s' "$password" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '%s\n' 'bind 0.0.0.0' 'protected-mode yes' "requirepass \"$escaped\"" \
 'dir /data' 'dbfilename dump.rdb' 'appendonly no' 'appendfsync always' \
 'save ""' 'maxmemory 128mb' 'maxmemory-policy noeviction' > /data/restore.conf
chown -R redis:redis /data
exec /usr/local/bin/docker-entrypoint.sh redis-server /data/restore.conf
'''

EVO_START = r'''
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const secret = n => fs.readFileSync('/run/secrets/'+n,'utf8').trim();
const env = {...process.env,
 AUTHENTICATION_API_KEY:secret('api_key'), // secret-scan: allow-test - reads private runtime file
 DATABASE_CONNECTION_URI:`postgresql://evolution:${encodeURIComponent(secret('pg_app_password'))}@postgres:5432/evolution?schema=public`,
 CACHE_REDIS_URI:`redis://:${encodeURIComponent(secret('redis_password'))}@redis:6379/0`};
// Refuse startup before any restored session can attempt an outbound connection.
if(fs.readFileSync('/proc/net/route','utf8').split('\n').slice(1).some(l=>{
 const f=l.trim().split(/\s+/);return f.length>3&&f[1]==='00000000'&&(parseInt(f[3],16)&1);
})) process.exit(1);
if(fs.readFileSync('/proc/net/ipv6_route','utf8').split('\n').some(l=>{
 const f=l.trim().split(/\s+/);return f.length===10&&f[9]!=='lo'&&
  f[0]==='0'.repeat(32)&&f[1]==='00'&&(parseInt(f[8],16)&1);
})) process.exit(1);
// Generate only the local Prisma client, never deploy/migrate the restored DB.
const child=spawn('/bin/sh',['-ec','npm run db:generate >/dev/null 2>&1; exec node dist/main'],
 {env,stdio:'ignore'});
for(const s of ['SIGTERM','SIGINT']) process.on(s,()=>child.kill(s));
child.on('error',()=>process.exit(1)); child.on('exit',c=>process.exit(c ?? 1));
'''

EVO_CHECK = r'''
const fs=require('node:fs'), crypto=require('node:crypto'), {Pool}=require('pg'), {createClient}=require('redis');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const key=fs.readFileSync('/run/secrets/api_key','utf8').trim();
const pool=new Pool({host:'postgres',database:'evolution',user:'evolution',
 password:fs.readFileSync('/run/secrets/pg_app_password','utf8').trim(),
 connectionTimeoutMillis:3000,query_timeout:4000});
(async()=>{
 const request=token=>fetch('http://127.0.0.1:8080/instance/fetchInstances',{
  headers:token?{apikey:token}:{},signal:AbortSignal.timeout(4000)});
 for(const token of [null,'kan133-invalid']) if((await request(token)).status!==401) throw Error();
 const response=await request(key); if(response.status!==200) throw Error();
 const list=await response.json(); if(!Array.isArray(list)) throw Error();
 const instances=(await pool.query('SELECT id FROM "Instance" ORDER BY id')).rows;
 const ids=list.map(i=>i.id ?? i.instance?.id).sort();
 if(JSON.stringify(ids)!==JSON.stringify(instances.map(i=>i.id).sort())) throw Error();
 const sessions=(await pool.query('SELECT "sessionId",creds FROM "Session" ORDER BY "sessionId"')).rows;
 for(const s of sessions){
  if(!instances.some(i=>i.id===s.sessionId)) throw Error();
  let c=s.creds; for(let n=0;n<3&&typeof c==='string';n++) c=JSON.parse(c);
  const material=v=>{const b=v?.data??v;return (typeof b==='string'||Array.isArray(b))&&b.length>0;};
  if(!Number.isInteger(c?.registrationId)||c.registrationId<0||
   !material(c.signedIdentityKey?.public)||!material(c.signedIdentityKey?.private)) throw Error();
 }
 const redis=createClient({url:`redis://:${encodeURIComponent(fs.readFileSync('/run/secrets/redis_password','utf8').trim())}@redis:6379/0`,
  socket:{connectTimeout:3000,reconnectStrategy:false},disableOfflineQueue:true});
 redis.on('error',()=>{}); await redis.connect();
 try {if(await redis.ping()!=='PONG'||await redis.get(process.argv[1])!==process.argv[2]) throw Error();}
 finally {await redis.quit();}
 console.log(JSON.stringify({instances:instances.length,sessions:sessions.length,
  instance_hash:digest(JSON.stringify(ids))}));
})().then(()=>pool.end()).catch(async()=>{await pool.end();process.exit(1)});
'''

VOLUME_CHECK = r'''
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root='/evolution/instances', entries=[];
function walk(dir){for(const n of fs.readdirSync(dir).sort()){
 const p=path.join(dir,n),s=fs.lstatSync(p);
 if(s.isDirectory())walk(p); else if(s.isFile()) entries.push([
 path.relative(root,p).split(path.sep).join('/'),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]);
 else throw Error();
}}
walk(root); console.log(JSON.stringify(entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)));
'''

REDIS_FINGERPRINT = r'''
local cursor='0'
local items={}
repeat
 local page=redis.call('SCAN',cursor,'COUNT',1000)
 cursor=page[1]
 for _,key in ipairs(page[2]) do
  if key~=ARGV[1] then
   local value=redis.call('DUMP',key)
   if value then items[redis.sha1hex(key)]=redis.sha1hex(value) end
  end
 end
until cursor=='0'
local keys={}
for key,_ in pairs(items) do table.insert(keys,key) end
table.sort(keys)
local material={}
for _,key in ipairs(keys) do table.insert(material,key..items[key]) end
return {#keys,redis.sha1hex(table.concat(material))}
'''


class Validator:
    def __init__(self, root, secrets_relative="config/evolution-qa/secrets", seconds=MAX_SECONDS):
        require(30 <= seconds <= MAX_SECONDS, "deadline-range")
        self.root = Path(root)
        self.secrets_relative = secrets_relative
        self.started = time.monotonic()
        self.end = self.started + seconds
        self.work_end = self.started + min(WORK_SECONDS, seconds - 30)
        self.owner = "kan133-restore-" + uuid.uuid4().hex
        self.resources = []
        self.temp = None
        self.network = self.owner + "-net"
        self.containers = {n: self.owner + "-" + n for n in ("postgres", "redis", "evolution")}
        self.evidence = {}
        self.stage = "input"
        self.cleaning_up = False

    def docker(self, *args, stdin=None, cleanup=False, check=True):
        remaining = (self.end if cleanup else self.work_end) - time.monotonic()
        require(remaining > 0, "cleanup-timeout" if cleanup else "restore-timeout")
        env = {k: v for k, v in os.environ.items() if not k.startswith("DOCKER_")}
        command = ["docker", "--host", "unix:///var/run/docker.sock", "--config", str(self.temp), *args]
        try:
            result = subprocess.run(command, input=stdin, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=min(3 if cleanup else 20, remaining), env=env)
        except (subprocess.TimeoutExpired, OSError):
            raise GateError("docker-timeout-or-unavailable") from None
        if check:
            require(result.returncode == 0, "docker-command-failed")
        return result

    def output(self, *args, **kwargs):
        return self.docker(*args, **kwargs).stdout.decode("utf-8")

    def poll(self, action, gate="restore-readiness-timeout"):
        while time.monotonic() < self.work_end:
            try:
                return action()
            except GateError:
                time.sleep(min(0.5, max(0, self.work_end - time.monotonic())))
        raise GateError(gate)

    def create_resource(self, kind, name, *args):
        # Register before create, so a CLI timeout after daemon creation is covered.
        self.resources.append((kind, name))
        self.docker(kind, "create", "--label", LABEL + "=" + self.owner, *args, name)

    def create_container(self, service, entrypoint, env, mounts, command):
        name = self.containers[service]
        self.resources.append(("container", name))
        limits = {"postgres": ("0.50", "512m"), "redis": ("0.30", "384m"),
                  "evolution": ("0.75", "1536m")}[service]
        args = ["container", "create", "--name", name, "--label", LABEL + "=" + self.owner,
                "--pull", "never", "--network", self.network, "--network-alias", service,
                "--dns", "127.0.0.1", "--cpus", limits[0], "--memory", limits[1],
                "--memory-swap", limits[1], "--pids-limit", "256", "--cap-drop", "NET_RAW",
                "--security-opt", "no-new-privileges:true", "--restart", "no", "--log-driver", "none"]
        for key, value in env.items():
            args.extend(["--env", key + "=" + value])
        for source, target, readonly in mounts:
            args.extend(["--mount", f"type=bind,src={source},dst={target},readonly" if readonly
                         else f"type=volume,src={source},dst={target}"])
        args.extend(["--entrypoint", entrypoint, self.services[service]["image"], *command])
        self.docker(*args)

    def secret_mounts(self, names):
        return [(self.temp / n, "/run/secrets/" + n, True) for n in names]

    def isolation(self):
        network = json.loads(self.output("network", "inspect", self.network))[0]
        require(network["Internal"] is True and network["Driver"] == "bridge" and
                network.get("Options", {}).get("com.docker.network.bridge.gateway_mode_ipv4") == "isolated" and
                network.get("Options", {}).get("com.docker.network.bridge.gateway_mode_ipv6") == "isolated",
                "network-not-isolated")
        for name in self.containers.values():
            container = json.loads(self.output("container", "inspect", name))[0]
            host = container["HostConfig"]
            require(not host.get("PortBindings") and not host.get("PublishAllPorts") and
                    not host.get("Privileged") and host.get("NetworkMode") == self.network and
                    set(container["NetworkSettings"]["Networks"]) == {self.network} and
                    host.get("Memory", 0) > 0 and host.get("NanoCpus", 0) > 0 and
                    host.get("PidsLimit", 0) > 0 and host.get("Dns") == ["127.0.0.1"],
                    "container-isolation-or-caps")
        endpoints = set(network.get("Containers", {}))
        owned_ids = {json.loads(self.output("container", "inspect", n))[0]["Id"]
                     for n in self.containers.values()}
        require(endpoints <= owned_ids, "foreign-network-endpoint")

    def pg(self, sql, app=False):
        # Passwords only inside the container environment, never CLI args/host env.
        role = "evolution" if app else "evolution_admin"
        secret = "pg_app_password" if app else "pg_admin_password"
        script = f'export PGPASSWORD="$(cat /run/secrets/{secret})"; exec psql -h 127.0.0.1 -U {role} -d evolution -At -v ON_ERROR_STOP=1'
        return self.output("exec", "-i", self.containers["postgres"], "sh", "-ec", script,
                           stdin=sql.encode()).strip()

    def redis(self, *args):
        return self.output("exec", self.containers["redis"], "sh", "-ec",
                           'export REDISCLI_AUTH="$(cat /run/secrets/redis_password)"; exec redis-cli --no-auth-warning --raw "$@"',
                           "redis-cli", *args).strip()

    def redis_snapshot(self, exclude):
        databases = {0}
        for line in self.redis("INFO", "keyspace").splitlines():
            if re.match(r"db[0-9]+:", line):
                databases.add(int(line.split(":", 1)[0][2:]))
        snapshot = {}
        for database in sorted(databases):
            result = json.loads(self.redis("-n", str(database), "--json", "EVAL", REDIS_FINGERPRINT, "0", exclude))
            require(isinstance(result, list) and len(result) == 2 and isinstance(result[0], int) and
                    re.fullmatch(r"[a-f0-9]{40}", result[1]), "redis-data-fingerprint")
            snapshot[str(database)] = result
        return snapshot

    def pg_snapshot(self):
        tables = json.loads(self.pg("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public';"))
        require({"Instance", "Session", "Setting", "_prisma_migrations"} <= set(tables), "postgres-required-schema")
        counts = {}
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            counts[table] = int(self.pg(f"SELECT count(*) FROM public.{quoted};", app=True))
        require(counts["Instance"] >= 0 and counts["Session"] >= 0, "postgres-invalid-restored-session-counts")
        require(self.pg('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;') == "0",
                "postgres-incomplete-migration")
        session_hash = self.pg('SELECT md5(coalesce(string_agg(md5("sessionId" || coalesce(creds,\'\')),\'\' ORDER BY "sessionId"),\'\')) FROM "Session";')
        schema = self.docker("exec", self.containers["postgres"], "pg_dump", "-U", "evolution_admin",
                             "-d", "evolution", "--schema-only", "--no-owner", "--no-privileges").stdout
        # PG17 emits random \restrict guards: exclude only these generated lines.
        schema = b"\n".join(line for line in schema.splitlines()
                            if not line.startswith((b"\\restrict ", b"\\unrestrict ")))
        return {"tables": len(tables), "rows": sum(counts.values()), "counts": counts,
                "schema_hash": hashlib.sha256(schema).hexdigest(), "session_hash": session_hash}

    def validate(self):
        require(sys.platform == "linux" and os.geteuid() == 0, "linux-root-required")
        self.root, secrets = input_contract(self.root, self.secrets_relative, self.work_end)
        self.stage = "restored-config"
        stack_path = self.root / "config" / "kan132" / "stack.yaml"
        require(stack_path.is_file() and stack_path.stat().st_size <= 1024 * 1024,
                "restored-stack-missing-or-size")
        self.services = stack_contract(stack_path)
        self.temp = Path(tempfile.mkdtemp(prefix=self.owner + "-",dir='/var/lib/clicaepede/kan133' if os.name=='posix' else None))
        os.chmod(self.temp, 0o700)
        for name, value in secrets.items():
            path = self.temp / name
            path.write_text(value + "\n")
            os.chmod(path, 0o444)  # Parent is 0700; dropped container UIDs must read individual binds.
        del secrets
        self.stage = "docker-preflight"
        version = json.loads(self.output("version", "--format", "{{json .Server}}"))
        require(int(version["Version"].split(".")[0]) >= 28, "docker-isolated-mode-required")
        for service in self.services.values():
            self.docker("image", "inspect", service["image"])
        self.stage = "isolated-provision"
        self.create_resource("network", self.network, "--driver", "bridge", "--internal",
                             "--opt", "com.docker.network.bridge.gateway_mode_ipv4=isolated",
                             "--opt", "com.docker.network.bridge.gateway_mode_ipv6=isolated")
        volumes = {}
        for service in self.containers:
            volumes[service] = self.owner + "-" + service + "-data"
            self.create_resource("volume", volumes[service])
        self.create_container("postgres", "/usr/local/bin/docker-entrypoint.sh",
                              {"POSTGRES_USER": "evolution_admin", "POSTGRES_DB": "evolution",
                               "POSTGRES_PASSWORD_FILE": "/run/secrets/pg_admin_password",
                               "POSTGRES_INITDB_ARGS": "--data-checksums"},
                              self.secret_mounts(SECRET_NAMES[:2]) +
                              [(volumes["postgres"], "/var/lib/postgresql/data", False),
                               (self.root / "postgres.dump", "/backup/postgres.dump", True)],
                              ["postgres", "-c", "shared_buffers=128MB", "-c", "max_connections=40"])
        self.create_container("redis", "/bin/sh", {},
                              self.secret_mounts(["redis_password"]) + [(volumes["redis"], "/data", False)],
                              ["-ec", REDIS_START])
        evo_env = dict(self.services["evolution"]["environment"])
        evo_env.update({"SERVER_URL": "http://evolution:8080", "TELEMETRY_ENABLED": "false",
                        "WEBHOOK_GLOBAL_ENABLED": "false", "SENTRY_DSN": "",
                        "HTTP_PROXY": "", "HTTPS_PROXY": "", "ALL_PROXY": ""})
        self.create_container("evolution", "node", evo_env,
                              self.secret_mounts(SECRET_NAMES[1:]) +
                              [(volumes["evolution"], "/evolution/instances", False)], ["-e", EVO_START])
        self.isolation()
        self.docker("cp", str(self.root / "redis.rdb"), self.containers["redis"] + ":/data/dump.rdb")
        self.docker("cp", str(self.root / "evolution-instances") + "/.",
                    self.containers["evolution"] + ":/evolution/instances")
        self.stage = "postgres-restore"
        self.docker("start", self.containers["postgres"])
        self.poll(lambda: self.pg("SELECT 1;"))
        role_script = 'export PGAPP_SECRET="$(cat /run/secrets/pg_app_password)"; exec psql -U evolution_admin -d evolution -v ON_ERROR_STOP=1'  # secret-scan: allow-test - runtime file reference
        self.docker("exec", "-i", self.containers["postgres"], "sh", "-ec", role_script,
                    stdin=b"\\getenv app_password PGAPP_SECRET\nCREATE ROLE evolution LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';\nALTER DATABASE evolution OWNER TO evolution;\nALTER SCHEMA public OWNER TO evolution;\n")  # secret-scan: allow-test - SQL variable, no credential literal
        self.docker("exec", self.containers["postgres"], "pg_restore", "--exit-on-error", "--single-transaction", "--clean", "--if-exists",
                    "--no-owner", "--no-privileges", "--role=evolution", "-U", "evolution_admin",
                    "-d", "evolution", "/backup/postgres.dump")
        require(self.pg("SELECT current_user='evolution' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user;", app=True) == "t",
                "postgres-app-privileges")
        baseline = self.pg_snapshot()
        self.stage = "redis-rdb-to-aof"
        self.docker("start", self.containers["redis"])
        self.poll(lambda: require(self.redis("PING") == "PONG", "redis-readiness"))
        initial_info = self.redis("INFO", "persistence")
        require("aof_enabled:0" in initial_info and "loading:0" in initial_info, "redis-rdb-not-loaded")
        key_count = int(self.redis("DBSIZE"))
        canary = self.owner + ":canary"
        redis_baseline = self.redis_snapshot(canary)
        value = uuid.uuid4().hex
        require(self.redis("SET", canary, value, "NX") == "OK", "redis-canary-collision")
        require(self.redis("CONFIG", "SET", "appendonly", "yes") == "OK", "redis-enable-aof")
        def rewritten():
            info = dict(line.split(":", 1) for line in self.redis("INFO", "persistence").splitlines() if ":" in line)
            require(all(info.get(k) == v for k, v in {"aof_enabled": "1", "aof_rewrite_in_progress": "0",
                    "aof_rewrite_scheduled": "0", "aof_last_bgrewrite_status": "ok", "aof_last_write_status": "ok"}.items())
                    and int(info.get("aof_current_size", "0")) > 0, "redis-aof-rewrite")
        self.poll(rewritten)
        require(self.redis("CONFIG", "REWRITE") == "OK", "redis-config-rewrite")
        # Do not run the bootstrap again: it would reset appendonly=no on restart.
        self.docker("stop", "--time", "3", self.containers["redis"])
        self.docker("container", "rm", self.containers["redis"])
        self.create_container("redis", "/usr/local/bin/docker-entrypoint.sh", {},
                              self.secret_mounts(["redis_password"]) + [(volumes["redis"], "/data", False)],
                              ["redis-server", "/data/restore.conf"])
        self.docker("start", self.containers["redis"])
        self.poll(lambda: require(self.redis("PING") == "PONG", "redis-restart-readiness"))
        require(self.redis("GET", canary) == value and int(self.redis("DBSIZE")) == key_count + 1,
                "redis-aof-restart-canary")
        require("aof_enabled:1" in self.redis("INFO", "persistence"), "redis-restart-aof-disabled")
        require(self.redis_snapshot(canary) == redis_baseline, "redis-restored-data-mismatch")
        self.stage = "evolution-restored-sessions"
        self.docker("start", self.containers["evolution"])
        manifest = []
        for path in sorted((self.root / "evolution-instances").rglob("*")):
            require(time.monotonic() < self.work_end, "session-hash-timeout")
            if path.is_file():
                with path.open("rb") as source:
                    digest = hashlib.sha256()
                    while chunk := source.read(1024 * 1024):
                        require(time.monotonic() < self.work_end, "session-hash-timeout")
                        digest.update(chunk)
                    digest = digest.hexdigest()
                manifest.append([path.relative_to(self.root / "evolution-instances").as_posix(), digest])
        restored = json.loads(self.output("exec", self.containers["evolution"], "node", "-e", VOLUME_CHECK))
        require(sorted(manifest) == restored, "evolution-session-volume-mismatch")
        def api_ready():
            return json.loads(self.output("exec", self.containers["evolution"], "node", "-e", EVO_CHECK, canary, value))
        api = self.poll(api_ready, "evolution-api-or-restored-session-gate-failed")
        require(self.pg_snapshot() == baseline, "evolution-mutated-restored-schema-or-sessions")
        self.isolation()
        self.evidence.update({"postgres": {k: v for k, v in baseline.items() if k != "counts"}, "redis_keys": key_count,
                              "redis_aof_restart_verified": True, "evolution": api,
                              "redis_databases": redis_baseline,
                              "session_files": len(manifest), "isolated": True})

    def cleanup(self):
        failed = False
        for kind, name in reversed(list(dict.fromkeys(self.resources))):
            try:
                result = self.docker(kind, "inspect", name, cleanup=True, check=False)
                if result.returncode:
                    # Distinguish absence from daemon failure without printing stderr.
                    absent = (b"No such " in result.stderr or b"not found" in result.stderr.lower())
                    require(absent, "cleanup-inspect-failed")
                    continue
                resource = json.loads(result.stdout)[0]
                labels = resource.get("Config", {}).get("Labels", {}) if kind == "container" else resource.get("Labels", {})
                require(labels.get(LABEL) == self.owner, "cleanup-ownership-mismatch")
                args = [kind, "rm"] + (["--force"] if kind == "container" else []) + [name]
                self.docker(*args, cleanup=True)
            except (GateError, ValueError, KeyError, TypeError):
                failed = True
        if self.temp:
            try:
                shutil.rmtree(self.temp)
            except OSError:
                failed = True
        return not failed

    def run(self):
        result = {"status": "fail", "gate": "restore-internal-error"}
        try:
            self.validate()
            result = {"status": "pass", "gate": "isolated-full-restore", "evidence": self.evidence}
        except GateError as error:
            result["gate"] = str(error)
        except KeyboardInterrupt:
            result["gate"] = "restore-interrupted"
        except Exception:
            # Dump SQL, API payloads, paths and Docker diagnostics may contain secrets.
            result["gate"] = "restore-internal-error"
        finally:
            self.cleaning_up = True
            clean = self.cleanup()
        result["cleanup_verified"] = clean
        result["stage"] = self.stage
        if not clean:
            result["restore_gate"] = result["gate"]
            result.update(status="fail", gate="cleanup-failed")
        result["elapsed_seconds"] = round(time.monotonic() - self.started, 3)
        return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("--secrets-relative", default="config/evolution-qa/secrets")
    parser.add_argument("--timeout", type=int, default=MAX_SECONDS, choices=range(30, MAX_SECONDS + 1), metavar="30..200")
    args = parser.parse_args(argv)
    validator = Validator(args.input_directory, args.secrets_relative, args.timeout)
    def interrupted(_signal, _frame):
        if not validator.cleaning_up:
            raise GateError("restore-interrupted")
    previous = {s: signal.signal(s, interrupted) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        result = validator.run()
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
