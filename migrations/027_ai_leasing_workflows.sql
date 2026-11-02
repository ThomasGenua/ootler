ALTER TABLE property_knowledge ADD COLUMN public_answer boolean NOT NULL DEFAULT false;
ALTER TABLE property_knowledge ADD COLUMN expires_at timestamptz;
CREATE TABLE property_knowledge_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), knowledge_id uuid NOT NULL REFERENCES property_knowledge(id),
 organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL REFERENCES properties(id),
 version integer NOT NULL, title text NOT NULL, body text NOT NULL, source_url text NOT NULL,
 published boolean NOT NULL, public_answer boolean NOT NULL, expires_at timestamptz,
 updated_by uuid REFERENCES users(id), recorded_at timestamptz NOT NULL DEFAULT now(), UNIQUE(knowledge_id,version)
);
INSERT INTO property_knowledge_versions(knowledge_id,organization_id,property_id,version,title,body,source_url,published,public_answer,expires_at,updated_by)
 SELECT id,organization_id,property_id,version,title,body,source_url,published,public_answer,expires_at,updated_by FROM property_knowledge;
CREATE FUNCTION retain_property_knowledge_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO property_knowledge_versions(knowledge_id,organization_id,property_id,version,title,body,source_url,published,public_answer,expires_at,updated_by)
 VALUES(NEW.id,NEW.organization_id,NEW.property_id,NEW.version,NEW.title,NEW.body,NEW.source_url,NEW.published,NEW.public_answer,NEW.expires_at,NEW.updated_by);
 RETURN NEW; END $$;
CREATE TRIGGER retain_property_knowledge_version AFTER INSERT OR UPDATE ON property_knowledge FOR EACH ROW EXECUTE FUNCTION retain_property_knowledge_version();
CREATE TABLE property_ai_settings (
 property_id uuid PRIMARY KEY REFERENCES properties(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 concierge_enabled boolean NOT NULL DEFAULT false, website_origins jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES organization_memberships(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_workflow_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id uuid REFERENCES users(id), property_id uuid REFERENCES properties(id), application_id uuid REFERENCES applications(id),
 kind text NOT NULL CHECK(kind IN ('knowledge','concierge','reply','document','briefing')),
 request_key uuid NOT NULL, input_hash text NOT NULL, status text NOT NULL CHECK(status IN ('pending','completed','failed')),
 mode text NOT NULL CHECK(mode IN ('demo','live')), result jsonb, model text NOT NULL DEFAULT '',
 input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0,
 feedback text CHECK(feedback IN ('accepted','edited','dismissed')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_key)
);
CREATE INDEX ai_workflow_runs_usage ON ai_workflow_runs(organization_id,created_at);
CREATE TABLE ai_knowledge_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL REFERENCES properties(id),
 actor_id uuid NOT NULL REFERENCES users(id), request_key uuid NOT NULL, name text NOT NULL, media_type text NOT NULL, source_url text NOT NULL DEFAULT '',
 content bytea NOT NULL, sha256 text NOT NULL, result jsonb NOT NULL, run_id uuid NOT NULL REFERENCES ai_workflow_runs(id),
 version integer NOT NULL DEFAULT 1, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,request_key)
);
CREATE TABLE ai_knowledge_gaps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL REFERENCES properties(id),
 question text NOT NULL, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE concierge_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), form_id uuid NOT NULL REFERENCES intake_forms(id),
 token_digest text NOT NULL UNIQUE, history jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_document_reviews (
 run_id uuid PRIMARY KEY REFERENCES ai_workflow_runs(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 application_id uuid NOT NULL REFERENCES applications(id), participant_id uuid NOT NULL REFERENCES application_participants(id),
 document_id uuid NOT NULL REFERENCES application_documents(id), document_sha text NOT NULL, participant_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
