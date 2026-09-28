
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('dispatcher','hospital_staff','admin');
CREATE TYPE public.severity_level AS ENUM ('critical','serious','stable');
CREATE TYPE public.request_status AS ENUM ('new','pending_confirmation','accepted','en_route','arrived','handed_over','cancelled','expired');
CREATE TYPE public.assignment_status AS ENUM ('pending','accepted','rejected','expired','released','completed');

-- HOSPITALS
CREATE TABLE public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  capabilities text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals TO authenticated;
GRANT SELECT ON public.hospitals TO anon;
GRANT ALL ON public.hospitals TO service_role;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hospital_availability (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  icu_beds int NOT NULL DEFAULT 0,
  er_beds int NOT NULL DEFAULT 0,
  ventilators int NOT NULL DEFAULT 0,
  ot_available int NOT NULL DEFAULT 0,
  reserved_icu int NOT NULL DEFAULT 0,
  reserved_er int NOT NULL DEFAULT 0,
  reserved_ventilators int NOT NULL DEFAULT 0,
  reserved_ot int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CONSTRAINT reserved_icu_ok CHECK (reserved_icu >= 0 AND reserved_icu <= icu_beds),
  CONSTRAINT reserved_er_ok CHECK (reserved_er >= 0 AND reserved_er <= er_beds),
  CONSTRAINT reserved_vent_ok CHECK (reserved_ventilators >= 0 AND reserved_ventilators <= ventilators),
  CONSTRAINT reserved_ot_ok CHECK (reserved_ot >= 0 AND reserved_ot <= ot_available)
);
GRANT SELECT, INSERT, UPDATE ON public.hospital_availability TO authenticated;
GRANT SELECT ON public.hospital_availability TO anon;
GRANT ALL ON public.hospital_availability TO service_role;
ALTER TABLE public.hospital_availability ENABLE ROW LEVEL SECURITY;

-- PROFILES + ROLES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  theme_preference text NOT NULL DEFAULT 'system',
  language text NOT NULL DEFAULT 'en',
  high_contrast boolean NOT NULL DEFAULT false,
  sound_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.my_hospital_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hospital_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role',''), 'dispatcher')::public.app_role;
  INSERT INTO public.profiles (id, full_name, hospital_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name',''),
    NULLIF(NEW.raw_user_meta_data ->> 'hospital_id','')::uuid
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- REQUESTS
CREATE TABLE public.emergency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  patient_age int,
  patient_sex text,
  chief_complaint text NOT NULL,
  severity public.severity_level NOT NULL DEFAULT 'serious',
  required_capabilities text[] NOT NULL DEFAULT '{}',
  needs_icu boolean NOT NULL DEFAULT false,
  needs_er boolean NOT NULL DEFAULT true,
  needs_ventilator boolean NOT NULL DEFAULT false,
  needs_ot boolean NOT NULL DEFAULT false,
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  ambulance_id text NOT NULL DEFAULT '',
  status public.request_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_requests TO authenticated;
GRANT ALL ON public.emergency_requests TO service_role;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  status public.assignment_status NOT NULL DEFAULT 'pending',
  rank_score numeric,
  eta_minutes numeric,
  data_age_seconds int,
  reserved_resources jsonb NOT NULL DEFAULT '{}'::jsonb,
  reject_reason text,
  idempotency_key text UNIQUE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.handoff_events TO authenticated;
GRANT ALL ON public.handoff_events TO service_role;
ALTER TABLE public.handoff_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.handoff_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  content text NOT NULL,
  generated_by text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.handoff_briefs TO authenticated;
GRANT ALL ON public.handoff_briefs TO service_role;
ALTER TABLE public.handoff_briefs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "hospitals readable" ON public.hospitals FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "hospitals admin write" ON public.hospitals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "availability readable" ON public.hospital_availability FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "availability own hospital update" ON public.hospital_availability FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR hospital_id = public.my_hospital_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR hospital_id = public.my_hospital_id());
CREATE POLICY "availability admin insert" ON public.hospital_availability FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "requests read" ON public.emergency_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dispatcher')
    OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.request_id = emergency_requests.id AND a.hospital_id = public.my_hospital_id())
  );
CREATE POLICY "requests insert" ON public.emergency_requests FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(),'dispatcher') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "requests update" ON public.emergency_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.request_id = emergency_requests.id AND a.hospital_id = public.my_hospital_id())
  ) WITH CHECK (true);

CREATE POLICY "assignments read" ON public.assignments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dispatcher')
    OR hospital_id = public.my_hospital_id()
  );
CREATE POLICY "assignments update" ON public.assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR hospital_id = public.my_hospital_id())
  WITH CHECK (true);

CREATE POLICY "events read" ON public.handoff_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dispatcher')
    OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.request_id = handoff_events.request_id AND a.hospital_id = public.my_hospital_id())
  );
CREATE POLICY "events insert" ON public.handoff_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

CREATE POLICY "briefs read" ON public.handoff_briefs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'dispatcher')
    OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.request_id = handoff_briefs.request_id AND a.hospital_id = public.my_hospital_id())
  );
CREATE POLICY "briefs insert" ON public.handoff_briefs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notifications own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications own update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- RESERVATION LOGIC
CREATE OR REPLACE FUNCTION public.expire_stale_assignments()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.assignments
    WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.hospital_availability SET
      reserved_icu = GREATEST(0, reserved_icu - COALESCE((r.reserved_resources->>'icu')::int,0)),
      reserved_er = GREATEST(0, reserved_er - COALESCE((r.reserved_resources->>'er')::int,0)),
      reserved_ventilators = GREATEST(0, reserved_ventilators - COALESCE((r.reserved_resources->>'ventilator')::int,0)),
      reserved_ot = GREATEST(0, reserved_ot - COALESCE((r.reserved_resources->>'ot')::int,0))
    WHERE hospital_id = r.hospital_id;
    UPDATE public.assignments SET status = 'expired', responded_at = now() WHERE id = r.id;
    INSERT INTO public.handoff_events (request_id, assignment_id, event_type, note)
    VALUES (r.request_id, r.id, 'released', 'Assignment expired, resources released');
    UPDATE public.emergency_requests SET status = 'new'
      WHERE id = r.request_id AND status = 'pending_confirmation';
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_hospital_resources(
  p_request_id uuid, p_hospital_id uuid, p_needs jsonb, p_idempotency_key text
) RETURNS public.assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  av public.hospital_availability%ROWTYPE;
  a public.assignments%ROWTYPE;
  n_icu int := CASE WHEN COALESCE((p_needs->>'icu')::boolean,false) THEN 1 ELSE 0 END;
  n_er int := CASE WHEN COALESCE((p_needs->>'er')::boolean,false) THEN 1 ELSE 0 END;
  n_vent int := CASE WHEN COALESCE((p_needs->>'ventilator')::boolean,false) THEN 1 ELSE 0 END;
  n_ot int := CASE WHEN COALESCE((p_needs->>'ot')::boolean,false) THEN 1 ELSE 0 END;
BEGIN
  PERFORM public.expire_stale_assignments();

  SELECT * INTO a FROM public.assignments WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN a; END IF;

  SELECT * INTO av FROM public.hospital_availability WHERE hospital_id = p_hospital_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HOSPITAL_NOT_FOUND'; END IF;

  IF (av.icu_beds - av.reserved_icu) < n_icu
     OR (av.er_beds - av.reserved_er) < n_er
     OR (av.ventilators - av.reserved_ventilators) < n_vent
     OR (av.ot_available - av.reserved_ot) < n_ot THEN
    RAISE EXCEPTION 'INSUFFICIENT_CAPACITY';
  END IF;

  UPDATE public.hospital_availability SET
    reserved_icu = reserved_icu + n_icu,
    reserved_er = reserved_er + n_er,
    reserved_ventilators = reserved_ventilators + n_vent,
    reserved_ot = reserved_ot + n_ot
  WHERE hospital_id = p_hospital_id;

  INSERT INTO public.assignments (request_id, hospital_id, status, reserved_resources, idempotency_key, expires_at,
    data_age_seconds)
  VALUES (p_request_id, p_hospital_id, 'pending',
    jsonb_build_object('icu',n_icu,'er',n_er,'ventilator',n_vent,'ot',n_ot),
    p_idempotency_key, now() + interval '5 minutes',
    EXTRACT(EPOCH FROM (now() - av.updated_at))::int)
  RETURNING * INTO a;

  UPDATE public.emergency_requests SET status = 'pending_confirmation' WHERE id = p_request_id;

  INSERT INTO public.handoff_events (request_id, assignment_id, event_type, actor_id, note)
  VALUES (p_request_id, a.id, 'requested', auth.uid(), 'Confirmation requested');

  RETURN a;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_assignment(p_assignment_id uuid, p_new_status public.assignment_status DEFAULT 'released', p_reason text DEFAULT NULL)
RETURNS public.assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.assignments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND'; END IF;
  IF a.status IN ('pending','accepted') THEN
    UPDATE public.hospital_availability SET
      reserved_icu = GREATEST(0, reserved_icu - COALESCE((a.reserved_resources->>'icu')::int,0)),
      reserved_er = GREATEST(0, reserved_er - COALESCE((a.reserved_resources->>'er')::int,0)),
      reserved_ventilators = GREATEST(0, reserved_ventilators - COALESCE((a.reserved_resources->>'ventilator')::int,0)),
      reserved_ot = GREATEST(0, reserved_ot - COALESCE((a.reserved_resources->>'ot')::int,0))
    WHERE hospital_id = a.hospital_id;
  END IF;
  UPDATE public.assignments SET status = p_new_status, responded_at = now(), reject_reason = COALESCE(p_reason, reject_reason)
    WHERE id = a.id RETURNING * INTO a;
  INSERT INTO public.handoff_events (request_id, assignment_id, event_type, actor_id, note)
  VALUES (a.request_id, a.id, 'released', auth.uid(), COALESCE(p_reason,'Resources released'));
  UPDATE public.emergency_requests SET status = 'new' WHERE id = a.request_id AND status = 'pending_confirmation';
  RETURN a;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_assignment(p_assignment_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS public.assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.assignments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_PENDING'; END IF;

  IF p_action = 'accept' THEN
    UPDATE public.assignments SET status = 'accepted', responded_at = now(), expires_at = NULL
      WHERE id = a.id RETURNING * INTO a;
    UPDATE public.emergency_requests SET status = 'accepted' WHERE id = a.request_id;
    INSERT INTO public.handoff_events (request_id, assignment_id, event_type, actor_id, note)
    VALUES (a.request_id, a.id, 'accepted', auth.uid(), 'Hospital accepted the patient');
    RETURN a;
  ELSIF p_action = 'reject' THEN
    RETURN public.release_assignment(a.id, 'rejected', COALESCE(p_reason,'Rejected by hospital'));
  ELSE
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_hospital_resources(uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_assignment(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_assignment(uuid,public.assignment_status,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_assignments() TO authenticated;

-- REALTIME
ALTER TABLE public.hospital_availability REPLICA IDENTITY FULL;
ALTER TABLE public.emergency_requests REPLICA IDENTITY FULL;
ALTER TABLE public.assignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_availability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handoff_events;

-- SEED
INSERT INTO public.hospitals (name, lat, lng, address, phone, capabilities) VALUES
  ('Sahyadri Super Speciality, Deccan', 18.5127, 73.8410, 'Plot 30-C, Erandwane, Pune', '+912067213000', ARRAY['trauma','cardiac_cath','stroke','neuro_surgery']),
  ('Ruby Hall Clinic', 18.5346, 73.8776, '40 Sassoon Road, Pune', '+912066455100', ARRAY['trauma','stroke','cardiac_cath','burn','obstetrics']),
  ('Jehangir Hospital', 18.5286, 73.8760, '32 Sassoon Road, Pune', '+912066819999', ARRAY['pediatric','obstetrics','stroke','trauma']),
  ('Deenanath Mangeshkar Hospital', 18.4998, 73.8296, 'Erandwane, Pune', '+912049153000', ARRAY['trauma','neuro_surgery','pediatric','cardiac_cath']),
  ('Aditya Birla Memorial Hospital', 18.6298, 73.7997, 'Chinchwad, Pune', '+912030717500', ARRAY['burn','trauma','obstetrics']),
  ('Noble Hospital, Hadapsar', 18.5019, 73.9267, 'Magarpatta Road, Hadapsar, Pune', '+912066285000', ARRAY['stroke','pediatric','er_general','trauma']);

INSERT INTO public.hospital_availability (hospital_id, icu_beds, er_beds, ventilators, ot_available, updated_at)
SELECT id,
  (3 + (random()*6)::int),
  (5 + (random()*12)::int),
  (2 + (random()*5)::int),
  (1 + (random()*3)::int),
  CASE WHEN name ILIKE 'Aditya%' THEN now() - interval '42 minutes'
       WHEN name ILIKE 'Noble%' THEN now() - interval '19 minutes'
       ELSE now() - (random()*4 || ' minutes')::interval END
FROM public.hospitals;
