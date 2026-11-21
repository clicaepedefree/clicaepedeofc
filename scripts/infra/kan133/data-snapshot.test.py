import json
import unittest
from unittest import mock
import data_snapshot as s


class DataSnapshotTests(unittest.TestCase):
    def fixture(self):
        return [{'kind': 'manifest', 'tables': 1, 'sequences': 1},
                {'kind': 'budget', 'name': 'Fixture "rows', 'safe': 1},
                {'kind': 'table', 'name': 'Fixture "rows', 'rows': 2, 'sha256': 'a' * 64},
                {'kind': 'sequence', 'name': 'Fixture_seq', 'last_value': '9007199254740993', 'is_called': True}]

    def parse(self, rows):
        return s.parse('\n'.join(json.dumps(row) for row in rows))

    def test_rows_hash_and_exact_large_sequence_value_are_retained(self):
        value = self.parse(self.fixture())
        self.assertEqual(value['tables']['Fixture "rows']['rows'], 2)
        self.assertEqual(value['sequences']['Fixture_seq']['last_value'], '9007199254740993')

    def test_truncated_duplicate_or_wrong_kind_rejected(self):
        rows = self.fixture()
        for value in (rows[:-1], rows + rows[1:], rows[1:], [dict(rows[0], tables=True), *rows[1:]],
                      [rows[0], dict(rows[1], kind='unknown'), *rows[2:]]):
            with self.subTest(rows=value), self.assertRaises(s.SnapshotError):
                self.parse(value)

    def test_malformed_limits_and_secret_shaped_extra_fields_rejected(self):
        for change in ({'rows': 100001}, {'rows': True}, {'sha256': 'wrong'},
                       {'value': 'fixture-private-not-returned'}, {'name': ''}):
            rows = self.fixture()
            rows[2].update(change)
            with self.subTest(change=change), self.assertRaises(s.SnapshotError):
                self.parse(rows)

    def test_sequence_values_are_bounded_integers_and_boolean_state(self):
        for change in ({'last_value': 1}, {'last_value': '1e3'},
                       {'last_value': '9223372036854775808'}, {'is_called': 1}):
            rows = self.fixture()
            rows[3].update(change)
            with self.subTest(change=change), self.assertRaises(s.SnapshotError):
                self.parse(rows)

    def test_content_change_with_same_count_is_visible(self):
        first = self.parse(self.fixture())
        changed = self.fixture()
        changed[2]['sha256'] = 'b' * 64
        self.assertNotEqual(first, self.parse(changed))

    def test_no_plaintext_or_duplicate_fields_are_accepted(self):
        for raw in ('secret', '{}', '[]', 'null', '{"kind":"manifest","tables":0,"tables":0,"sequences":0}',
                    'x' * (512 * 1024 + 1)):
            with self.subTest(size=len(raw)), self.assertRaises(s.SnapshotError):
                s.parse(raw)

    def test_query_is_one_readonly_transaction_with_server_side_identifier_quoting(self):
        self.assertIn('REPEATABLE READ READ ONLY', s.SQL)
        self.assertIn('%I.%I', s.SQL)
        self.assertIn('LIMIT 100001', s.SQL)
        self.assertIn('transaction_timeout', s.SQL)
        self.assertIn('COLLATE "C"', s.SQL)
        self.assertIn('pg_column_compression', s.SQL)
        self.assertNotIn('to_jsonb(t)', s.SQL)
        self.assertIn('ROW(t.*)::text', s.SQL)
        self.assertIn('SET LOCAL search_path = pg_catalog;', s.SQL)
        execute = mock.Mock(return_value='\n'.join(json.dumps(row) for row in self.fixture()))
        self.assertEqual(s.collect(execute), self.parse(self.fixture()))
        execute.assert_called_once_with(s.SQL)

    def test_missing_failed_or_duplicate_serialization_budget_rejected(self):
        rows = self.fixture()
        for value in ([rows[0], *rows[2:]],
                      [rows[0], dict(rows[1], safe=False), *rows[2:]],
                      [rows[0], dict(rows[1], safe=0), *rows[2:]],
                      [rows[0], *rows[2:], rows[1]]):
            with self.subTest(value=value), self.assertRaises(s.SnapshotError):
                self.parse(value)


if __name__ == '__main__':
    unittest.main()
