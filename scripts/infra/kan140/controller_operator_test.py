import signal
import unittest
from unittest import mock

import controller_operator as op
import panel_client


class InterruptTests(unittest.TestCase):
    def test_first_signal_unwinds_and_repeated_signal_does_not_interrupt_cleanup(self):
        stop = op.interrupt_handler()
        with self.assertRaises(op.OperatorInterrupted):
            stop(signal.SIGTERM, None)
        self.assertIsNone(stop(signal.SIGTERM, None))

    def test_http_transport_does_not_swallow_operator_termination(self):
        stop = op.interrupt_handler()
        client = panel_client.Client('fixture@example.invalid', 'fixture-password')
        client._token = 'fixture-token'
        with mock.patch.object(panel_client.http.client, 'HTTPConnection') as factory:
            factory.return_value.request.side_effect = lambda *a, **kw: stop(signal.SIGTERM, None)
            with self.assertRaises(op.OperatorInterrupted):
                client.call('createComposeService', panel_client.create_compose_payload(
                    '{}', trusted_source=True), trusted_source=True)
            factory.return_value.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
