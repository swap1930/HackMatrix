
REVOKE ALL ON FUNCTION public.reserve_hospital_resources(uuid,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_assignment(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_assignment(uuid,public.assignment_status,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_stale_assignments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_hospital_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_hospital_resources(uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_assignment(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_assignment(uuid,public.assignment_status,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_hospital_id() TO authenticated;
