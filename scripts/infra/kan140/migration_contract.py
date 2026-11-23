"""Read-only Prisma startup gate: never deploys or repairs a migration."""
import hashlib
import json
import re
import time


class Rejected(Exception):
    pass


def require(value, code):
    if not value:raise Rejected(code)


IMAGE_FILES = r"""
const fs=require('fs'),crypto=require('crypto'),root='prisma/postgresql-migrations';
const dirs=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory());
if(!dirs.length||dirs.length>512)throw Error('migration-file-limit');
const rows=dirs.map(e=>{if(!/^[a-zA-Z0-9_]+$/.test(e.name))throw Error('migration-name');
 const p=root+'/'+e.name+'/migration.sql',s=fs.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)throw Error('migration-file-policy');
 return {name:e.name,checksum:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')};});
console.log(JSON.stringify(rows));
"""
DATABASE_ROWS = '''BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s';
SELECT coalesce(json_agg(json_build_object(
'name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,
'rolled_back',rolled_back_at IS NOT NULL) ORDER BY migration_name),'[]')
FROM public."_prisma_migrations"; COMMIT;'''


def validate(files, rows):
    require(isinstance(files,list) and 0<len(files)<=512 and
            isinstance(rows,list) and 0<len(rows)<=1024,'migration-count')
    expected={}
    for row in files:
        require(set(row)=={'name','checksum'} and re.fullmatch(r'[A-Za-z0-9_]+',row['name'])
                and re.fullmatch(r'[a-f0-9]{64}',row['checksum']) and row['name'] not in expected,
                'migration-file-shape')
        expected[row['name']]=row['checksum']
    actual={}
    for row in rows:
        require(set(row)=={'name','checksum','finished','rolled_back'} and
                type(row['finished']) is bool and type(row['rolled_back']) is bool,
                'migration-row-shape')
        if row['rolled_back']:continue
        require(row['finished'] and row['name'] not in actual,'migration-incomplete')
        actual[row['name']]=row['checksum']
    require(actual==expected,'migration-history-drift')
    return {'status':'pass','gate':'canonical-startup-no-pending-migrations',
            'migration_count':len(expected),'history_sha256':hashlib.sha256(
                json.dumps(expected,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'observed_at':int(time.time()),'database_writes':False}


def observe(docker, postgres_id, evolution_id, *, pristine_files=None):
    require(all(isinstance(cid,str) and re.fullmatch(r'[a-f0-9]{64}',cid)
                for cid in (postgres_id,evolution_id)),'migration-container-id')
    files=json.loads(docker.run('exec',evolution_id,'node','-e',IMAGE_FILES).stdout)
    require(isinstance(pristine_files,list) and sorted(files,key=lambda r:r['name']) ==
            sorted(pristine_files,key=lambda r:r['name']),'pristine-image-evidence-required')
    raw=docker.run('exec','-i',postgres_id,'sh','-ec',
        'export PGPASSWORD="$(cat /run/secrets/pg_admin_password)"; '
        'exec psql -X -qAt -w -U evolution_admin -d evolution -v ON_ERROR_STOP=1',
        stdin=DATABASE_ROWS.encode()).stdout
    result=validate(pristine_files,json.loads(raw))
    result['image_origin_verified']=True
    return result
