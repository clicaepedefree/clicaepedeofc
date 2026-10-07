import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest import mock

sys.path.insert(0,str(Path(__file__).resolve().parent))
spec=importlib.util.spec_from_file_location('offsite',Path(__file__).with_name('restore-offsite.py'))
offsite=importlib.util.module_from_spec(spec)
spec.loader.exec_module(offsite)

class FinalizationTests(unittest.TestCase):
    def test_plaintext_present_preserves_lease_and_never_publishes_success(self):
        root,lease=mock.Mock(),mock.Mock()
        root.exists.return_value=True
        with mock.patch.object(offsite.backup,'atomic_json') as publish:
            with self.assertRaises(offsite.backup.Failure):
                offsite.finish(root,lease,{'status':'pass','cleanup_verified':True},0)
        lease.unlink.assert_not_called()
        publish.assert_not_called()

    def test_verified_cleanup_precedes_receipt(self):
        root,lease=mock.Mock(),mock.Mock()
        root.exists.return_value=False
        calls=[]
        lease.unlink.side_effect=lambda:calls.append('lease')
        with mock.patch.object(offsite.backup,'sync_dir',side_effect=lambda _:calls.append('sync')), \
             mock.patch.object(offsite.backup,'atomic_json',side_effect=lambda *_:calls.append('receipt')), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(offsite.finish(root,lease,{'status':'pass','cleanup_verified':True},0),0)
        self.assertEqual(calls,['lease','sync','receipt'])

    def test_failed_resource_cleanup_keeps_recovery_lease(self):
        root,lease=mock.Mock(),mock.Mock()
        root.exists.return_value=False
        with mock.patch.object(offsite.backup,'atomic_json'),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(offsite.finish(root,lease,{'status':'fail','cleanup_verified':False},0),1)
        lease.unlink.assert_not_called()

    def test_lease_removal_failure_never_publishes_success(self):
        root,lease=mock.Mock(),mock.Mock()
        root.exists.return_value=False
        lease.unlink.side_effect=OSError('injected')
        with mock.patch.object(offsite.backup,'atomic_json') as publish:
            with self.assertRaises(OSError):
                offsite.finish(root,lease,{'status':'pass','cleanup_verified':True},0)
        publish.assert_not_called()

if __name__=='__main__':
    unittest.main()
