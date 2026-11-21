"""Opt-in real Redis regression. Only owned, networkless synthetic containers."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time
import unittest
import uuid
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('restore', Path(__file__).with_name('restore.py'))
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)
LABEL = 'clicaepede.kan161.redis-test'


def absent(result, kind, name):
    error = result.stderr.decode(errors='replace').strip()
    expected = {f'Error response from daemon: No such {kind}: {name}'}
    if kind == 'volume':
        expected.add(f'Error response from daemon: get {name}: no such volume')
    return result.returncode != 0 and error in expected


@unittest.skipUnless(os.environ.get('KAN161_REDIS_INTEGRATION') == 'true',
                     'Requires explicit isolated Docker Redis test approval')
class RealRedisFingerprintTests(unittest.TestCase):
    def docker(self, *args):
        return subprocess.check_output(['docker', *args], timeout=30,
                                       stderr=subprocess.PIPE).decode().strip()

    def setUp(self):
        self.owner = 'kan161-' + uuid.uuid4().hex
        self.container = self.owner + '-redis'
        self.volume = self.owner + '-data'
        self.image = restore.stack_contract()['redis']['image']
        self.docker('image', 'inspect', self.image)
        self.addCleanup(self.cleanup)
        self.docker('volume', 'create', '--label', LABEL + '=' + self.owner, self.volume)
        self.start(False)

    def remove_container(self):
        result = subprocess.run(['docker', 'container', 'inspect', self.container],
                                capture_output=True, timeout=10)
        if result.returncode:
            self.assertTrue(absent(result, 'container', self.container),
                            'Cannot verify container absence; cleanup unconfirmed')
            return
        item = json.loads(result.stdout)[0]
        self.assertEqual(item['Config']['Labels'].get(LABEL), self.owner)
        self.docker('container', 'rm', '--force', self.container)

    def cleanup(self):
        self.remove_container()
        result = subprocess.run(['docker', 'volume', 'inspect', self.volume],
                                capture_output=True, timeout=10)
        if result.returncode == 0:
            self.assertEqual(json.loads(result.stdout)[0]['Labels'].get(LABEL), self.owner)
            self.docker('volume', 'rm', self.volume)
        else:
            self.assertTrue(absent(result, 'volume', self.volume),
                            'Cannot verify volume absence; cleanup unconfirmed')

    def start(self, aof):
        self.docker('run', '-d', '--name', self.container, '--pull', 'never',
                    '--label', LABEL + '=' + self.owner, '--network', 'none',
                    '--memory', '128m', '--cpus', '0.25', '--pids-limit', '128',
                    '--mount', 'type=volume,src=' + self.volume + ',dst=/data',
                    self.image, 'redis-server', '--save', '', '--appendonly',
                    'yes' if aof else 'no', '--appendfsync', 'always')
        deadline = time.monotonic() + 10
        while True:
            try:
                if self.redis('PING') == 'PONG':
                    return
            except subprocess.SubprocessError:
                pass
            if time.monotonic() > deadline:
                self.fail('Isolated Redis did not start')
            time.sleep(0.1)

    def redis(self, *args):
        if args[0] == 'INFO':
            return self.docker('exec', self.container, 'redis-cli', '--raw', *args)
        return json.loads(self.docker('exec', self.container, 'redis-cli', '--json', *args))

    def snapshot(self, database=0, expect_error=False):
        result = self.redis('-n', str(database), 'EVAL', restore.REDIS_FINGERPRINT,
                          '0', 'fixture-canary-excluded', str(int(time.time() * 1000) + 120000),
                          '1' if database == 0 else '0')
        if not expect_error:
            self.assertIs(type(result[0]), int)
            self.assertGreaterEqual(result[0], 0, 'A failed fingerprint is not comparable evidence')
            self.assertRegex(result[1], r'^[a-f0-9]{40}$')
        return result

    def restart_aof(self):
        self.assertEqual(self.redis('SAVE'), 'OK')
        self.assertEqual(self.redis('CONFIG', 'SET', 'appendonly', 'yes'), 'OK')
        deadline = time.monotonic() + 10
        while True:
            info = self.redis('INFO', 'persistence')
            if 'aof_rewrite_in_progress:0' in info and 'aof_last_bgrewrite_status:ok' in info:
                break
            if time.monotonic() > deadline:
                self.fail('AOF rewrite timeout')
            time.sleep(0.1)
        self.docker('stop', '--time', '3', self.container)
        self.remove_container()
        self.start(True)

    def test_hash_survives_restart_despite_binary_dump_reordering(self):
        pairs = [value for i in range(100) for value in (f'field-{i}', 'fixture-' + str(i) * 90)]
        self.redis('HSET', 'fixture-hash', *pairs)
        self.redis('SET', 'fixture-string', 'fixture-scalar')
        self.assertEqual(self.redis('OBJECT', 'ENCODING', 'fixture-hash'), 'hashtable')
        values = self.redis('HGETALL', 'fixture-hash')
        dump_before = self.redis('EVAL', "return redis.sha1hex(redis.call('DUMP',KEYS[1]))", '1', 'fixture-hash')
        before = self.snapshot()
        self.restart_aof()
        self.assertEqual(self.redis('HGETALL', 'fixture-hash'), values)
        dump_after = self.redis('EVAL', "return redis.sha1hex(redis.call('DUMP',KEYS[1]))", '1', 'fixture-hash')
        self.assertNotEqual(dump_before, dump_after, 'Representative hash must reproduce changed binary ordering')
        self.assertEqual(self.snapshot(), before)

    def test_modified_value_with_same_key_count_is_detected(self):
        self.redis('HSET', 'fixture-hash', 'field', 'fixture-original')
        before = self.snapshot()
        self.redis('HSET', 'fixture-hash', 'field', 'fixture-corrupt')
        self.assertEqual(self.snapshot()[0], before[0])
        self.assertNotEqual(self.snapshot(), before)

    def test_changed_key_and_field_expirations_are_detected(self):
        self.redis('HSET', 'fixture-hash', 'field', 'fixture-value')
        self.redis('PEXPIRE', 'fixture-hash', '180000')
        before = self.snapshot()
        self.redis('PERSIST', 'fixture-hash')
        self.assertNotEqual(self.snapshot(), before)
        before = self.snapshot()
        self.redis('HPEXPIRE', 'fixture-hash', '180000', 'FIELDS', '1', 'field')
        self.assertNotEqual(self.snapshot(), before)
        before = self.snapshot()
        self.restart_aof()
        self.assertEqual(self.snapshot(), before)

    def test_delimiters_binary_values_and_field_names_cannot_collide(self):
        self.redis('HSET', 'fixture-hash', 'a', 'bc')
        before = self.snapshot()
        self.redis('DEL', 'fixture-hash')
        self.redis('HSET', 'fixture-hash', 'ab', 'c')
        self.assertNotEqual(self.snapshot(), before)
        self.redis('HSET', 'fixture-hash', 'binary', 'fixture-\x01\xff\r\n')
        self.assertEqual(self.snapshot(), self.snapshot())

    def test_set_order_stable_and_member_corruption_detected(self):
        members = [f'fixture-member-{i}' for i in range(100)]
        self.redis('SADD', 'fixture-set', *members)
        before = self.snapshot()
        self.restart_aof()
        self.assertEqual(self.snapshot(), before)
        self.redis('SREM', 'fixture-set', members[0])
        self.redis('SADD', 'fixture-set', 'fixture-replaced')
        self.assertEqual(self.snapshot()[0], before[0])
        self.assertNotEqual(self.snapshot(), before)

    def test_canary_excluded_other_db_and_unsupported_types_remain_strict(self):
        self.redis('SET', 'fixture-string', 'fixture-value')
        before = self.snapshot()
        self.redis('SET', 'fixture-canary-excluded', 'fixture-marker')
        self.assertEqual(self.snapshot(), before)
        self.redis('-n', '2', 'RPUSH', 'fixture-list', 'a', 'b')
        db2 = self.snapshot(2)
        self.assertEqual(self.snapshot(), before)
        self.redis('-n', '2', 'LSET', 'fixture-list', '0', 'corrupt')
        self.assertNotEqual(self.snapshot(2), db2)
        db2 = self.snapshot(2)
        self.redis('-n', '2', 'SET', 'fixture-canary-excluded', 'must-not-be-excluded')
        self.assertNotEqual(self.snapshot(2), db2)

    def test_binary_scalar_and_raw_hash_fields_are_not_lossily_decoded(self):
        def write(value):
            subprocess.check_output(['docker', 'exec', '-i', self.container,
                                     'redis-cli', '-x', 'SET', 'fixture-binary'],
                                    input=value, timeout=10, stderr=subprocess.PIPE)
        write(b'fixture-\x00\xff\r\n')
        before = self.snapshot()
        write(b'fixture-\x00\xfe\r\n')
        self.assertNotEqual(self.snapshot(), before)
        self.redis('EVAL', "return redis.call('HSET',KEYS[1],string.char(0,255),'fixture-value')",
                   '1', 'fixture-binary-hash')
        before = self.snapshot()
        self.restart_aof()
        self.assertEqual(self.snapshot(), before)

    def test_near_expiry_and_limits_fail_closed(self):
        self.redis('SET', 'fixture-expiring', 'fixture-value', 'PX', '60000')
        horizon = int(time.time() * 1000) + 120000
        result = self.redis('EVAL', restore.REDIS_FINGERPRINT, '0', 'canary', str(horizon))
        self.assertEqual(result, [-1, 'redis-expiry-window'])
        self.redis('DEL', 'fixture-expiring')
        self.redis('EVAL', "for i=1,10001 do redis.call('HSET',KEYS[1],tostring(i),'fixture') end return 1",
                   '1', 'fixture-too-large')
        self.assertEqual(self.snapshot(expect_error=True), [-1, 'redis-fingerprint-limit'])

    def test_adjacent_far_future_expiry_and_unsafe_precision(self):
        self.redis('SET', 'fixture-expiry', 'fixture-value')
        self.redis('PEXPIREAT', 'fixture-expiry', '100000000000000')
        before = self.snapshot()
        self.redis('PEXPIREAT', 'fixture-expiry', '100000000000001')
        self.assertNotEqual(self.snapshot(), before)
        self.redis('HSET', 'fixture-hash', 'field', 'fixture-value')
        # Redis 7.4 hash-field expirations have a narrower range than key deadlines.
        self.redis('HPEXPIREAT', 'fixture-hash', '10000000000000', 'FIELDS', '1', 'field')
        before = self.snapshot()
        self.redis('HPEXPIREAT', 'fixture-hash', '10000000000001', 'FIELDS', '1', 'field')
        self.assertNotEqual(self.snapshot(), before)
        self.redis('PEXPIREAT', 'fixture-expiry', '9007199254740992')
        self.assertEqual(self.snapshot(expect_error=True), [-1, 'redis-expiry-range'])

    def test_large_bytes_low_cardinality_rejects_before_value_reads(self):
        self.redis('EVAL', "return redis.call('HSET',KEYS[1],'only-field',string.rep('x',17*1024*1024))",
                   '1', 'fixture-large-value')
        self.assertEqual(self.snapshot(expect_error=True), [-1, 'redis-fingerprint-limit'])

    def test_near_expiring_hash_field_is_explicitly_unverifiable(self):
        self.redis('HSET', 'fixture-hash', 'field', 'fixture-value')
        self.redis('HPEXPIRE', 'fixture-hash', '60000', 'FIELDS', '1', 'field')
        self.assertEqual(self.snapshot(expect_error=True), [-1, 'redis-expiry-window'])

    def test_zset_scores_key_type_and_identity_changes_detected(self):
        self.redis('ZADD', 'fixture-zset', '1.0000000000000002', 'member')
        before = self.snapshot()
        self.redis('ZADD', 'fixture-zset', '1.0000000000000004', 'member')
        self.assertNotEqual(self.snapshot(), before)
        before = self.snapshot()
        self.restart_aof()
        self.assertEqual(self.snapshot(), before)
        self.redis('RENAME', 'fixture-zset', 'fixture-renamed')
        self.assertNotEqual(self.snapshot(), before)
        before = self.snapshot()
        self.redis('DEL', 'fixture-renamed')
        self.redis('SET', 'fixture-renamed', 'member')
        self.assertNotEqual(self.snapshot(), before)

    def test_list_order_and_duplicates_are_not_normalized_away(self):
        self.redis('RPUSH', 'fixture-list', 'a', 'b', 'a')
        before = self.snapshot()
        self.redis('LSET', 'fixture-list', '0', 'b')
        self.redis('LSET', 'fixture-list', '1', 'a')
        self.assertNotEqual(self.snapshot(), before)
        before = self.snapshot()
        self.restart_aof()
        self.assertEqual(self.snapshot(), before)

    def test_stream_delivery_metadata_keeps_strict_binary_comparison(self):
        self.redis('XADD', 'fixture-stream', '1-0', 'field', 'fixture-entry')
        before = self.snapshot()
        self.redis('XGROUP', 'CREATE', 'fixture-stream', 'fixture-group', '0')
        self.assertEqual(self.snapshot()[0], before[0])
        self.assertNotEqual(self.snapshot(), before)


class SnapshotContractTests(unittest.TestCase):
    def validator(self, response):
        validator = restore.Validator('unused')
        self.calls = []
        def redis(*args):
            self.calls.append(args)
            if args == ('INFO', 'keyspace'):
                return 'db0:keys=2,expires=0\ndb2:keys=1,expires=0'
            return json.dumps(response)
        validator.redis = redis
        return validator

    def test_canary_excluded_only_in_database_zero_and_window_is_bounded(self):
        validator = self.validator([1, 'a' * 40])
        result = validator.redis_snapshot('fixture-canary')
        self.assertEqual(set(result), {'0', '2'})
        commands = [call for call in self.calls if 'EVAL' in call]
        self.assertEqual(commands[0][-1], '1')
        self.assertEqual(commands[1][-1], '0')
        self.assertEqual(commands[1][-3], 'fixture-canary')
        for call in commands:
            self.assertGreater(int(call[-2]), int(time.time() * 1000))
            self.assertLessEqual(int(call[-2]), int((time.time() + restore.WORK_SECONDS + 1) * 1000))

    def test_malformed_or_error_reply_never_approves(self):
        for response in ([True, 'a' * 40], [-2, 'a' * 40], [10001, 'a' * 40],
                         [1, None], [1, 123], [1, 'bad'], {}, [-1, ['private']]):
            with self.subTest(response=response):
                with self.assertRaises(restore.GateError):
                    self.validator(response).redis_snapshot('fixture-canary')

    def test_controlled_gate_codes_are_sanitized(self):
        for code in ('redis-expiry-window', 'redis-expiry-range', 'redis-fingerprint-limit', 'redis-unsupported-type'):
            with self.assertRaisesRegex(restore.GateError, '^' + code + '$'):
                self.validator([-1, code]).redis_snapshot('fixture-canary')
        with self.assertRaisesRegex(restore.GateError, '^redis-fingerprint-unavailable$'):
            self.validator([-1, 'PRIVATE_EXCEPTION_SENTINEL']).redis_snapshot('fixture-canary')

    def test_collection_reads_have_a_prior_exact_memory_gate(self):
        script = restore.REDIS_FINGERPRINT
        memory = script.index("redis.call('MEMORY','USAGE',key,'SAMPLES',0)")
        for operation in ("redis.call('HKEYS'", "redis.call('SMEMBERS'",
                          "redis.call('LRANGE'", "redis.call('ZRANGE'"):
            self.assertLess(memory, script.index(operation))

    def test_cleanup_does_not_treat_daemon_failure_as_absence(self):
        fixture = RealRedisFingerprintTests('test_hash_survives_restart_despite_binary_dump_reordering')
        fixture.owner = 'fixture-owner'
        fixture.container = 'fixture-container'
        for message in (b'Daemon unavailable', b'context fixture-context not found',
                        b'Error response from daemon: No such container: another-container'):
            bad = subprocess.CompletedProcess([], 1, b'', message)
            with patch.object(subprocess, 'run', return_value=bad):
                with self.assertRaisesRegex(AssertionError, 'cleanup unconfirmed'):
                    fixture.remove_container()
        self.assertTrue(absent(subprocess.CompletedProcess([], 1, b'',
                               b'Error response from daemon: No such container: fixture-container'),
                               'container', 'fixture-container'))


if __name__ == '__main__':
    unittest.main()
