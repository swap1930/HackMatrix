import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Clock3, Loader2, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAssignments,
  useAvailability,
  useHospitals,
  useLiveUpdates,
  useRequests,
} from "@/lib/data";
import { useAuth, getCurrentRole, homeForRole } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/hospital")({
  beforeLoad: async () => {
    const role = await getCurrentRole();
    if (role !== "hospital_staff" && role !== "admin") throw redirect({ to: homeForRole(role) });
  },
  head: () => ({ meta: [{ title: "Hospital workspace · RapidRoute" }] }),
  component: HospitalWorkspace,
});

function needsLabel(a: { reserved_resources: Record<string, number> | null }) {
  const r = a.reserved_resources ?? {};
  const parts: string[] = [];
  if ((r["icu"] ?? 0) > 0) parts.push("ICU bed");
  if ((r["er"] ?? 0) > 0) parts.push("ER bed");
  if ((r["ventilator"] ?? 0) > 0) parts.push("ventilator");
  if ((r["ot"] ?? 0) > 0) parts.push("OT");
  return parts.length ? parts.join(" + ") : "general bed";
}

function HospitalWorkspace() {
  useLiveUpdates();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();
  const { data: availability = [], refetch } = useAvailability();
  const { data: assignments = [] } = useAssignments();
  const { data: requests = [] } = useRequests();

  const hospital = hospitals.find((item) => item.id === profile?.hospital_id);
  const capacity = availability.find((item) => item.hospital_id === hospital?.id);

  const [icu, setIcu] = useState("");
  const [er, setEr] = useState("");
  const [vent, setVent] = useState("");
  const [ot, setOt] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [syncedFor, setSyncedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!capacity) return;
    if (syncedFor === `${capacity.hospital_id}:${capacity.updated_at}`) return;
    setIcu(String(capacity.icu_beds));
    setEr(String(capacity.er_beds));
    setVent(String(capacity.ventilators));
    setOt(String(capacity.ot_available));
    setSyncedFor(`${capacity.hospital_id}:${capacity.updated_at}`);
  }, [capacity, syncedFor]);

  const requestById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);

  const activeAssignments = assignments
    .filter((item) => item.hospital_id === hospital?.id && ["pending", "accepted"].includes(item.status))
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const recentAssignments = assignments
    .filter((item) => item.hospital_id === hospital?.id && !["pending", "accepted"].includes(item.status))
    .slice(0, 10);

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["assignments"] }),
      qc.invalidateQueries({ queryKey: ["availability"] }),
      qc.invalidateQueries({ queryKey: ["requests"] }),
      qc.invalidateQueries({ queryKey: ["timeline"] }),
    ]);

  const saveCapacity = async () => {
    if (!capacity || !hospital) return;
    const next = {
      icu_beds: Number(icu),
      er_beds: Number(er),
      ventilators: Number(vent),
      ot_available: Number(ot),
    };
    if (Object.values(next).some((v) => !Number.isInteger(v) || v < 0)) {
      toast.error("Capacity must be whole numbers, 0 or more.");
      return;
    }
    if (
      next.icu_beds < capacity.reserved_icu ||
      next.er_beds < capacity.reserved_er ||
      next.ventilators < capacity.reserved_ventilators ||
      next.ot_available < capacity.reserved_ot
    ) {
      toast.error("Total cannot go below currently reserved beds.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hospital_availability")
        .update({ ...next, updated_at: new Date().toISOString() } as never)
        .eq("hospital_id", hospital.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["availability"] });
      toast.success("Capacity updated — dispatchers see it live.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update capacity.");
    } finally {
      setSaving(false);
    }
  };

  const respond = async (assignmentId: string, action: "accept" | "reject") => {
    setBusyId(`${action}-${assignmentId}`);
    try {
      const reason = action === "reject" ? rejectReasons[assignmentId]?.trim() || "Rejected by hospital" : undefined;
      const { error } = await supabase.rpc("respond_to_assignment", {
        p_assignment_id: assignmentId,
        p_action: action,
        ...(reason ? { p_reason: reason } : {}),
      } as never);
      if (error) throw error;
      await invalidate();
      toast.success(action === "accept" ? "Patient accepted — bed is now reserved for them." : "Request declined — bed released for the next ambulance.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not respond.";
      toast.error(/ASSIGNMENT_NOT_PENDING/.test(msg) ? "That hold already expired or was answered." : msg);
    } finally {
      setBusyId(null);
    }
  };

  const complete = async (assignmentId: string) => {
    setBusyId(`complete-${assignmentId}`);
    try {
      const { error } = await supabase.rpc("release_assignment", {
        p_assignment_id: assignmentId,
        p_new_status: "completed",
        p_reason: "Patient handed over",
      } as never);
      if (error) throw error;
      await invalidate();
      toast.success("Handover completed — assignment closed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete handover.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell title="Hospital workspace" subtitle="Keep your capacity current and respond to incoming emergency requests.">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Staff console</p>
              <h2 className="mt-1 text-xl font-semibold">{hospital?.name ?? (hospitalsLoading ? "Loading hospital…" : "No hospital linked")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{hospital?.address ?? "Ask an administrator to link your profile to a hospital."}</p>
            </div>
            {hospital?.phone ? <Button variant="outline" asChild><a href={`tel:${hospital.phone}`}><Phone className="mr-2 h-4 w-4" />Call desk</a></Button> : null}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["ICU beds free", capacity ? capacity.icu_beds - capacity.reserved_icu : 0],
              ["ER beds free", capacity ? capacity.er_beds - capacity.reserved_er : 0],
              ["Ventilators free", capacity ? capacity.ventilators - capacity.reserved_ventilators : 0],
              ["OT free", capacity ? capacity.ot_available - capacity.reserved_ot : 0],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-background p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
          </div>

          {hospital && capacity ? (
            <div className="mt-6 rounded-xl border border-border p-4">
              <h3 className="font-semibold">Update live capacity</h3>
              <p className="mt-1 text-sm text-muted-foreground">Totals exclude held beds. Saving refreshes every dispatcher instantly.</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["ICU beds total", icu, setIcu],
                    ["ER beds total", er, setEr],
                    ["Ventilators total", vent, setVent],
                    ["OT total", ot, setOt],
                  ] as [string, string, Dispatch<SetStateAction<string>>][]
                ).map(([label, value, set]) => (
                  <div key={label} className="space-y-2">
                    <Label>{label}</Label>
                    <Input inputMode="numeric" value={value} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                  </div>
                ))}
              </div>
              <Button className="mt-4" size="sm" onClick={saveCapacity} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Publish capacity
              </Button>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-between rounded-xl bg-muted/50 p-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Capacity last updated {capacity ? new Date(capacity.updated_at).toLocaleTimeString() : "—"}</span>
            <Button variant="ghost" size="sm" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>

          {recentAssignments.length ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground">Recent decisions</h3>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {recentAssignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="truncate">{requestById.get(a.request_id)?.chief_complaint ?? a.request_id.slice(0, 8)} · {needsLabel(a)}</span>
                    <Badge variant={a.status === "completed" || a.status === "accepted" ? "default" : "secondary"}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><div><h2 className="font-semibold">Incoming requests</h2><p className="text-sm text-muted-foreground">Pending holds expire after 5 minutes</p></div></div>
          <div className="mt-6 space-y-3">
            {activeAssignments.length ? activeAssignments.map((assignment) => {
              const req = requestById.get(assignment.request_id);
              const expiresIn = assignment.expires_at ? Math.max(0, Math.round((+new Date(assignment.expires_at) - Date.now()) / 60000)) : null;
              return (
                <div key={assignment.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{req ? `${req.ambulance_id} · ${req.severity}` : "Emergency request"}</span>
                    <Badge variant={assignment.status === "accepted" ? "default" : "secondary"}>{assignment.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{req?.chief_complaint ?? "Loading case…"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Needs {needsLabel(assignment)}
                    {typeof assignment.data_age_seconds === "number" ? ` · data ${assignment.data_age_seconds}s old` : ""}
                    {expiresIn !== null && assignment.status === "pending" ? ` · expires in ~${expiresIn} min` : " · no expiry (accepted)"}
                  </p>
                  {assignment.status === "pending" ? (
                    <div className="mt-3 space-y-2">
                      <Input
                        placeholder="Decline reason (optional)"
                        value={rejectReasons[assignment.id] ?? ""}
                        onChange={(e) => setRejectReasons((p) => ({ ...p, [assignment.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void respond(assignment.id, "accept")} disabled={busyId === `accept-${assignment.id}`}>
                          {busyId === `accept-${assignment.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                          Accept
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void respond(assignment.id, "reject")} disabled={busyId === `reject-${assignment.id}`}>
                          {busyId === `reject-${assignment.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                          Decline
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => void complete(assignment.id)} disabled={busyId === `complete-${assignment.id}`}>
                      {busyId === `complete-${assignment.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      Complete handover
                    </Button>
                  )}
                </div>
              );
            }) : <div className="rounded-xl border border-dashed border-border p-6 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-success" /><p className="mt-3 font-medium">No pending requests</p><p className="mt-1 text-sm text-muted-foreground">Your team is ready for the next emergency.</p></div>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
