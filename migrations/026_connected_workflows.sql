CREATE TABLE lead_routing_policies (
 property_id uuid PRIMARY KEY REFERENCES properties(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 enabled boolean NOT NULL, time_zone text NOT NULL, members jsonb NOT NULL CHECK(jsonb_typeof(members)='array'),
 version integer NOT NULL DEFAULT 1, updated_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES organization_memberships(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lead_routing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), lead_id uuid NOT NULL REFERENCES leads(id),
 previous_owner uuid REFERENCES organization_memberships(id), owner_membership_id uuid REFERENCES organization_memberships(id),
 actor_id uuid REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_routing_events_lead ON lead_routing_events(lead_id,created_at DESC);
CREATE TABLE prospect_journeys (
 application_id uuid PRIMARY KEY REFERENCES applications(id), organization_id uuid NOT NULL REFERENCES organizations(id), lead_id uuid NOT NULL REFERENCES leads(id),
 request_key uuid NOT NULL, created_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES organization_memberships(id),
 shortlist_id uuid REFERENCES unit_shortlists(id), booking_invitation_id uuid REFERENCES viewing_invitations(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_key)
);
CREATE TABLE field_tour_notes (
 viewing_id uuid NOT NULL REFERENCES viewings(id), user_id uuid NOT NULL REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 notes text NOT NULL CHECK(length(notes)<=4000), version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(viewing_id,user_id)
);
