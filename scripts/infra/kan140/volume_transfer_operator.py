"""Serialize the synthetic native rehearsal with production backup operations."""
import json
import os
from pathlib import Path
import sys


def main():
    if os.name != 'posix' or os.geteuid() != 0 or os.environ.get('KAN140_VOLUME_FIXTURE') != 'true':
        raise SystemExit('native-volume-optin-required')
    sys.path.insert(0, '/opt/clicaepede/kan133')
    import backup
    import runtime
    import volume_transfer_native
    with backup.locked(backup.ROOT):
        if runtime.fenced() or any((backup.ROOT / n).exists() for n in ('maintenance.json', 'restore_lease.json')):
            raise SystemExit('native-volume-maintenance-pending')
        cfg = json.loads(runtime.trusted_bytes(Path('/etc/clicaepede/kan135/config.json')))
        if cfg.get('whatsapp_enabled') is not False:
            raise SystemExit('native-volume-worker-not-paused')
        return volume_transfer_native.main(['--run-native-fixtures'])


if __name__ == '__main__':
    raise SystemExit(main())
