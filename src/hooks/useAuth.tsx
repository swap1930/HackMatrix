import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "dispatcher" | "hospital_staff" | "admin";

export interface Profile {
  id: string;
  full_name: string;
  hospital_id: string | null;
  theme_preference: string;
  language: string;
  high_contrast: boolean;
  sound_enabled: boolean;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export const homeForRole = (role: Role | null) =>
  role === "admin" ? "/admin" : role === "hospital_staff" ? "/hospital" : "/dispatch";

export async function getCurrentRole(): Promise<Role | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Keep navigation resilient when the role lookup is temporarily unavailable.
  // Authorization still belongs to the database policies and route guards.
  const metadataRole = user.user_metadata?.["role"];
  const fallbackRole: Role | null =
    metadataRole === "admin" || metadataRole === "hospital_staff" || metadataRole === "dispatcher"
      ? metadataRole
      : null;

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return fallbackRole;
  const databaseRole = data?.role;
  return databaseRole === "admin" || databaseRole === "hospital_staff" || databaseRole === "dispatcher"
    ? databaseRole
    : fallbackRole;
}

export function roleLabel(role: Role | null) {
  return role === "admin" ? "Admin" : role === "hospital_staff" ? "Hospital staff" : "Dispatcher";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    const databaseRole = r?.role;
    const { data: authData } = await supabase.auth.getUser();
    const metadataRole = authData.user?.user_metadata?.["role"];
    const roleFromMetadata: Role | null =
      metadataRole === "admin" || metadataRole === "hospital_staff" || metadataRole === "dispatcher"
        ? metadataRole
        : null;
    setRole(
      databaseRole === "admin" || databaseRole === "hospital_staff" || databaseRole === "dispatcher"
        ? databaseRole
        : roleFromMetadata,
    );
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => void loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      role,
      loading,
      refresh: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setRole(null);
      },
    }),
    [session, profile, role, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
