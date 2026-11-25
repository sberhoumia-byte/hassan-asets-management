-- المرحلة 7: سجل إصدارات الوثائق غير قابل للتعديل أو الحذف، والوثيقة لا تُحذف (أرشفة فقط).
CREATE TRIGGER document_versions_append_only
  BEFORE UPDATE OR DELETE ON document_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER documents_no_delete
  BEFORE DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
