-- Retain old versions with an honest legacy status. New application uploads carry
-- a transaction-local attestation for exactly the bytes accepted by the scanner.
CREATE FUNCTION ootla_attest_file_scan() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attestation jsonb;
BEGIN
 attestation:=NULLIF(current_setting('ootla.file_scan',true),'')::jsonb;
 IF attestation->>'engine' IN ('clamav','demo') AND attestation->>'sha256'=encode(sha256(NEW.content),'hex') THEN
  NEW.scan_status:=attestation->>'engine'; NEW.scanned_at:=now();
 ELSE NEW.scan_status:='legacy_unscanned'; NEW.scanned_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
DO $$
DECLARE table_name text; constraint_row record;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['lead_documents','application_documents','resident_request_documents','maintenance_photos','vendor_job_files','inspection_photos','resident_document_versions'] LOOP
  FOR constraint_row IN SELECT conname FROM pg_constraint WHERE conrelid=table_name::regclass AND contype='c' AND (pg_get_constraintdef(oid) LIKE '%2097152%' OR pg_get_constraintdef(oid) LIKE '%5242880%') LOOP
   EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',table_name,constraint_row.conname);
  END LOOP;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK(octet_length(content) BETWEEN 1 AND 20971520)',table_name,table_name||'_document_limit');
  EXECUTE format('ALTER TABLE %I ADD COLUMN scan_status text NOT NULL DEFAULT ''legacy_unscanned'' CHECK(scan_status IN (''legacy_unscanned'',''clamav'',''demo'')), ADD COLUMN scanned_at timestamptz',table_name);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF content ON %I FOR EACH ROW EXECUTE FUNCTION ootla_attest_file_scan()',table_name||'_scan',table_name);
 END LOOP;
END $$;
