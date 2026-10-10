
CREATE TYPE public.app_role AS ENUM ('passenger','driver','ops_agent','safety_reviewer','finance','admin');
CREATE TYPE public.booking_state AS ENUM ('DRAFT','QUOTED','SEARCHING','MATCH_PROPOSED','MATCH_CONFIRMED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','PASSENGER_ONBOARD','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED','SUPPORT_REVIEW');
CREATE TYPE public.ride_mode AS ENUM ('PRIVATE','SHARE_AND_SAVE','SHARED_NOW','BUDGET','GROUP_PRIVATE');
CREATE TYPE public.trip_state AS ENUM ('planned','driver_en_route','in_progress','completed','cancelled');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone text,
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','bn','hi')),
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','restricted','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE TABLE public.passenger_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  accessibility_needs text[] NOT NULL DEFAULT '{}',
  notification_prefs jsonb NOT NULL DEFAULT '{"sms":false,"in_app":true}',
  trusted_contact_name text,
  trusted_contact_phone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.driver_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  display_name text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','in_review','verified','rejected','expired')),
  availability_status text NOT NULL DEFAULT 'offline' CHECK (availability_status IN ('offline','online','on_trip')),
  current_lat double precision,
  current_lng double precision,
  location_updated_at timestamptz,
  rating_avg numeric(3,2),
  rating_count integer NOT NULL DEFAULT 0,
  restricted_until timestamptz,
  restriction_reason text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_driver_avail ON public.driver_profiles (availability_status, verification_status);
CREATE INDEX idx_driver_loc ON public.driver_profiles (current_lat, current_lng);

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('hatchback','sedan','suv')),
  registration_ref text NOT NULL,
  seating_capacity integer NOT NULL CHECK (seating_capacity BETWEEN 1 AND 8),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','in_review','verified','rejected','expired')),
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_vehicle_active_per_driver ON public.vehicles (driver_id) WHERE is_active;

CREATE TABLE public.verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('driver','vehicle')),
  subject_id uuid NOT NULL,
  record_type text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_review','verified','rejected','expired')),
  verified_at timestamptz,
  expires_at timestamptz,
  document_ref text,
  reviewed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verif_subject ON public.verification_records (subject_type, subject_id);

CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pilot_unvalidated' CHECK (status IN ('pilot_unvalidated','active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pricing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'retired' CHECK (status IN ('active','retired')),
  business_approved boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_one_active_pricing ON public.pricing_versions (status) WHERE status = 'active';
CREATE TABLE public.category_rules (
  code text PRIMARY KEY,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'unavailable_pending_review' CHECK (status IN ('unavailable_pending_review','available')),
  description text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.app_config (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL,
  ride_mode public.ride_mode NOT NULL,
  pickup_label text NOT NULL, pickup_lat double precision NOT NULL, pickup_lng double precision NOT NULL,
  dropoff_label text NOT NULL, dropoff_lat double precision NOT NULL, dropoff_lng double precision NOT NULL,
  passenger_count integer NOT NULL CHECK (passenger_count BETWEEN 1 AND 7),
  vehicle_type text NOT NULL DEFAULT 'hatchback',
  distance_m integer NOT NULL, duration_s integer NOT NULL,
  private_reference_fare bigint NOT NULL CHECK (private_reference_fare >= 0),
  initial_fare_ceiling bigint NOT NULL CHECK (initial_fare_ceiling >= 0),
  guaranteed_discount bigint NOT NULL DEFAULT 0 CHECK (guaranteed_discount >= 0),
  current_guaranteed_payable bigint NOT NULL,
  potential_additional_discount bigint NOT NULL DEFAULT 0,
  budget_paise bigint,
  shared_trip_id uuid,
  pricing_version text NOT NULL,
  calculation jsonb NOT NULL,
  routing_provider text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_guaranteed_payable <= initial_fare_ceiling)
);
CREATE INDEX idx_quotes_passenger ON public.quotes (passenger_id, created_at DESC);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL,
  quote_id uuid NOT NULL UNIQUE REFERENCES public.quotes(id),
  ride_mode public.ride_mode NOT NULL,
  passenger_count integer NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'hatchback',
  pickup_label text NOT NULL, pickup_lat double precision NOT NULL, pickup_lng double precision NOT NULL,
  dropoff_label text NOT NULL, dropoff_lat double precision NOT NULL, dropoff_lng double precision NOT NULL,
  solo_distance_m integer NOT NULL,
  window_start timestamptz NOT NULL, window_end timestamptz NOT NULL,
  max_detour_pct integer NOT NULL DEFAULT 25 CHECK (max_detour_pct BETWEEN 0 AND 100),
  category_preference text,
  language_preference text,
  accessibility jsonb NOT NULL DEFAULT '{}',
  state public.booking_state NOT NULL DEFAULT 'QUOTED',
  private_reference_fare bigint NOT NULL,
  confirmed_fare_ceiling bigint NOT NULL,
  current_guaranteed_payable bigint NOT NULL,
  final_fare bigint,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','digital')),
  idempotency_key text NOT NULL,
  share_token text UNIQUE,
  version integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  arrived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passenger_id, idempotency_key),
  CHECK (current_guaranteed_payable <= confirmed_fare_ceiling),
  CHECK (final_fare IS NULL OR final_fare <= confirmed_fare_ceiling)
);
CREATE INDEX idx_bookings_state ON public.bookings (state, created_at DESC);
CREATE INDEX idx_bookings_passenger ON public.bookings (passenger_id, created_at DESC);
CREATE INDEX idx_bookings_pickup ON public.bookings (pickup_lat, pickup_lng);

CREATE TABLE public.booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  from_state public.booking_state, to_state public.booking_state NOT NULL,
  actor_id uuid, actor_role text NOT NULL, reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_events ON public.booking_events (booking_id, created_at);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.driver_profiles(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  is_shared boolean NOT NULL,
  category text,
  state public.trip_state NOT NULL DEFAULT 'planned',
  planned_start timestamptz NOT NULL DEFAULT now(),
  planned_distance_m integer, planned_duration_s integer,
  route jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz, completed_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_driver_one_active_trip ON public.trips (driver_id) WHERE state IN ('planned','driver_en_route','in_progress');
CREATE INDEX idx_trips_state ON public.trips (state, created_at DESC);

CREATE TABLE public.trip_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  pickup_seq integer NOT NULL, dropoff_seq integer NOT NULL,
  assignment_state text NOT NULL DEFAULT 'proposed' CHECK (assignment_state IN ('proposed','confirmed','removed','completed')),
  proposal_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pickup_seq < dropoff_seq)
);
CREATE UNIQUE INDEX uq_booking_one_active_assignment ON public.trip_bookings (booking_id) WHERE assignment_state IN ('proposed','confirmed');

CREATE TABLE public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  seq integer NOT NULL,
  stop_type text NOT NULL CHECK (stop_type IN ('pickup','dropoff')),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  label text NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL,
  planned_arrival timestamptz, actual_arrival timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','arrived','done','skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_stops ON public.trip_stops (trip_id, seq);

CREATE TABLE public.trip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.trips(id), booking_id uuid REFERENCES public.bookings(id),
  event_type text NOT NULL, actor_id uuid, payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fare_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  trip_id uuid REFERENCES public.trips(id),
  quoted_amount bigint NOT NULL, guaranteed_amount bigint NOT NULL, final_amount bigint,
  allocation_method text NOT NULL, pricing_version text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fare_alloc ON public.fare_allocations (booking_id, created_at DESC);

CREATE TABLE public.fare_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  entry_type text NOT NULL,
  amount_paise bigint NOT NULL,
  reason text, reference text, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fare_ledger ON public.fare_ledger (booking_id, created_at);

CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.driver_profiles(id),
  period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
  gross_payout bigint NOT NULL, cash_collected bigint NOT NULL, net_due bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid_simulated')),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.driver_payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.trips(id),
  booking_id uuid REFERENCES public.bookings(id),
  driver_id uuid NOT NULL REFERENCES public.driver_profiles(id),
  entry_type text NOT NULL,
  amount_paise bigint NOT NULL,
  reason text,
  settlement_id uuid REFERENCES public.settlements(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_driver ON public.driver_payout_ledger (driver_id, created_at);

CREATE TABLE public.negotiation_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  created_by uuid,
  party text NOT NULL CHECK (party IN ('passenger','driver')),
  driver_id uuid REFERENCES public.driver_profiles(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','rejected','countered','expired')),
  parent_offer_id uuid REFERENCES public.negotiation_offers(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offers_booking ON public.negotiation_offers (booking_id, status);

CREATE TABLE public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  provider text NOT NULL,
  provider_reference text UNIQUE,
  method text NOT NULL CHECK (method IN ('cash','digital')),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  status text NOT NULL CHECK (status IN ('due','pending','collected','succeeded','failed','refunded')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  payment_id uuid REFERENCES public.payment_records(id),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','processed_simulated')),
  requested_by uuid, decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.safety_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id), trip_id uuid REFERENCES public.trips(id),
  reporter_id uuid NOT NULL, reporter_role text NOT NULL,
  subject_driver_id uuid REFERENCES public.driver_profiles(id),
  category text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'unassessed' CHECK (severity IN ('unassessed','low','medium','high','critical')),
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','triaged','escalated','under_review','interim_action','resolved','appealed')),
  assigned_to uuid,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_status ON public.safety_incidents (status, severity, created_at DESC);
CREATE TABLE public.incident_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.safety_incidents(id),
  actor_id uuid NOT NULL, action text NOT NULL, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id),
  opened_by uuid NOT NULL, category text NOT NULL, description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, title text NOT NULL, body text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app', delivery_status text NOT NULL DEFAULT 'delivered_in_app',
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications (user_id, created_at DESC);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, action text NOT NULL, entity_type text NOT NULL, entity_id text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit ON public.audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Table % is append-only; use a compensating entry', TG_TABLE_NAME; END $$;
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON public.fare_ledger FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only BEFORE DELETE ON public.driver_payout_ledger FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON public.fare_allocations FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON public.booking_events FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON public.incident_actions FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only BEFORE UPDATE OR DELETE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only_del BEFORE DELETE ON public.pricing_versions FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
CREATE TRIGGER t_append_only_upd BEFORE UPDATE ON public.pricing_versions FOR EACH ROW WHEN (OLD.config IS DISTINCT FROM NEW.config OR OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION public.forbid_mutation();

CREATE OR REPLACE FUNCTION public.payout_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_paise <> OLD.amount_paise OR NEW.entry_type <> OLD.entry_type OR NEW.driver_id <> OLD.driver_id
     OR (OLD.settlement_id IS NOT NULL) THEN
    RAISE EXCEPTION 'driver_payout_ledger is append-only (only one-time settlement linking allowed)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_payout_guard BEFORE UPDATE ON public.driver_payout_ledger FOR EACH ROW EXECUTE FUNCTION public.payout_ledger_guard();

CREATE OR REPLACE FUNCTION public.enforce_booking_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.confirmed_fare_ceiling <> OLD.confirmed_fare_ceiling OR NEW.private_reference_fare <> OLD.private_reference_fare THEN
    RAISE EXCEPTION 'Confirmed fare ceiling and reference fare are immutable';
  END IF;
  IF NEW.current_guaranteed_payable > OLD.current_guaranteed_payable THEN
    RAISE EXCEPTION 'Guaranteed payable cannot increase (% -> %)', OLD.current_guaranteed_payable, NEW.current_guaranteed_payable;
  END IF;
  IF OLD.final_fare IS NOT NULL AND NEW.final_fare IS DISTINCT FROM OLD.final_fare THEN
    RAISE EXCEPTION 'Final fare is immutable; use compensating ledger entries';
  END IF;
  IF NEW.state <> OLD.state THEN
    ok := CASE OLD.state
      WHEN 'DRAFT' THEN NEW.state IN ('QUOTED','CANCELLED')
      WHEN 'QUOTED' THEN NEW.state IN ('SEARCHING','MATCH_CONFIRMED','EXPIRED','CANCELLED')
      WHEN 'SEARCHING' THEN NEW.state IN ('MATCH_PROPOSED','EXPIRED','CANCELLED','SUPPORT_REVIEW')
      WHEN 'MATCH_PROPOSED' THEN NEW.state IN ('MATCH_CONFIRMED','SEARCHING','CANCELLED','EXPIRED')
      WHEN 'MATCH_CONFIRMED' THEN NEW.state IN ('DRIVER_EN_ROUTE','SEARCHING','CANCELLED','SUPPORT_REVIEW')
      WHEN 'DRIVER_EN_ROUTE' THEN NEW.state IN ('DRIVER_ARRIVED','SEARCHING','CANCELLED','SUPPORT_REVIEW')
      WHEN 'DRIVER_ARRIVED' THEN NEW.state IN ('PASSENGER_ONBOARD','CANCELLED','SUPPORT_REVIEW')
      WHEN 'PASSENGER_ONBOARD' THEN NEW.state IN ('IN_PROGRESS','SUPPORT_REVIEW')
      WHEN 'IN_PROGRESS' THEN NEW.state IN ('COMPLETED','SUPPORT_REVIEW')
      WHEN 'COMPLETED' THEN NEW.state IN ('SUPPORT_REVIEW')
      WHEN 'SUPPORT_REVIEW' THEN NEW.state IN ('CANCELLED','COMPLETED','SEARCHING')
      ELSE false END;
    IF NOT ok THEN RAISE EXCEPTION 'Invalid booking transition % -> %', OLD.state, NEW.state; END IF;
    IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'Version must increment on state change (optimistic concurrency)'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER t_booking_rules BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_rules();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.passenger_profiles (user_id) VALUES (NEW.id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'passenger');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT SELECT ON public.profiles, public.user_roles, public.passenger_profiles, public.driver_profiles, public.vehicles,
  public.verification_records, public.service_areas, public.pricing_versions, public.category_rules, public.app_config,
  public.quotes, public.bookings, public.booking_events, public.trips, public.trip_bookings, public.trip_stops, public.trip_events,
  public.fare_allocations, public.fare_ledger, public.settlements, public.driver_payout_ledger, public.negotiation_offers,
  public.payment_records, public.payment_webhook_events, public.refunds, public.safety_incidents, public.incident_actions,
  public.support_cases, public.notifications, public.audit_logs TO authenticated;
GRANT SELECT ON public.service_areas, public.pricing_versions, public.category_rules, public.app_config TO anon;
GRANT UPDATE (display_name, phone, preferred_language) ON public.profiles TO authenticated;
GRANT UPDATE (accessibility_needs, notification_prefs, trusted_contact_name, trusted_contact_phone) ON public.passenger_profiles TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM anon;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fare_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fare_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_payout_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_driver_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.driver_profiles WHERE user_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.owns_booking(_booking uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bookings WHERE id = _booking AND passenger_id = auth.uid())
$$;

CREATE POLICY own_profile_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer']::public.app_role[]));
CREATE POLICY own_profile_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY own_roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY own_pp ON public.passenger_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_pp_upd ON public.passenger_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY driver_read ON public.driver_profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer','finance']::public.app_role[]));
CREATE POLICY vehicle_read ON public.vehicles FOR SELECT TO authenticated USING (driver_id = public.my_driver_id() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer']::public.app_role[]));
CREATE POLICY verif_read ON public.verification_records FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['ops_agent','admin']::public.app_role[]));
CREATE POLICY public_cfg_sa ON public.service_areas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_cfg_pv ON public.pricing_versions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_cfg_cr ON public.category_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_cfg_ac ON public.app_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY quotes_read ON public.quotes FOR SELECT TO authenticated USING (passenger_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','finance']::public.app_role[]));
CREATE POLICY bookings_read ON public.bookings FOR SELECT TO authenticated USING (passenger_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','finance','safety_reviewer']::public.app_role[]));
CREATE POLICY bevents_read ON public.booking_events FOR SELECT TO authenticated USING (public.owns_booking(booking_id) OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer']::public.app_role[]));
CREATE POLICY trips_read ON public.trips FOR SELECT TO authenticated USING (driver_id = public.my_driver_id() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer','finance']::public.app_role[]));
CREATE POLICY tb_read ON public.trip_bookings FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer']::public.app_role[]));
CREATE POLICY ts_read ON public.trip_stops FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer']::public.app_role[]));
CREATE POLICY te_read ON public.trip_events FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','safety_reviewer']::public.app_role[]));
CREATE POLICY fa_read ON public.fare_allocations FOR SELECT TO authenticated USING (public.owns_booking(booking_id) OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','finance']::public.app_role[]));
CREATE POLICY fl_read ON public.fare_ledger FOR SELECT TO authenticated USING (public.owns_booking(booking_id) OR public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.app_role[]));
CREATE POLICY st_read ON public.settlements FOR SELECT TO authenticated USING (driver_id = public.my_driver_id() OR public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.app_role[]));
CREATE POLICY dpl_read ON public.driver_payout_ledger FOR SELECT TO authenticated USING (driver_id = public.my_driver_id() OR public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.app_role[]));
CREATE POLICY offers_read ON public.negotiation_offers FOR SELECT TO authenticated USING (public.owns_booking(booking_id) OR driver_id = public.my_driver_id() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin']::public.app_role[]));
CREATE POLICY pay_read ON public.payment_records FOR SELECT TO authenticated USING (public.owns_booking(booking_id) OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','finance']::public.app_role[]));
CREATE POLICY pwe_read ON public.payment_webhook_events FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','finance']::public.app_role[]));
CREATE POLICY refunds_read ON public.refunds FOR SELECT TO authenticated USING (public.owns_booking(booking_id) OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin','finance']::public.app_role[]));
CREATE POLICY inc_read ON public.safety_incidents FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['safety_reviewer','admin']::public.app_role[]));
CREATE POLICY inca_read ON public.incident_actions FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['safety_reviewer','admin']::public.app_role[]));
CREATE POLICY sc_read ON public.support_cases FOR SELECT TO authenticated USING (opened_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['ops_agent','admin']::public.app_role[]));
CREATE POLICY notif_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_upd ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY audit_read ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_config (key, value) VALUES
 ('demo_mode', 'true'),
 ('integrations', '{"routing":"simulated","maps":"none","sms":"simulated","payments":"sandbox"}');
INSERT INTO public.service_areas (name, config, status) VALUES
 ('Duttapukur–Barasat–Madhyamgram–Kolkata corridor (DEMO, unvalidated)', '{"bbox":{"minLat":22.54,"maxLat":22.80,"minLng":88.33,"maxLng":88.56}}', 'pilot_unvalidated');
INSERT INTO public.pricing_versions (version, config, status, business_approved) VALUES ('v1-demo', '{
 "version":"v1-demo","base_fare_paise":4000,"per_km_paise":1400,"per_min_paise":100,"min_fare_paise":6000,
 "platform_commission_bps":1500,"share_guaranteed_discount_bps":800,"share_potential_max_discount_bps":4000,
 "driver_shared_payout_multiplier_bps":10500,"driver_operating_cost_per_km_paise":500,
 "vehicle_multiplier_bps":{"hatchback":10000,"sedan":11500,"suv":14000},
 "negotiation_min_fare_bps":8500,"quote_ttl_s":600,"offer_ttl_s":180,"noshow_grace_s":300,"cancellation_fee_paise":0,
 "max_pickup_radius_m":4000,"road_factor_bps":13000,"avg_speed_kmph":22}', 'active', false);
INSERT INTO public.category_rules (code, label, status, description) VALUES
 ('WOMEN_ONLY','Women only','unavailable_pending_review','Requires legal/operational review before launch.'),
 ('MEN_ONLY','Men only','unavailable_pending_review','Requires legal/operational review before launch.'),
 ('SENIOR_FRIENDLY','Senior friendly','unavailable_pending_review','Extra boarding time and accessibility support; not senior-only. Pending review.'),
 ('SAFE_RIDE_HOME','Safe ride home','unavailable_pending_review','Private by default when shared suitability is uncertain. Pending review.');

INSERT INTO public.driver_profiles (id, display_name, verification_status, availability_status, current_lat, current_lng, location_updated_at, rating_avg, rating_count, is_demo) VALUES
 ('d0000000-0000-4000-8000-000000000001','DEMO · Rahul D.','verified','on_trip',22.772,88.534,now(),4.80,212,true),
 ('d0000000-0000-4000-8000-000000000002','DEMO · Sanjay M.','verified','online',22.720,88.478,now(),4.70,140,true),
 ('d0000000-0000-4000-8000-000000000003','DEMO · Mithu P.','verified','online',22.696,88.457,now(),4.90,88,true),
 ('d0000000-0000-4000-8000-000000000004','DEMO · Arif K.','verified','online',22.624,88.420,now(),4.60,301,true),
 ('d0000000-0000-4000-8000-000000000005','DEMO · Bapi S.','in_review','offline',22.567,88.371,now(),NULL,0,true);
INSERT INTO public.vehicles (id, driver_id, vehicle_type, registration_ref, seating_capacity, verification_status, is_demo) VALUES
 ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','hatchback','DEMO-WB-01',4,'verified',true),
 ('e0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002','sedan','DEMO-WB-02',4,'verified',true),
 ('e0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000003','hatchback','DEMO-WB-03',4,'verified',true),
 ('e0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000004','suv','DEMO-WB-04',6,'verified',true),
 ('e0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000005','hatchback','DEMO-WB-05',4,'in_review',true);
INSERT INTO public.verification_records (subject_type, subject_id, record_type, status, verified_at, expires_at, notes) VALUES
 ('driver','d0000000-0000-4000-8000-000000000001','driving_licence','verified',now(),now()+interval '2 years','DEMO record — no real document'),
 ('driver','d0000000-0000-4000-8000-000000000005','driving_licence','in_review',NULL,NULL,'DEMO record — no real document');

INSERT INTO public.quotes (id, passenger_id, ride_mode, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng, passenger_count, distance_m, duration_s, private_reference_fare, initial_fare_ceiling, guaranteed_discount, current_guaranteed_payable, potential_additional_discount, pricing_version, calculation, routing_provider, expires_at)
VALUES ('a0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000de','SHARE_AND_SAVE','Duttapukur Station',22.772,88.534,'Sealdah Station',22.567,88.370,1,36833,6027,65611,65611,5249,60362,20995,'v1-demo','{"demo":true}','simulated-haversine', now()+interval '10 minutes');
INSERT INTO public.bookings (id, passenger_id, quote_id, ride_mode, passenger_count, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng, solo_distance_m, window_start, window_end, max_detour_pct, state, private_reference_fare, confirmed_fare_ceiling, current_guaranteed_payable, idempotency_key, is_demo)
VALUES ('b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000de','a0000000-0000-4000-8000-000000000001','SHARE_AND_SAVE',1,'Duttapukur Station',22.772,88.534,'Sealdah Station',22.567,88.370,36833, now(), now()+interval '7 days', 30,'MATCH_CONFIRMED',65611,65611,60362,'demo-seed-1',true);
INSERT INTO public.trips (id, driver_id, vehicle_id, is_shared, state, planned_start, planned_distance_m, planned_duration_s, is_demo)
VALUES ('c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',true,'planned', now(), 36833, 6027, true);
INSERT INTO public.trip_bookings (trip_id, booking_id, pickup_seq, dropoff_seq, assignment_state) VALUES ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',1,2,'confirmed');
INSERT INTO public.trip_stops (trip_id, seq, stop_type, booking_id, label, lat, lng) VALUES
 ('c0000000-0000-4000-8000-000000000001',1,'pickup','b0000000-0000-4000-8000-000000000001','Duttapukur Station',22.772,88.534),
 ('c0000000-0000-4000-8000-000000000001',2,'dropoff','b0000000-0000-4000-8000-000000000001','Sealdah Station',22.567,88.370);
INSERT INTO public.fare_allocations (booking_id, trip_id, quoted_amount, guaranteed_amount, allocation_method, pricing_version, snapshot)
VALUES ('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',65611,60362,'solo-share-guarantee','v1-demo','{"demo":true}');
INSERT INTO public.booking_events (booking_id, from_state, to_state, actor_role, reason) VALUES ('b0000000-0000-4000-8000-000000000001',NULL,'MATCH_CONFIRMED','system','DEMO seed');
