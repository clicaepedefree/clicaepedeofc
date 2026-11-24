"""Durable RETURN intent. Caller holds backup.lock throughout enable/create/recovery.

No Docker calls. Registration MUST precede create; never unregister an intent
after ambiguous create. Only the installed, reviewed canonical recovery enables
this protocol, not a candidate elsewhere on disk.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

CANONICAL_RECOVERY = Path('/opt/clicaepede/kan133/restore-recover.py')
SCHEMA = 'kan140-latest-return'
VERSION = 2
MAX_LEASE = 16384
MAX_HELPERS = 12
OWNER = r'kan133-restore-[a-f0-9]{32}'
HELPER = r'kan140-transfer-[a-f0-9]{32}-[a-f0-9]{32}'
ROLES = ('postgres', 'redis', 'evolution')


class LeaseError(Exception):
    """Fixed codes only; no paths or diagnostics."""


def require(condition, code='invalid_lease'):
    if not condition:
        raise LeaseError(code)


def validate(value, root, owner, *, legacy=False):
    require(isinstance(value, dict) and isinstance(owner, str) and
            re.fullmatch(OWNER, owner) is not None and value.get('owner') == owner)
    base = {'owner', 'directory', 'validator_directory'}
    extended = {'schema', 'version', 'resources'}
    require({'owner', 'directory'} <= set(value))
    if legacy and not (set(value) & extended):
        require(set(value) <= base)
    else:
        require(set(value) <= base | extended and extended <= set(value) and
                value['schema'] == SCHEMA and type(value['version']) is int and
                value['version'] == VERSION)
        resources = value['resources']
        require(isinstance(resources, list) and len(resources) <= 3 + MAX_HELPERS)
        seen, counts = set(), {'volume': 0, 'container': 0}
        for item in resources:
            require(isinstance(item, dict) and set(item) == {'kind', 'name'})
            kind, name = item['kind'], item['name']
            require(isinstance(kind, str) and kind in counts and isinstance(name, str))
            pattern = re.escape(owner) + r'-return-[a-f0-9]{32}' if kind == 'volume' else HELPER
            require(re.fullmatch(pattern, name) is not None and (kind, name) not in seen)
            seen.add((kind, name))
            counts[kind] += 1
        require(counts['volume'] <= 3 and counts['container'] <= MAX_HELPERS)
    for key, pattern in (('directory', r'restore-offsite-[a-z0-9_]{8}'),
                         ('validator_directory', re.escape(owner) + r'-[a-z0-9_]{8}')):
        raw = value.get(key)
        if key == 'validator_directory' and raw is None:
            continue
        require(isinstance(raw, str))
        path = Path(raw)
        require(str(path) == raw and path.is_absolute() and path.parent == root and
                re.fullmatch(pattern, path.name) is not None and path.resolve() == path)
        if os.path.lexists(path):
            info = path.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                    stat.S_IMODE(info.st_mode) == 0o700, 'unsafe_directory')
    return value


class LatestReturnLease:
    def __init__(self, backup_module, root, *, recovery_path, recovery_sha256):
        self.backup = backup_module
        self.root = Path(root)
        self.path = self.root / 'restore_lease.json'
        self.recovery_path = Path(recovery_path)
        self.recovery_sha256 = recovery_sha256
        self.binding = None

    def _trusted(self, path, *, directory):
        info = path.lstat()
        require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and
                not info.st_mode & 0o022 and
                (stat.S_ISDIR(info.st_mode) if directory else
                 stat.S_ISREG(info.st_mode) and info.st_nlink == 1), 'untrusted_recovery')

    def _attest(self):
        require(self.recovery_path == CANONICAL_RECOVERY and
                self.recovery_path.is_absolute() and
                self.recovery_path.resolve() == self.recovery_path and
                isinstance(self.recovery_sha256, str) and
                re.fullmatch(r'[a-f0-9]{64}', self.recovery_sha256), 'untrusted_recovery')
        for parent in reversed(self.recovery_path.parents):
            self._trusted(parent, directory=True)
        self._trusted(self.recovery_path, directory=False)
        fd = os.open(self.recovery_path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as source:
            info = os.fstat(source.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
                    not info.st_mode & 0o022 and info.st_nlink == 1 and
                    info.st_size <= 128 * 1024, 'untrusted_recovery')
            raw = source.read(128 * 1024 + 1)
        require(len(raw) <= 128 * 1024 and
                hashlib.sha256(raw).hexdigest() == self.recovery_sha256, 'recovery_source_mismatch')

    def _read(self, owner, *, legacy=False):
        self._attest()
        info = self.root.lstat()
        require(self.root.is_absolute() and self.root.resolve() == self.root and
                stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                stat.S_IMODE(info.st_mode) == 0o700, 'unsafe_root')
        with self.backup.private_file(self.path) as source:
            raw = source.read(MAX_LEASE + 1)
        require(len(raw.encode('utf-8')) <= MAX_LEASE)
        value = validate(json.loads(raw), self.root, owner, legacy=legacy)
        binding = (owner, value['directory'], value.get('validator_directory'))
        require(self.binding is None or binding == self.binding, 'lease_changed')
        self.binding = binding
        return value

    def _persist(self, before, after, owner):
        require(self._read(owner, legacy=True) == before, 'lease_changed')
        validate(after, self.root, owner)
        require(len(json.dumps(after).encode('utf-8')) <= MAX_LEASE)
        self.backup.atomic_json(self.path, after)
        require(self._read(owner) == after, 'lease_readback')
        return True

    def enable(self, owner):
        value = self._read(owner, legacy=True)
        if 'schema' in value:
            return self.assert_recoverable(owner)
        return self._persist(value, dict(value, schema=SCHEMA, version=VERSION, resources=[]), owner)

    def assert_recoverable(self, owner):
        self._read(owner)
        return True

    def register(self, owner, kind, name):
        value = self._read(owner)
        if kind == 'container' and name in {owner + '-' + role for role in ROLES}:
            return True
        item = {'kind': kind, 'name': name}
        if item in value['resources']:
            return True
        after = dict(value, resources=value['resources'] + [item])
        return self._persist(value, after, owner)


class Lease(LatestReturnLease):
    def __init__(self, backup_module, *, recovery_path, recovery_sha256, root=None):
        super().__init__(backup_module, backup_module.ROOT if root is None else root,
                         recovery_path=recovery_path, recovery_sha256=recovery_sha256)
