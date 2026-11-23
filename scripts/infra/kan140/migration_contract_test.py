import copy
import unittest
from unittest.mock import Mock
import subprocess
import json

import migration_contract as m


class MigrationTests(unittest.TestCase):
    def sample(self):
        return [{'name':'20260101_fixture','checksum':'a'*64}], [
            {'name':'20260101_fixture','checksum':'a'*64,'finished':True,'rolled_back':False}]

    def test_identical_history_and_rolled_back_attempt(self):
        files,rows=self.sample()
        self.assertEqual(m.validate(files,rows)['status'],'pass')
        rows.append({**rows[0],'finished':False,'rolled_back':True})
        self.assertEqual(m.validate(files,rows)['migration_count'],1)

    def test_missing_changed_extra_duplicate_or_incomplete_blocks_startup(self):
        for case in ('missing','changed','extra','duplicate','incomplete'):
            files,rows=self.sample()
            if case=='missing':rows=[]
            if case=='changed':rows[0]['checksum']='b'*64
            if case=='extra':rows.append({**rows[0],'name':'20260102_extra'})
            if case=='duplicate':rows+=copy.deepcopy(rows)
            if case=='incomplete':rows[0]['finished']=False
            with self.subTest(case=case),self.assertRaises(m.Rejected):m.validate(files,rows)

    def test_observer_has_read_only_sql(self):
        self.assertIn('REPEATABLE READ READ ONLY',m.DATABASE_ROWS)
        self.assertIn("statement_timeout='5s'",m.DATABASE_ROWS)
        for word in ('INSERT ','UPDATE ','DELETE ','ALTER ','CREATE ','DROP '):
            self.assertNotIn(word,m.DATABASE_ROWS.upper())

    def test_observer_requires_pristine_image_proof_before_database_query(self):
        docker=Mock()
        files,rows=self.sample()
        docker.run.return_value=subprocess.CompletedProcess([],0,json.dumps(files).encode())
        with self.assertRaisesRegex(m.Rejected,'pristine-image-evidence-required'):
            m.observe(docker,'a'*64,'b'*64)
        self.assertEqual(docker.run.call_count,1)

    def test_observer_binds_pristine_image_history_in_read_only_transaction(self):
        docker=Mock()
        files,rows=self.sample()
        docker.run.side_effect=[subprocess.CompletedProcess([],0,json.dumps(files).encode()),
                                subprocess.CompletedProcess([],0,json.dumps(rows).encode())]
        result=m.observe(docker,'a'*64,'b'*64,pristine_files=files)
        self.assertTrue(result['image_origin_verified'])
        self.assertIn('READ ONLY',docker.run.call_args.kwargs['stdin'].decode())


if __name__=='__main__':unittest.main()
