import json
import unittest
from panel_access import access_guards


class PanelAccessTests(unittest.TestCase):
    def test_guards_deny_only_and_never_override_evolution_backend_or_tls(self):
        config = access_guards('192.0.2.10', 'qa.easypanel.host')
        self.assertEqual(set(config), {'http'})
        self.assertEqual(set(config['http']), {'routers'})
        routers = config['http']['routers']
        self.assertEqual(len(routers), 4)
        for name, router in routers.items():
            self.assertEqual(router['service'], 'noop@internal')
            self.assertEqual(router['priority'], 200000)
            self.assertNotIn('certResolver', router.get('tls', {}))
            if 'untrusted' in name:
                self.assertEqual(router['rule'],
                    'Host(`painel.clicaepede.com.br`) && !ClientIP(`192.0.2.10/32`)')
            else:
                self.assertEqual(router['rule'], 'Host(`qa.easypanel.host`)')
            if name.endswith('https'):
                self.assertEqual(router['entryPoints'], ['https'])
                self.assertEqual(router['tls'], {})
            else:
                self.assertEqual(router['entryPoints'], ['http'])
                self.assertNotIn('tls', router)
        self.assertNotIn('evolution', json.dumps(config))
        self.assertNotIn('Headers', json.dumps(config))

    def test_cannot_inject_rules_or_allow_network_ranges(self):
        for address in ('0.0.0.0', '127.0.0.1', '224.0.0.1', '::1',
                        '192.0.2.10/24', '192.0.2.10`) || Host(`evil'):
            with self.assertRaises(ValueError):
                access_guards(address, 'qa.easypanel.host')

    def test_generated_hostname_cannot_shadow_panel_or_inject_rules(self):
        for hostname in ('painel.clicaepede.com.br', '*', '', 'a`)', 'a/b', 'a b'):
            with self.assertRaises(ValueError):
                access_guards('192.0.2.10', hostname)
