"""Bounded collector regression tests; no real logs, Docker or subprocesses."""
import importlib.util
from pathlib import Path
import types
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('kan151_audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CollectorTests(unittest.TestCase):
    def harness(self, stdout, stderr, returncode=0):
        process = MagicMock()
        process.stdout.fileno.return_value = 10
        process.stderr.fileno.return_value = 11
        process.wait.return_value = returncode
        process.poll.return_value = None
        selector = MagicMock()
        selector.__enter__.return_value = selector
        keys = {}

        def register(file, events, name):
            keys[file.fileno()] = types.SimpleNamespace(fd=file.fileno(), fileobj=file, data=name)

        selector.register.side_effect = register
        selector.unregister.side_effect = lambda file: keys.pop(file.fileno())
        selector.get_map.side_effect = lambda: keys
        selector.select.side_effect = lambda timeout: [(next(iter(keys.values())), 1)]
        queues = {10: list(stdout) + [b''], 11: list(stderr) + [b'']}

        def read(fd, size):
            data = queues[fd].pop(0)
            self.assertLessEqual(len(data), size)
            return data

        self.enterContext(patch.object(audit.subprocess, 'Popen', return_value=process))
        self.enterContext(patch.object(audit.selectors, 'DefaultSelector', return_value=selector))
        reader = self.enterContext(patch.object(audit.os, 'read', side_effect=read))
        return process, reader

    def test_both_streams_complete_below_ceiling(self):
        process, reader = self.harness([b'ab', b'cd'], [b'ef'])
        result = audit.bounded_logs(['synthetic'], maximum=8)
        self.assertEqual(result, {'stdout': b'abcd', 'stderr': b'ef'})
        self.assertTrue(all(call.args[1] <= 9 for call in reader.call_args_list))
        process.stdout.close.assert_called_once()
        process.stderr.close.assert_called_once()

    def test_overflow_stops_before_retaining_the_oversize_chunk(self):
        process, reader = self.harness([b'abcd', b'efghi'], [])
        with self.assertRaisesRegex(ValueError, 'ceiling'):
            audit.bounded_logs(['synthetic'], maximum=8)
        self.assertEqual(reader.call_count, 2)
        self.assertEqual(reader.call_args.args[1], 5)
        process.kill.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)
        process.stdout.close.assert_called_once()
        process.stderr.close.assert_called_once()

    def test_timeout_kills_and_reaps_child(self):
        process, reader = self.harness([], [])
        with patch.object(audit.time, 'monotonic', side_effect=[0, 2]):
            with self.assertRaises(TimeoutError):
                audit.bounded_logs(['synthetic'], maximum=8, timeout=1)
        reader.assert_not_called()
        process.kill.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)

    def test_invalid_ceiling_cannot_spawn(self):
        with patch.object(audit.subprocess, 'Popen') as child:
            for maximum in [0, -1, 64*1024*1024+1]:
                with self.assertRaises(AssertionError):
                    audit.bounded_logs(['synthetic'], maximum=maximum)
            child.assert_not_called()


if __name__ == '__main__':
    unittest.main()
