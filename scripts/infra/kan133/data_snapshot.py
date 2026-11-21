"""Bounded semantic PostgreSQL row/sequence fingerprints; never export row values.

Run SQL with psql -X -qAt -v ON_ERROR_STOP=1. PostgreSQL format() quotes every
identifier/literal; gexec retains one read-only transaction for table contents.
Sequence state is nontransactional; the caller must quiesce all writers.
"""
import json
import re

SQL = r'''\set QUIET 1
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SET LOCAL intervalstyle = 'postgres';
SET LOCAL bytea_output = 'hex';
SET LOCAL extra_float_digits = 3;
SET LOCAL work_mem = '4MB';
SET LOCAL temp_file_limit = '32MB';
SET LOCAL statement_timeout = '8s';
SET LOCAL transaction_timeout = '60s';
SELECT json_build_object('kind','manifest',
 'tables',(SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'),
 'sequences',(SELECT count(*) FROM pg_catalog.pg_sequences WHERE schemaname='public'));
WITH columns AS (
 SELECT p.schemaname,p.tablename,a.attnum,
 CASE
 WHEN a.atttypid IN ('text'::regtype,'varchar'::regtype,'bpchar'::regtype,'bytea'::regtype)
 THEN format('coalesce(octet_length(t.%I),0)::bigint * 2 + 8',a.attname)
 WHEN typ.typtype='e' OR a.atttypid IN
  ('bool'::regtype,'int2'::regtype,'int4'::regtype,'int8'::regtype,'oid'::regtype,
   'float4'::regtype,'float8'::regtype,'date'::regtype,'time'::regtype,
   'timestamp'::regtype,'timestamptz'::regtype,'interval'::regtype,'timetz'::regtype,
   'uuid'::regtype,'name'::regtype)
 THEN '256::bigint'
 WHEN a.atttypid='jsonb'::regtype THEN format($guard$
  CASE WHEN t.%1$I IS NULL THEN 8
   WHEN pg_column_compression(t.%1$I) IS NOT NULL OR pg_column_size(t.%1$I)>8192 THEN 1048577
   WHEN CASE WHEN jsonb_typeof(t.%1$I)='number' THEN
     scale((t.%1$I)::numeric)>64 OR abs((t.%1$I)::numeric)>1e64 ELSE false END
    OR EXISTS(SELECT 1 FROM jsonb_path_query(t.%1$I,'lax $.** ? (@.type() == "number")') AS j(v)
              WHERE scale(j.v::numeric)>64 OR abs(j.v::numeric)>1e64)
   THEN 1048577 ELSE pg_column_size(t.%1$I)::bigint*128+32 END
 $guard$,a.attname)
 ELSE format('CASE WHEN t.%I IS NULL THEN 8 ELSE 1048577 END',a.attname)
 END AS estimate
 FROM pg_catalog.pg_tables p
 JOIN pg_catalog.pg_namespace n ON n.nspname=p.schemaname
 JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=p.tablename
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 JOIN pg_catalog.pg_type typ ON typ.oid=a.atttypid
 WHERE p.schemaname='public'
), budgets AS (
 SELECT schemaname,tablename,string_agg(estimate,' + ' ORDER BY attnum) AS estimate
 FROM columns GROUP BY schemaname,tablename
)
SELECT format($query$
 SELECT json_build_object('kind','budget','name',%L,'safe',
  1 / CASE WHEN coalesce(bool_and((%s)<=1048576),true) THEN 1 ELSE 0 END)
 FROM (SELECT * FROM %I.%I LIMIT 100001) AS t;
 SELECT json_build_object('kind','table','name',%L,'rows',count(*),
  'sha256',encode(sha256(convert_to(coalesce(string_agg(digest,'|' ORDER BY digest COLLATE "C"),''),'UTF8')),'hex'))
 FROM (SELECT encode(sha256(convert_to(ROW(t.*)::text,'UTF8')),'hex') AS digest
       FROM %I.%I AS t LIMIT 100001) AS snapshot_rows;
$query$,tablename,estimate,schemaname,tablename,tablename,schemaname,tablename)
FROM budgets ORDER BY tablename
\gexec
SELECT format($query$
 SELECT json_build_object('kind','sequence','name',%L,'last_value',last_value::text,'is_called',is_called)
 FROM %I.%I;
$query$,sequencename,schemaname,sequencename)
FROM pg_catalog.pg_sequences WHERE schemaname='public' ORDER BY sequencename
\gexec
COMMIT;
'''


class SnapshotError(ValueError):
    def __init__(self):
        super().__init__('postgres-data-fingerprint-rejected')


def require(value):
    if not value:
        raise SnapshotError()


def parse(raw):
    require(isinstance(raw, str) and 0 < len(raw.encode('utf-8')) <= 512 * 1024)
    try:
        def unique(pairs):
            result = {}
            for key, value in pairs:
                require(key not in result)
                result[key] = value
            return result
        rows = [json.loads(line, object_pairs_hook=unique) for line in raw.splitlines() if line.strip()]
        require(rows and all(isinstance(row, dict) for row in rows))
        head = rows[0]
        require(set(head) == {'kind', 'tables', 'sequences'} and head['kind'] == 'manifest')
        require(all(type(head[key]) is int and 0 <= head[key] <= 512
                    for key in ('tables', 'sequences')))
        require(len(rows) == 1 + 2 * head['tables'] + head['sequences'])
        tables, sequences, budgets = {}, {}, set()
        for row in rows[1:]:
            name = row.get('name')
            require(isinstance(name, str) and 0 < len(name.encode('utf-8')) <= 63 and '\x00' not in name)
            if row.get('kind') == 'budget':
                require(set(row) == {'kind', 'name', 'safe'} and name not in budgets
                        and type(row['safe']) is int and row['safe'] == 1)
                budgets.add(name)
            elif row.get('kind') == 'table':
                require(set(row) == {'kind', 'name', 'rows', 'sha256'} and name not in tables)
                require(name in budgets)
                require(type(row['rows']) is int and 0 <= row['rows'] <= 100000)
                require(isinstance(row['sha256'], str) and re.fullmatch(r'[a-f0-9]{64}', row['sha256']))
                tables[name] = {'rows': row['rows'], 'sha256': row['sha256']}
            elif row.get('kind') == 'sequence':
                require(set(row) == {'kind', 'name', 'last_value', 'is_called'} and name not in sequences)
                require(isinstance(row['last_value'], str) and
                        re.fullmatch(r'-?[0-9]{1,19}', row['last_value']))
                require(-(2**63) <= int(row['last_value']) <= 2**63 - 1 and
                        type(row['is_called']) is bool)
                sequences[name] = {'last_value': row['last_value'], 'is_called': row['is_called']}
            else:
                raise SnapshotError()
        require(set(tables) == budgets and len(tables) == head['tables']
                and len(sequences) == head['sequences'])
        return {'policy': 'pg17-record-row-sha256-v2', 'tables': tables, 'sequences': sequences}
    except (KeyError, TypeError, json.JSONDecodeError, UnicodeError):
        raise SnapshotError() from None


def collect(pg_execute):
    return parse(pg_execute(SQL))
