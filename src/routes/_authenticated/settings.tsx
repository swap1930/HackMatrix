import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHospitals } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · RapidRoute" },
      {
        name: "description",
        content:
          "Change your name, hospital, theme, high-contrast mode and alert sounds in RapidRoute.",
      },
      { property: "og:title", content: "Settings · RapidRoute" },
      { property: "og:description", content: "Personal preferences for the RapidRoute console." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, role, user, refresh } = useAuth();
  const { mode, setMode, highContrast, setHighContrast } = useTheme();
  const { data: hospitals = [] } = useHospitals();

  const [fullName, setFullName] = useState("");
  const [hospitalId, setHospitalId] = useState<string>("none");
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setHospitalId(profile.hospital_id ?? "none");
    setSound(profile.sound_enabled);
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          hospital_id: hospitalId === "none" ? null : hospitalId,
          sound_enabled: sound,
          theme_preference: mode,
          high_contrast: highContrast,
        } as never)
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Settings" subtitle="Your profile and how RapidRoute looks and sounds.">
      <div className="grid max-w-3xl gap-6">
        <section className="surface-card p-5">
          <h2 className="font-semibold">Your details</h2>
          <div className="mt-4 grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={role?.replace("_", " ") ?? "—"} readOnly disabled className="capitalize" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hospital">Hospital you work at</Label>
              <Select value={hospitalId} onValueChange={setHospitalId}>
                <SelectTrigger id="hospital">
                  <SelectValue placeholder="Not linked to a hospital" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a hospital</SelectItem>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="font-semibold">Appearance</h2>
          <div className="mt-4 grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
                <SelectTrigger id="theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">Match my device</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3 text-sm">
              <span>
                High contrast
                <span className="block text-xs text-muted-foreground">
                  Stronger colours and borders for bright sunlight in the ambulance cabin.
                </span>
              </span>
              <Switch
                checked={highContrast}
                onCheckedChange={setHighContrast}
                aria-label="High contrast"
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-3 text-sm">
              <span>
                Alert sounds
                <span className="block text-xs text-muted-foreground">
                  Play a sound when a new request or confirmation arrives.
                </span>
              </span>
              <Switch checked={sound} onCheckedChange={setSound} aria-label="Alert sounds" />
            </label>
          </div>
        </section>

        <div>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save settings
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
