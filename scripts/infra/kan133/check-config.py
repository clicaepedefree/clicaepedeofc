#!/usr/bin/env python3
"""Read-only readiness diagnostic; never emit settings or exception messages."""
import json
import traceback
import backup
try:
    backup.config()
    executor=backup.Executor()
    executor.replicas()
    executor.sessions()
    print('{"status":"ready"}')
except Exception as error:
    print(json.dumps({'status':'not-ready','type':type(error).__name__,
                      'frames':[{'function':frame.name,'line':frame.lineno} for frame in traceback.extract_tb(error.__traceback__)]}))
    raise SystemExit(1)
