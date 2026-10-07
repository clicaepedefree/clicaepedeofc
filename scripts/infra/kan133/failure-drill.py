#!/usr/bin/env python3
"""Explicit QA-only fault injection: owned durable pause then SIGKILL."""
import os
from pathlib import Path
import signal
import tempfile
import backup
with backup.locked(backup.ROOT):
    executor=backup.Executor()
    backup.require(executor.replicas()==1 and not executor.marker.exists())
    stage=Path(tempfile.mkdtemp(prefix='staging-',dir=backup.ROOT))
    (stage/'owned-non-secret-fixture').write_text('KAN133 interruption cleanup test')
    executor.pause()
    print('{"drill":"paused-with-durable-marker","next":"intentional-SIGKILL"}',flush=True)
    os.kill(os.getpid(),signal.SIGKILL)
