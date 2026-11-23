#!/usr/bin/env python3
"""Opt-in isolated Compose restore using the canonical offsite downloader.

Age identity arrives on stdin only. Does not deploy EasyPanel or publish ownership.
The official restore receipt is preserved; this rehearsal gets a separate receipt.
"""
import hashlib
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import time
import uuid

CANONICAL = Path('/opt/clicaepede/kan133')
PINS = {
    'runtime.py': '41f2b899cc2e77a018ddc7e0a7fd1fcded6368209d8b299523346ada446baed3',
    'backup.py': '5152f3ff2d94119ce1b851ceae4a03b8d23a6ff63bdc15c724a132017d5a0308',
    'restore.py': 'ea35a72beac23c1c19b4ab936653c5ac8f50bf89e08369381bc5e224389cfe1f',
    'restore-offsite.py': '92d4077e68299f3f1e53ab7417ecb9154a22fda7b6ba56827e71538146ffcb7b',
}
BOUND_BACKUP = None
ATTEMPT = None


def trusted(path, digest=None):
    if path.resolve(strict=True) != path:
        raise ValueError('untrusted-source')
    for parent in path.parents:
        entry = parent.stat()
        if entry.st_uid != 0 or entry.st_mode & 0o022:
            raise ValueError('untrusted-source')
    entry = path.stat()
    if not stat.S_ISREG(entry.st_mode) or entry.st_uid != 0 or entry.st_nlink != 1 or entry.st_mode & 0o077:
        raise ValueError('untrusted-source')
    if digest and hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('canonical-source-drift')


def verified_module(name, path, digest=None):
    trusted(path, digest)
    # This is a fresh operator process, not a general in-process plugin loader.
    if name in sys.modules:
        raise ValueError('cached-module-rejected')
    loader = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(loader)
    sys.modules[name] = module
    try:
        loader.loader.exec_module(module)
    except BaseException:
        del sys.modules[name]
        raise
    if Path(module.__file__).resolve() != path:
        raise ValueError('module-source-mismatch')
    return module


def receipt(value):
    if BOUND_BACKUP is None or ATTEMPT is None:
        raise ValueError('unbound-attempt')
    value = dict(value, attempt=ATTEMPT, backend='compose-rehearsal', production_cutover=False)
    BOUND_BACKUP.atomic_json(BOUND_BACKUP.ROOT / 'last_compose_rehearsal.json', value)
    return value


def public_result(result):
    allowed = {'status', 'gate', 'evidence', 'cleanup_verified', 'stage', 'elapsed_seconds', 'restore_gate'}
    if not isinstance(result, dict) or set(result) - allowed or result.get('status') not in ('pass', 'fail'):
        raise ValueError('invalid-result')
    if type(result.get('cleanup_verified')) is not bool:
        raise ValueError('invalid-cleanup-proof')
    success = result['status'] == 'pass' and result['cleanup_verified'] is True
    if success and result.get('gate') != 'isolated-full-restore':
        raise ValueError('invalid-success-gate')
    output = {'status': 'pass' if success else 'fail', 'cleanup_verified': result['cleanup_verified'],
              'gate': 'isolated-compose-restore' if success else 'compose-rehearsal-rejected'}
    if not success:
        stages = {'input', 'restored-config', 'docker-preflight', 'isolated-provision',
                  'postgres-restore', 'redis-rdb-to-aof', 'evolution-restored-sessions',
                  'compose-restart-integrity'}
        reasons = {'docker-command-failed', 'restore-internal-error', 'cleanup-failed',
                   'container-isolation-or-caps', 'compose-identity', 'compose-security',
                   'compose-mounts', 'compose-project-containers',
                   'evolution-mutated-restored-schema-or-sessions',
                   'compose-evolution-dependencies-unproven',
                   'compose-storage-restart-data-mismatch', 'compose-redis-restart-data-mismatch',
                   'compose-application-restart-data-mismatch', 'compose-session-volume-restart-mismatch',
                   'postgres-data-fingerprint-rejected', 'evolution-api-or-restored-session-gate-failed'}
        output['stage'] = result.get('stage') if result.get('stage') in stages else 'unreported'
        output['reason'] = result.get('gate') if result.get('gate') in reasons else 'unclassified-validation-failure'
    if success:
        evidence = result.get('evidence', {})
        if evidence.get('backend') != 'compose' or evidence.get('production_migration') is not False:
            raise ValueError('invalid-compose-evidence')
        pg, evo = evidence.get('postgres', {}), evidence.get('evolution', {})
        for source, target, keys in ((pg, 'postgres', ('tables', 'rows')),
                                     (evo, 'evolution', ('instances', 'sessions'))):
            if any(type(source.get(k)) is not int or source[k] < 0 for k in keys):
                raise ValueError('invalid-count-evidence')
            output[target] = {k: source[k] for k in keys}
        for key in ('isolated', 'redis_aof_restart_verified', 'compose_restart_verified',
                    'session_volume_restart_verified'):
            if evidence.get(key) is not True:
                raise ValueError('missing-runtime-proof')
            output[key] = True
        for key in ('evolution_dependencies', 'evolution_dependencies_after_restart'):
            proof = evidence.get(key, {})
            if proof.get('verified') is not True:
                raise ValueError('missing-dependency-proof')
            output[key + '_verified'] = True
        snapshot = evidence.get('postgres_data_snapshot', {})
        if snapshot.get('policy') != 'pg17-record-row-sha256-v2':
            raise ValueError('missing-data-proof')
        output['data_fingerprint_sha256'] = hashlib.sha256(
            json.dumps(snapshot, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return output


def finish(root, lease, result, started):
    backup = BOUND_BACKUP
    backup.require(not root.exists())
    projected = public_result(result)
    # Do not expose PASS before receipt persistence AND lease release succeed.
    receipt({'status': 'finalizing', 'cleanup_verified': result['cleanup_verified']})
    if result['cleanup_verified'] is True:
        lease.unlink()
        backup.sync_dir(backup.ROOT)
    projected.update(offsite_download_hash_verified=True, offsite_key_decryption_verified=True,
                     total_elapsed_seconds=round(time.monotonic() - started, 3))
    value = receipt(projected)
    print(json.dumps(value, sort_keys=True))
    return 0 if value['status'] == 'pass' else 1


@contextlib.contextmanager
def attempt_lock(backup):
    import fcntl
    fd = os.open(backup.ROOT / 'compose-rehearsal.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('attempt-lock-rejected')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def native_enabled():
    return os.name == 'posix' and os.geteuid() == 0 and os.environ.get('KAN140_COMPOSE_REHEARSAL') == 'true'


def main():
    global BOUND_BACKUP, ATTEMPT
    if not native_enabled():
        raise ValueError('opt-in-linux-root-required')
    for filename, digest in PINS.items():
        trusted(CANONICAL / filename, digest)
    for candidate in (Path(__file__).resolve().parent / 'compose_restore.py',
                      Path(__file__).resolve().parent.parent / 'kan133' / 'data_snapshot.py'):
        trusted(candidate)
    trusted(Path(__file__).resolve().parent.parent / 'kan133' / 'restore.py', PINS['restore.py'])
    verified_module('runtime', CANONICAL / 'runtime.py', PINS['runtime.py'])
    backup = verified_module('backup', CANONICAL / 'backup.py', PINS['backup.py'])
    restore = verified_module('restore', CANONICAL / 'restore.py', PINS['restore.py'])
    adapter = verified_module('kan140_compose_adapter', Path(__file__).resolve().parent / 'compose_restore.py')
    wrapper = verified_module('kan140_offsite_canonical', CANONICAL / 'restore-offsite.py', PINS['restore-offsite.py'])
    if wrapper.restore is not restore or wrapper.backup is not backup or backup.runtime is not sys.modules['runtime']:
        raise ValueError('module-identity-mismatch')
    BOUND_BACKUP = backup
    ATTEMPT = uuid.uuid4().hex
    original = restore.Validator
    with attempt_lock(backup):
        with backup.locked(backup.ROOT):
            backup.require(not (backup.ROOT / 'restore_lease.json').exists())
            receipt({'status': 'running', 'cleanup_verified': False})
        try:
            # Process-local injection only: canonical files and official receipt stay intact.
            restore.Validator = adapter.ComposeValidator
            wrapper.finish = finish
            return wrapper.main()
        except BaseException:
            with backup.locked(backup.ROOT):
                receipt({'status': 'fail', 'gate': 'compose-rehearsal-interrupted', 'cleanup_verified': False})
            raise
        finally:
            restore.Validator = original


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('{"status":"fail","gate":"compose-offsite-rehearsal-wrapper"}')
        raise SystemExit(1)
