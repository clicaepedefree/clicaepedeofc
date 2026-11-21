"""Opt-in native UID/mount rehearsal; synthetic isolated PostgreSQL only."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'kan133'))
import data_snapshot

ENABLED = (os.name == 'posix' and os.environ.get('KAN140_COMPOSE_MOUNT_INTEGRATION') == 'true')
LABEL = 'clicaepede.kan140.mount-probe'


@unittest.skipUnless(ENABLED, 'opt-in Docker PostgreSQL mount rehearsal')
class NativeMountTests(unittest.TestCase):
    def test_fresh_init_uid_readonly_restart_persistence_and_host_traversal(self):
        self.assertEqual(os.geteuid(), 0)
        canonical = Path('/opt/clicaepede/kan132/stack.yaml')
        self.assertEqual(canonical.resolve(strict=True), canonical)
        for parent in canonical.parents:
            info = parent.stat()
            self.assertEqual(info.st_uid, 0)
            self.assertEqual(info.st_mode & 0o022, 0)
        info = canonical.stat()
        self.assertTrue(stat.S_ISREG(info.st_mode))
        self.assertEqual(info.st_uid, 0)
        self.assertEqual(stat.S_IMODE(info.st_mode), 0o600)
        image = json.loads(canonical.read_bytes())['services']['postgres']['image']
        self.assertRegex(image, r'^postgres:17\.11-bookworm@sha256:[a-f0-9]{64}$')
        owner = 'kan140-mount-' + uuid.uuid4().hex
        volume = owner + '-data'
        with tempfile.TemporaryDirectory(prefix=owner + '-') as directory:
            root = Path(directory)
            root.chmod(0o700)

            def docker(*args, check=True, stdin=None):
                result = subprocess.run(
                    ['docker', '--host', 'unix:///var/run/docker.sock', '--config', str(root), *args],
                    capture_output=True, timeout=75 if stdin is not None else 30, input=stdin)
                if check and result.returncode:
                    raise AssertionError('native-docker-command-rejected')
                return result

            def inspect(kind, name):
                result = docker(kind, 'inspect', name, check=False)
                if result.returncode:
                    diagnostic = result.stderr.decode(errors='replace').strip()
                    expected = ({f'Error response from daemon: No such container: {name}'}
                                if kind == 'container' else {
                                    f'Error response from daemon: get {name}: no such volume',
                                    f'Error response from daemon: volume {name} not found'})
                    self.assertIn(diagnostic, expected, 'cleanup-absence-not-proven')
                    return None
                rows = json.loads(result.stdout)
                self.assertEqual(len(rows), 1)
                item = rows[0]
                labels = item['Config']['Labels'] if kind == 'container' else item['Labels']
                self.assertEqual(labels.get(LABEL), owner)
                return item

            def ready():
                end = time.monotonic() + 65
                while time.monotonic() < end:
                    item = inspect('container', owner)
                    if item and item['State'].get('Health', {}).get('Status') == 'healthy':
                        main = docker('exec', owner, 'cat', '/proc/1/comm', check=False)
                        if main.returncode == 0 and main.stdout.strip() == b'postgres':
                            return
                    time.sleep(1)
                self.fail('native-postgres-not-healthy')

            def role_check():
                result = docker('exec', owner, 'psql', '-U', 'evolution_admin', '-d', 'evolution',
                                '-Atc', "SELECT count(*) FROM pg_roles WHERE rolname='evolution' "
                                'AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole;')
                self.assertEqual(result.stdout.strip(), b'1')

            for name in ('pg_admin', 'pg_app'):
                path = root / name
                # The reviewed shell init uses read -r, requiring a line terminator.
                path.write_text(secrets.token_hex(32) + '\n')
                path.chmod(0o444)
            source = Path(__file__).resolve().parent.parent / 'kan132' / 'postgres-init.sh'
            init = root / 'postgres-init.sh'
            init.write_bytes(source.read_bytes())
            init.chmod(0o444)
            self.assertEqual(hashlib.sha256(init.read_bytes()).digest(),
                             hashlib.sha256(source.read_bytes()).digest())
            docker('image', 'inspect', image)
            try:
                docker('volume', 'create', '--label', LABEL + '=' + owner, volume)
                args = ['run', '--detach', '--pull', 'never', '--name', owner,
                        '--label', LABEL + '=' + owner, '--network', 'none',
                        '--memory', '256m', '--cpus', '0.25', '--pids-limit', '128',
                        '--health-cmd', 'pg_isready -U evolution_admin -d evolution',
                        '--health-interval', '1s', '--health-timeout', '3s', '--health-retries', '60',
                        '--mount', 'type=volume,src=' + volume + ',dst=/var/lib/postgresql/data',
                        '-e', 'POSTGRES_USER=evolution_admin', '-e', 'POSTGRES_DB=evolution',
                        '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/pg_admin_password',
                        '-e', 'POSTGRES_INITDB_ARGS=--data-checksums']
                for filename, target in (
                        ('pg_admin', '/run/secrets/pg_admin_password'),
                        ('pg_app', '/run/secrets/pg_app_password'),
                        ('postgres-init.sh', '/docker-entrypoint-initdb.d/kan132-init.sh')):
                    args += ['--mount', f'type=bind,src={root / filename},dst={target},readonly']
                docker(*args, image)
                ready()
                item = inspect('container', owner)
                self.assertEqual(item['HostConfig']['NetworkMode'], 'none')
                self.assertFalse(item['HostConfig'].get('PortBindings'))
                self.assertTrue(all(not mount['RW'] for mount in item['Mounts']
                                    if mount['Type'] == 'bind'))
                docker('exec', '--user', 'postgres', owner, 'sh', '-ec',
                       'test -r /run/secrets/pg_app_password && '
                       'test ! -w /run/secrets/pg_app_password && '
                       'test -r /docker-entrypoint-initdb.d/kan132-init.sh')
                role_check()
                def pg(sql):
                    return docker('exec', '-i', owner, 'psql', '-X', '-qAt',
                                  '-U', 'evolution_admin', '-d', 'evolution',
                                  '-v', 'ON_ERROR_STOP=1', stdin=sql.encode()).stdout.decode()

                pg('CREATE TABLE public."kan140 probe" (id bigint GENERATED ALWAYS AS IDENTITY, value text, payload jsonb);'
                   'INSERT INTO public."kan140 probe" (value) VALUES (\'fixture-v1\');')
                baseline = data_snapshot.collect(pg)
                pg('UPDATE public."kan140 probe" SET payload=\'null\'::jsonb WHERE id=1;')
                json_null = data_snapshot.collect(pg)
                self.assertEqual(baseline['tables']['kan140 probe']['rows'],
                                 json_null['tables']['kan140 probe']['rows'])
                self.assertNotEqual(baseline['tables']['kan140 probe']['sha256'],
                                    json_null['tables']['kan140 probe']['sha256'])
                pg('UPDATE public."kan140 probe" SET value=\'fixture-v2\' WHERE id=1;')
                changed = data_snapshot.collect(pg)
                self.assertEqual(baseline['tables']['kan140 probe']['rows'],
                                 changed['tables']['kan140 probe']['rows'])
                self.assertNotEqual(baseline['tables']['kan140 probe']['sha256'],
                                    changed['tables']['kan140 probe']['sha256'])
                pg('SELECT nextval(pg_get_serial_sequence(\'public."kan140 probe"\',\'id\'));')
                advanced = data_snapshot.collect(pg)
                self.assertEqual(advanced['tables'], changed['tables'])
                self.assertNotEqual(advanced['sequences'], changed['sequences'])
                denied = subprocess.run(['test', '-r', str(root / 'pg_app')],
                                        user=65534, group=65534, extra_groups=[],
                                        capture_output=True, timeout=5)
                self.assertEqual(denied.returncode, 1)
                docker('stop', '--time', '10', owner)
                docker('start', owner)
                ready()
                role_check()
                self.assertEqual(data_snapshot.collect(pg), advanced)
                pg('INSERT INTO public."kan140 probe" (value) VALUES (repeat(\'x\',4*1024*1024));')
                self.assertEqual(pg('SELECT pg_column_size(value)<octet_length(value) '
                                    'FROM public."kan140 probe" WHERE id>1;').strip(), 't')
                rejected = docker('exec', '-i', owner, 'psql', '-X', '-qAt', '-U',
                                  'evolution_admin', '-d', 'evolution', '-v', 'ON_ERROR_STOP=1',
                                  stdin=data_snapshot.SQL.encode(), check=False)
                self.assertNotEqual(rejected.returncode, 0)
                self.assertIn(b'division by zero', rejected.stderr)
                pg('DELETE FROM public."kan140 probe" WHERE id>1;')
                for expression in ("'{\"n\":1e100000}'::jsonb", "'1e100000'::jsonb",
                                   "('{\"n\":0.' || repeat('0',10000) || '}')::jsonb"):
                    pg('UPDATE public."kan140 probe" SET payload=' + expression + ' WHERE id=1;')
                    rejected = docker('exec', '-i', owner, 'psql', '-X', '-qAt', '-U',
                                      'evolution_admin', '-d', 'evolution', '-v', 'ON_ERROR_STOP=1',
                                      stdin=data_snapshot.SQL.encode(), check=False)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn(b'division by zero', rejected.stderr)
                pg('UPDATE public."kan140 probe" SET payload=\'{"n":[1,2.5,{"z":0}]}\'::jsonb WHERE id=1;')
                self.assertEqual(data_snapshot.collect(pg)['tables']['kan140 probe']['rows'], 1)
                pg('CREATE TABLE public.alias_probe (t text, value text);'
                   "INSERT INTO public.alias_probe VALUES ('fixture-same', 'first');")
                first_alias = data_snapshot.collect(pg)['tables']['alias_probe']
                pg("UPDATE public.alias_probe SET value='second';")
                self.assertNotEqual(first_alias, data_snapshot.collect(pg)['tables']['alias_probe'])
                pg('CREATE FUNCTION public.octet_length(varchar) RETURNS integer '
                   'LANGUAGE sql IMMUTABLE AS $$ SELECT 0 $$;'
                   'CREATE TABLE public.overload_probe (value varchar);'
                   "INSERT INTO public.overload_probe VALUES (repeat('x',4*1024*1024));")
                rejected = docker('exec', '-i', owner, 'psql', '-X', '-qAt', '-U',
                                  'evolution_admin', '-d', 'evolution', '-v', 'ON_ERROR_STOP=1',
                                  stdin=data_snapshot.SQL.encode(), check=False)
                self.assertNotEqual(rejected.returncode, 0)
                self.assertIn(b'division by zero', rejected.stderr)
            finally:
                if inspect('container', owner) is not None:
                    docker('container', 'rm', '--force', owner)
                if inspect('volume', volume) is not None:
                    docker('volume', 'rm', volume)
                self.assertIsNone(inspect('container', owner))
                self.assertIsNone(inspect('volume', volume))


if __name__ == '__main__':
    unittest.main()
