import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ambulance, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, homeForRole, type Role } from "@/hooks/useAuth";
import { useHospitals } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · RapidRoute" },
      {
        name: "description",
        content:
          "Sign in to RapidRoute as a dispatcher, hospital staff member or coordinator to route emergency patients to available beds.",
      },
      { property: "og:title", content: "Sign in · RapidRoute" },
      { property: "og:description", content: "Access the RapidRoute emergency dispatch console." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();

  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [staffRole, setStaffRole] = useState<Role>("dispatcher");
  const [hospitalId, setHospitalId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) void navigate({ to: homeForRole(role) });
  }, [authLoading, user, role, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        if (staffRole === "hospital_staff" && !hospitalId) {
          toast.error("Choose which hospital you work at.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              full_name: fullName,
              role: staffRole,
              hospital_id: staffRole === "hospital_staff" ? hospitalId : "",
            },
          },
        });
        if (error) throw error;
        const { data: signedIn } = await supabase.auth.getSession();
        if (signedIn.session) {
          toast.success("Account created.");
        } else {
          toast.success("Account created — check your email to confirm, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(
        /invalid login credentials/i.test(message)
          ? "That email and password don't match an account."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ambulance className="h-4 w-4" aria-hidden />
          </span>
          RapidRoute
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="surface-card w-full max-w-md p-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Use the email your control room registered."
              : "Tell us your role so we show you the right console."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>

            {mode === "signup" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="role">Your role</Label>
                  <Select value={staffRole} onValueChange={(v) => setStaffRole(v as Role)}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dispatcher">Ambulance dispatcher</SelectItem>
                      <SelectItem value="hospital_staff">Hospital staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {staffRole === "hospital_staff" ? (
                  <div className="space-y-2">
                    <Label htmlFor="hospital">Your hospital</Label>
                    <Select
                      value={hospitalId}
                      onValueChange={setHospitalId}
                      disabled={hospitalsLoading}
                    >
                      <SelectTrigger id="hospital">
                        <SelectValue
                          placeholder={
                            hospitalsLoading ? "Loading hospitals..." : "Choose a hospital"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {hospitals.length === 0 && !hospitalsLoading ? (
                          <SelectItem value="_none" disabled>
                            No hospitals available
                          </SelectItem>
                        ) : (
                          hospitals.map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin"
              ? "No account yet? Create one"
              : "Already registered? Sign in instead"}
          </button>
        </div>
      </div>
    </div>
  );
}
