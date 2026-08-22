CREATE OR REPLACE FUNCTION "reject_internal_operation_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'internal_operation_audit_logs is append-only' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_internal_operation_audit_log_mutation"() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "internal_operation_audit_logs_append_only"
  ON "internal_operation_audit_logs";
DROP TRIGGER IF EXISTS "internal_operation_audit_logs_no_truncate"
  ON "internal_operation_audit_logs";

CREATE TRIGGER "internal_operation_audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "internal_operation_audit_logs"
FOR EACH ROW EXECUTE FUNCTION "reject_internal_operation_audit_log_mutation"();

CREATE TRIGGER "internal_operation_audit_logs_no_truncate"
BEFORE TRUNCATE ON "internal_operation_audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_internal_operation_audit_log_mutation"();

ALTER TABLE "internal_operation_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_operation_audit_logs" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "internal_operation_audit_logs" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "internal_operation_audit_logs_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "internal_operation_audit_logs" FROM service_role;
GRANT SELECT, INSERT ON TABLE "internal_operation_audit_logs" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "internal_operation_audit_logs_id_seq" TO service_role;

COMMENT ON TABLE "internal_operation_audit_logs" IS
  'Append-only internal operations audit trail. No public policies or UPDATE/DELETE grants.';
