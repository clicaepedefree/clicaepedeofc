ALTER TABLE "internal_operation_audit_logs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "internal_operation_audit_logs" FROM anon;
REVOKE ALL ON TABLE "internal_operation_audit_logs" FROM authenticated;

REVOKE ALL ON SEQUENCE "internal_operation_audit_logs_id_seq" FROM anon;
REVOKE ALL ON SEQUENCE "internal_operation_audit_logs_id_seq" FROM authenticated;
