"""Read-only effective workload validation; values never leave this module."""
from decimal import Decimal
import re


class Rejected(Exception):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


def environment(rows):
    require(isinstance(rows, list), 'environment-shape')
    result = {}
    for row in rows:
        require(isinstance(row, str) and '=' in row, 'environment-shape')
        key, value = row.split('=', 1)
        require(key and key not in result, 'environment-duplicate')
        result[key] = value
    return result


def memory(value):
    require(isinstance(value, str) and re.fullmatch(r'[1-9][0-9]*[mMkK]?', value), 'memory-shape')
    factor = {'m':1024**2, 'k':1024}.get(value[-1].lower(), 1)
    return int(value[:-1] if factor != 1 else value) * factor


def health(definition):
    return {'Test':[part.replace('$$', '$') for part in definition['test']],
            'Interval':int(definition['interval'][:-1])*10**9,
            'Timeout':int(definition['timeout'][:-1])*10**9,
            'Retries':definition['retries'],
            'StartPeriod':int(definition['start_period'][:-1])*10**9}


def validate(role, item, definition, image, networks, *, project='clica-qa_evolution-qa'):
    require(role in ('postgres','redis','evolution'), 'role')
    config, host = item['Config'], item['HostConfig']
    defaults = image['Config']
    require(item['Image'] == image['Id'] and config['Image'] == definition['image'], 'image')
    require(config.get('Entrypoint') == definition.get('entrypoint', defaults.get('Entrypoint')),
            'startup-entrypoint')
    if 'entrypoint' in definition and 'command' not in definition:
        require(config.get('Cmd') in (None, []), 'startup-command')
    else:
        require(config.get('Cmd') == definition.get('command', defaults.get('Cmd')), 'startup-command')
    expected_env = environment(defaults.get('Env', []))
    expected_env.update(definition.get('environment', {}))
    require(environment(config['Env']) == expected_env, 'environment-drift')
    for key in ('WorkingDir','User','ExposedPorts'):
        require(config.get(key, {} if key=='ExposedPorts' else '') ==
                defaults.get(key, {} if key=='ExposedPorts' else ''), 'image-default-drift')
    actual_health = dict(config.get('Healthcheck', {}))
    # Engine may materialize its exact default start-interval of five seconds.
    require(actual_health.pop('StartInterval', 0) in (0,5*10**9), 'health-start-interval')
    require(actual_health == health(definition['healthcheck']), 'healthcheck-drift')
    require(host['RestartPolicy'] == {'Name':'unless-stopped','MaximumRetryCount':0}, 'restart-policy')
    require(host['NanoCpus'] == int(Decimal(definition['cpus']) * 10**9)
            and host['Memory'] == memory(definition['mem_limit'])
            and host['MemoryReservation'] == memory(definition['mem_reservation']), 'resources')
    require(host['LogConfig'] == {'Type':definition['logging']['driver'],
                                 'Config':definition['logging']['options']}, 'logging')
    require(not host.get('PortBindings') and host.get('PublishAllPorts') is False
            and host.get('Privileged') is False and not host.get('CapAdd')
            and not host.get('Devices') and not host.get('VolumesFrom')
            and host.get('PidMode', '') == '' and host.get('IpcMode') == 'private'
            and host.get('NetworkMode') not in ('host','container'), 'host-exposure')
    require(not host.get('SecurityOpt') and not host.get('ExtraHosts')
            and not host.get('Links') and not host.get('Dns')
            and not host.get('DnsOptions') and not host.get('DnsSearch')
            and not host.get('GroupAdd') and not host.get('Sysctls')
            and not host.get('UsernsMode') and not host.get('UTSMode'), 'host-policy-override')
    for key, value in (defaults.get('Labels') or {}).items():
        require(config['Labels'].get(key) == value, 'image-label-drift')
    desired = {project+'_internal'} | ({'easypanel'} if role=='evolution' else set())
    attached = item['NetworkSettings']['Networks']
    require(set(attached) == desired and set(networks) == desired, 'network-set')
    for name in desired:
        actual = networks[name]
        require(actual['Name'] == name and actual['Id'] == attached[name]['NetworkID'], 'network-identity')
        if name.endswith('_internal'):
            require(actual['Driver'] == 'bridge' and actual['Internal'] is True, 'database-network')
        else:
            require(actual['Driver'] == 'overlay' and actual['Scope'] == 'swarm'
                    and actual['Internal'] is False, 'proxy-network')
            require(project+'_evolution' in attached[name].get('Aliases', []), 'native-proxy-alias')
    return True
