-- Private staff conversation history and explicit, auditable assistant approvals.
CREATE TABLE staff_assistant_chats (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_user_id uuid NOT NULL REFERENCES users(id),lead_id uuid,request_key uuid NOT NULL,payload_hash text NOT NULL,
 question text NOT NULL,answer text NOT NULL,cards jsonb NOT NULL DEFAULT '[]',proposal jsonb,
 decision text CHECK(decision IN ('pending','approved','skipped')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 mode text NOT NULL CHECK(mode IN ('records','demo','live')),result_url text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,actor_user_id,request_key),FOREIGN KEY(lead_id,organization_id) REFERENCES leads(id,organization_id),
 CHECK((proposal IS NULL)=(decision IS NULL))
);
CREATE INDEX staff_assistant_history ON staff_assistant_chats(organization_id,actor_user_id,created_at DESC);
