"""Generate deny-only proxy guards; EasyPanel keeps ownership of routing/TLS."""
import ipaddress
import re


def access_guards(admin_address, default_hostname):
    address = ipaddress.IPv4Address(admin_address)
    if address.is_unspecified or address.is_multicast or address.is_loopback:
        raise ValueError('An explicit non-loopback administration IPv4 is required')
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', default_hostname):
        raise ValueError('Invalid generated panel hostname')
    if default_hostname == 'painel.clicaepede.com.br':
        raise ValueError('Generated and authorized panel host must differ')
    routers = {}
    for entrypoint in ('http', 'https'):
        def router(rule):
            result = {'rule': rule, 'priority': 200000,
                      'entryPoints': [entrypoint], 'service': 'noop@internal'}
            if entrypoint == 'https':
                result['tls'] = {}
            return result
        routers['kan140-deny-untrusted-' + entrypoint] = router(
            'Host(`painel.clicaepede.com.br`) && !ClientIP(`' + str(address) + '/32`)')
        routers['kan140-deny-alternate-' + entrypoint] = router(
            'Host(`' + default_hostname + '`)')
    return {'http': {'routers': routers}}
