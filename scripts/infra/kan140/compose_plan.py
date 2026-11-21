"""Pure migration planner. Never contacts Docker, EasyPanel or reads secrets.

The output is NOT a deployment command or evidence of a completed migration.
The cutover must first bind a generation and fence every legacy writer.
"""
import copy
import hashlib
import json
import re

ROLES = ('postgres', 'redis', 'evolution')
VOLUMES = ('postgres_data', 'redis_data', 'evolution_instances')
SECRET_FILES = {  # secret-scan: allow-test - file-name mapping only, no credential values
    'pg_admin_password': 'pg_admin', 'pg_app_password': 'pg_app',
    'redis_password': 'redis', 'api_key': 'api',
}
CONFIG_FILES = {
    'postgres_init_v2': 'postgres-init.sh',
    'redis_entrypoint_v1': 'redis-entrypoint.sh',
    'evolution_entrypoint_v1': 'evolution-entrypoint.sh',
    'evolution_logs_v4_privacy': 'start-redacted.cjs',
}
ROOT = '/etc/clicaepede/kan140'
LIMITS = {'postgres': ('0.50', '512M'), 'redis': ('0.30', '384M'),
          'evolution': ('0.75', '1536M')}
EVOLUTION_ENV = {
    'SERVER_TYPE': 'http', 'SERVER_PORT': '8080',
    'SERVER_URL': 'https://evolution-staging.clicaepede.com.br', 'DOCKER_ENV': 'true',
    'DATABASE_PROVIDER': 'postgresql', 'DATABASE_CONNECTION_CLIENT_NAME': 'clica_evolution_qa',
    'DATABASE_SAVE_DATA_INSTANCE': 'true', 'DATABASE_SAVE_DATA_NEW_MESSAGE': 'false',
    'DATABASE_SAVE_MESSAGE_UPDATE': 'false', 'DATABASE_SAVE_DATA_CONTACTS': 'false',
    'DATABASE_SAVE_DATA_CHATS': 'false', 'DATABASE_SAVE_DATA_LABELS': 'false',
    'DATABASE_SAVE_DATA_HISTORIC': 'false', 'CACHE_REDIS_ENABLED': 'true',
    'CACHE_REDIS_PREFIX_KEY': 'clica_evolution_qa', 'CACHE_REDIS_SAVE_INSTANCES': 'false',
    'CACHE_LOCAL_ENABLED': 'false', 'AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES': 'false',
    'DEL_INSTANCE': 'false', 'LOG_LEVEL': 'ERROR,WARN', 'LOG_BAILEYS': 'error',
    'TELEMETRY_ENABLED': 'false', 'EVENT_EMITTER_MAX_LISTENERS': '50',
    'NODE_OPTIONS': '--max-old-space-size=768', 'WEBHOOK_GLOBAL_ENABLED': 'false',
    'CONFIG_SESSION_PHONE_NAME': 'Clica e Pede QA', 'CONFIG_SESSION_PHONE_CLIENT': 'Chrome',
    'QRCODE_LIMIT': '5',
}


class PlanError(ValueError):
    pass


def require(value, code):
    if not value:
        raise PlanError(code)


def build_plan(raw_stack, expected_sha256, generation):
    """Translate reviewed KAN132 JSON bytes, requiring a caller-pinned baseline."""
    require(isinstance(raw_stack, bytes) and 0 < len(raw_stack) <= 1024 * 1024,
            'stack-size')
    require(isinstance(expected_sha256, str) and
            re.fullmatch(r'[a-f0-9]{64}', expected_sha256), 'baseline-hash-format')
    require(hashlib.sha256(raw_stack).hexdigest() == expected_sha256, 'baseline-drift')
    require(type(generation) is int and 1 <= generation <= 2147483647, 'generation')
    try:
        stack = json.loads(raw_stack)
        require(isinstance(stack, dict) and set(stack) ==
                {'version', 'services', 'networks', 'volumes', 'secrets', 'configs'}, 'stack-shape')
        require(stack['version'] == '3.8', 'stack-version')
        require(set(stack['services']) == set(ROLES), 'stack-services')
        require(stack['networks'] == {'internal': {'driver': 'overlay', 'internal': True},
                                     'proxy': {'external': True, 'name': 'easypanel'}}, 'networks')
        require(stack['volumes'] == dict.fromkeys(VOLUMES, {}), 'volumes')
        expected_secrets = dict(zip(SECRET_FILES, ('kan132_pg_admin_v1', 'kan132_pg_app_v1',
                                                 'kan132_redis_v1', 'kan132_api_v1')))
        require(stack['secrets'] == {k: {'external': True, 'name': v}
                                    for k, v in expected_secrets.items()}, 'secret-references')
        require(stack['configs'] == {k: {'file': './' + v}
                                    for k, v in CONFIG_FILES.items()}, 'config-references')
        services = copy.deepcopy(stack['services'])
        for role, service in services.items():
            require(set(service) <= {'image', 'entrypoint', 'command', 'environment',
                                    'secrets', 'configs', 'volumes', 'networks', 'healthcheck',
                                    'deploy', 'logging'}, 'unsupported-service-field')
            require(re.fullmatch(r'[^\s@$]+@sha256:[a-f0-9]{64}', service['image']), 'image-pin')
            require(service['volumes'] == [dict(zip(ROLES, VOLUMES))[role] + ':' +
                    {'postgres': '/var/lib/postgresql/data', 'redis': '/data',
                     'evolution': '/evolution/instances'}[role]], 'service-volume')
            require(service['networks'] == (['internal', 'proxy'] if role == 'evolution'
                                            else ['internal']), 'service-networks')
            require(service['logging'] == {'driver': 'json-file',
                                          'options': {'max-size': '10m', 'max-file': '3'}}, 'logging')
            health = service['healthcheck']
            require(isinstance(health, dict) and set(health) ==
                    {'test', 'interval', 'timeout', 'retries', 'start_period'}, 'healthcheck')
            test = health['test']
            require(isinstance(test, list) and len(test) >= 2 and
                    test[0] in ('CMD', 'CMD-SHELL') and
                    all(isinstance(part, str) and part for part in test), 'healthcheck-test')
            require(type(health['retries']) is int and 1 <= health['retries'] <= 20,
                    'healthcheck-retries')
            require(all(isinstance(health[key], str) and
                        re.fullmatch(r'[1-9][0-9]{0,2}s', health[key]) and
                        int(health[key][:-1]) <= 300
                        for key in ('interval', 'timeout', 'start_period')), 'healthcheck-duration')
            expected_env = {
                'postgres': {'POSTGRES_USER': 'evolution_admin', 'POSTGRES_DB': 'evolution',
                             'POSTGRES_PASSWORD_FILE': '/run/secrets/pg_admin_password',
                             'POSTGRES_INITDB_ARGS': '--data-checksums'},
                'redis': {}, 'evolution': EVOLUTION_ENV,
            }[role]
            require(service.get('environment', {}) == expected_env, 'environment-contract')
            require(all(name in SECRET_FILES for name in service['secrets']), 'service-secrets')
            require(all(isinstance(c, dict) and c.get('source') in CONFIG_FILES and
                        c.get('target', '').startswith(('/run/configs/', '/docker-entrypoint-initdb.d/'))
                        for c in service['configs']), 'service-configs')
            deploy = service.pop('deploy')
            require(set(deploy) == {'replicas', 'placement', 'restart_policy', 'update_config',
                    'resources'} and type(deploy['replicas']) is int and deploy['replicas'] == 1 and
                    deploy['placement'] == {'constraints': ['node.role == manager']} and
                    deploy['update_config'] == {'order': 'stop-first', 'failure_action': 'pause'} and
                    deploy['restart_policy'].get('condition') == 'any', 'swarm-policy')
            cpus, memory = LIMITS[role]
            require(deploy['resources']['limits'] == {'cpus': cpus, 'memory': memory}, 'limits')
            require(set(deploy['resources']) == {'limits', 'reservations'}, 'resources')
            service.update({'cpus': cpus, 'mem_limit': memory,
                            'mem_reservation': deploy['resources']['reservations']['memory'],
                            'restart': 'unless-stopped',
                            'labels': {'clicaepede.owner': 'easypanel-compose-qa',
                                       'clicaepede.generation': str(generation)}})
        require(services['evolution']['environment']['WEBHOOK_GLOBAL_ENABLED'] == 'false',
                'global-webhook')
        require(services['evolution']['environment']['SERVER_URL'] ==
                'https://evolution-staging.clicaepede.com.br', 'server-url')
        require(any(c['source'] == 'evolution_logs_v4_privacy' for c in
                    services['evolution']['configs']), 'log-redactor')
    except (KeyError, TypeError, AttributeError, json.JSONDecodeError, UnicodeDecodeError):
        raise PlanError('invalid-stack-contract') from None
    compose = {
        'services': services,
        'networks': {'internal': {'driver': 'bridge', 'internal': True},
                     'proxy': {'external': True, 'name': 'easypanel'}},
        'volumes': {name: {'external': True, 'name': 'kan140_qa_' + name} for name in VOLUMES},
        'secrets': {name: {'file': ROOT + '/mount-secrets/' + filename}
                    for name, filename in SECRET_FILES.items()},
        'configs': {name: {'file': ROOT + '/configs/' + filename}
                    for name, filename in CONFIG_FILES.items()},
    }
    return {
        'schema': 1, 'generation': generation, 'baseline_sha256': expected_sha256,
        'deployment_permitted': False, 'compose': compose,
        'required_gates': [
            'private-0700-parents-readonly-0444-mount-copies-reviewed-hashes-and-native-uid-access',
            'generation-bound-shared-lock-and-all-legacy-entrypoints-fenced',
            'backup-monitor-recovery-runtime-adapters-tested',
            'isolated-restore-and-data-aware-rollback-rehearsed',
            'destination-volumes-restored-and-verified-not-active-source-volumes',
            'legacy-writers-stopped-and-desired-state-zero',
            'easypanel-native-domains-with-no-competing-legacy-route',
            'bot-worker-and-instance-webhook-remain-disabled',
        ],
    }
