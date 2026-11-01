CREATE TABLE tour_feedback (
 viewing_id uuid PRIMARY KEY REFERENCES viewings(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 interest text NOT NULL CHECK(interest IN ('interested','considering','not_interested','not_attended')),
 next_step text NOT NULL CHECK(next_step IN ('application','another_tour','follow_up','close')), notes text NOT NULL,
 task_id uuid REFERENCES tasks(id), draft_id uuid REFERENCES conversation_messages(id), version integer NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE dashboard_preferences (
 organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 property_id uuid REFERENCES properties(id), owner_scope text NOT NULL CHECK(owner_scope IN ('me','team')),
 tiles jsonb NOT NULL, version integer NOT NULL DEFAULT 1, PRIMARY KEY(organization_id,user_id)
);
CREATE TABLE unit_shortlists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 lead_id uuid NOT NULL REFERENCES leads(id), title text NOT NULL, unit_ids uuid[] NOT NULL,
 token_digest text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1
);
CREATE TABLE shortlist_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shortlist_id uuid NOT NULL REFERENCES unit_shortlists(id),
 request_key uuid NOT NULL, payload_hash text NOT NULL, preferred_unit_ids uuid[] NOT NULL,
 viewing_requested boolean NOT NULL, note text NOT NULL, task_id uuid REFERENCES tasks(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shortlist_id,request_key)
);
CREATE TABLE property_playbooks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, snapshot jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE property_playbook_assignments (
 property_id uuid PRIMARY KEY REFERENCES properties(id), playbook_id uuid NOT NULL REFERENCES property_playbooks(id),
 template_ids uuid[] NOT NULL, inspection_template_ids uuid[] NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE followup_sequences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL REFERENCES properties(id),
 name text NOT NULL, steps jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sequence_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence_id uuid NOT NULL REFERENCES followup_sequences(id),
 lead_id uuid NOT NULL REFERENCES leads(id), start_stage text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 next_at timestamptz NOT NULL, step integer NOT NULL DEFAULT 0, status text NOT NULL CHECK(status IN ('active','paused','stopped','completed')),
 stop_reason text NOT NULL DEFAULT '', last_checked_at timestamptz, version integer NOT NULL DEFAULT 1, UNIQUE(sequence_id,lead_id)
);
CREATE INDEX sequence_enrollments_due ON sequence_enrollments(next_at,id) WHERE status='active';
CREATE TABLE sequence_step_runs (
 enrollment_id uuid NOT NULL REFERENCES sequence_enrollments(id), step integer NOT NULL,
 task_id uuid REFERENCES tasks(id), draft_id uuid REFERENCES conversation_messages(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enrollment_id,step)
);
ALTER TABLE task_creation_receipts DROP CONSTRAINT task_creation_receipts_namespace_check;
ALTER TABLE task_creation_receipts ADD CONSTRAINT task_creation_receipts_namespace_check CHECK(namespace IN ('lease_move_in','ai_follow_up','inspection_repair','leasing_workflow'));
