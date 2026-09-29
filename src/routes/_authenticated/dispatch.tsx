import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Sparkles, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { HospitalMap } from "@/components/HospitalMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CAPABILITIES,
  PUNE_CENTER,
  capabilityLabel,
  toRankHospitals,
  useAssignments,
  useAvailability,
  useHospitals,
  useLiveUpdates,
  useRequests,
  useTimeline,
  type EmergencyRequest,
} from "@/lib/data";
import { rankHospitals, type RankedHospital, type Severity } from "@/lib/ranking";
import { generateHandoverBrief, suggestTriage } from "@/lib/ai.functions";
import { getCurrentRole, homeForRole } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/dispatch")({
  beforeLoad: async () => {
    const role = await getCurrentRole();
    if (role !== "dispatcher" && role !== "admin") throw redirect({ to: homeForRole(role) });
  },
  head: () => ({
    meta: [
      { title: "Dispatch console · RapidRoute" },
      {
        name: "description",
        content:
          "Log an emergency patient, see the best-matched Pune hospitals with reasons, and hold a bed until the hospital confirms.",
      },
      { property: "og:title", content: "Dispatch console · RapidRoute" },
      {
        property: "og:description",
        content: "Rank hospitals by travel time, resources and data freshness, then hold the bed.",
      },
    ],
  }),
  component: Dispatch,
});

const STATUS_TONE: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  pending_confirmation: "bg-warning/15 text-warning",
  accepted: "bg-success/15 text-success",
  en_route: "bg-info/15 text-info",
  arrived: "bg-info/15 text-info",
  handed_over: "bg-success/15 text-success",
  expired: "bg-danger/15 text-danger",
  cancelled: "bg-danger/15 text-danger",
};

const statusLabel = (s: string) => s.replace(/_/g, " ");

/** Random pick so repeated runs don't read identically. */
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function Dispatch() {
  useLiveUpdates();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: hospitals = [] } = useHospitals();
  const { data: availability = [] } = useAvailability();
  const { data: requests = [] } = useRequests();
  const { data: assignments = [] } = useAssignments();

  const [ambulanceId, setAmbulanceId] = useState("AMB-01");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("unknown");
  const [complaint, setComplaint] = useState("");
  const [severity, setSeverity] = useState<Severity>("serious");
  const [caps, setCaps] = useState<string[]>([]);
  const [needs, setNeeds] = useState({ icu: false, er: true, ventilator: false, ot: false });
  const [pickup, setPickup] = useState(PUNE_CENTER);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [triageNote, setTriageNote] = useState<string | null>(null);
  const [brief, setBrief] = useState<string | null>(null);

  const triageFn = useServerFn(suggestTriage);
  const briefFn = useServerFn(generateHandoverBrief);

  const activeRequest = useMemo(
    () => requests.find((r) => r.id === activeId) ?? null,
    [requests, activeId],
  );
  const { data: timeline = [] } = useTimeline(activeId);

  const rankSource = useMemo(
    () => toRankHospitals(hospitals, availability),
    [hospitals, availability],
  );

  const criteria = activeRequest
    ? {
        severity: activeRequest.severity,
        required_capabilities: activeRequest.required_capabilities,
        needs_icu: activeRequest.needs_icu,
        needs_er: activeRequest.needs_er,
        needs_ventilator: activeRequest.needs_ventilator,
        needs_ot: activeRequest.needs_ot,
        pickup_lat: activeRequest.pickup_lat,
        pickup_lng: activeRequest.pickup_lng,
      }
    : {
        severity,
        required_capabilities: caps,
        needs_icu: needs.icu,
        needs_er: needs.er,
        needs_ventilator: needs.ventilator,
        needs_ot: needs.ot,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
      };

  const ranked = useMemo(
    () => (rankSource.length ? rankHospitals(criteria, rankSource, { limit: 3 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rankSource, JSON.stringify(criteria)],
  );

  const hospitalById = useMemo(() => new Map(hospitals.map((h) => [h.id, h])), [hospitals]);
  const activeAssignment = useMemo(
    () =>
      assignments.find(
        (a) =>
          a.request_id === activeId &&
          (a.status === "pending" || a.status === "accepted" || a.status === "completed"),
      ) ?? null,
    [assignments, activeId],
  );

  const runTriage = async () => {
    if (complaint.trim().length < 3) {
      toast.error("Write the complaint first.");
      return;
    }
    setBusy("triage");
    try {
      const res = await triageFn({
        data: { complaint, age: age ? Number(age) : null, sex: sex === "unknown" ? null : sex },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const s = res.suggestion;
      if (s.severity === "critical" || s.severity === "serious" || s.severity === "stable") {
        setSeverity(s.severity);
      }
      if (Array.isArray(s.capabilities)) {
        setCaps(s.capabilities.filter((c) => (CAPABILITIES as readonly string[]).includes(c)));
      }
      if (s.needs) {
        setNeeds({
          icu: !!s.needs["icu"],
          er: s.needs["er"] !== false,
          ventilator: !!s.needs["ventilator"],
          ot: !!s.needs["ot"],
        });
      }
      setTriageNote(s.rationale ?? "Suggestion applied.");
      toast.success("Triage suggestion applied — review before sending.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Triage failed.");
    } finally {
      setBusy(null);
    }
  };

  const createRequest = async () => {
    if (complaint.trim().length < 3) {
      toast.error("Describe the patient's condition.");
      return;
    }
    if (!user) return;
    setBusy("create");
    try {
      const { data, error } = await supabase
        .from("emergency_requests")
        .insert({
          created_by: user.id,
          ambulance_id: ambulanceId,
          patient_age: age ? Number(age) : null,
          patient_sex: sex === "unknown" ? null : sex,
          chief_complaint: complaint,
          severity,
          required_capabilities: caps,
          needs_icu: needs.icu,
          needs_er: needs.er,
          needs_ventilator: needs.ventilator,
          needs_ot: needs.ot,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
        } as never)
        .select()
        .single();
      if (error) throw error;
      const created = data as unknown as EmergencyRequest;
      setActiveId(created.id);
      setBrief(null);
      await qc.invalidateQueries({ queryKey: ["requests"] });
      toast.success("Case logged — pick a hospital to hold a bed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log the case.");
    } finally {
      setBusy(null);
    }
  };

  const holdBed = async (r: RankedHospital) => {
    if (!activeRequest) {
      toast.error("Log the case first.");
      return;
    }
    // One ambulance -> one hospital: block a second hold for the same case.
    if (activeAssignment) {
      toast.error("This ambulance is already assigned to a hospital — one case, one hospital.");
      return;
    }
    setBusy(`hold-${r.hospital.id}`);
    try {
      const { data: held, error } = await supabase.rpc("reserve_hospital_resources", {
        p_request_id: activeRequest.id,
        p_hospital_id: r.hospital.id,
        p_needs: {
          icu: activeRequest.needs_icu,
          er: activeRequest.needs_er,
          ventilator: activeRequest.needs_ventilator,
          ot: activeRequest.needs_ot,
        },
        p_idempotency_key: `${activeRequest.id}:${r.hospital.id}`,
      } as never);
      if (error) throw error;
      // Auto-accept: the hospital confirms immediately on hold, so the
      // request moves pending_confirmation -> accepted without manual triage.
      const assignmentId = (held as unknown as { id?: string } | null)?.id;
      if (assignmentId) {
        const { error: acceptError } = await supabase.rpc("respond_to_assignment", {
          p_assignment_id: assignmentId,
          p_action: "accept",
        } as never);
        if (acceptError) throw acceptError;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["assignments"] }),
        qc.invalidateQueries({ queryKey: ["availability"] }),
        qc.invalidateQueries({ queryKey: ["requests"] }),
        qc.invalidateQueries({ queryKey: ["timeline"] }),
      ]);
      toast.success(`Bed confirmed at ${r.hospital.name} — hospital accepted, patient marked accepted.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not hold the bed.";
      toast.error(
        /INSUFFICIENT_CAPACITY/.test(msg)
          ? "That hospital just ran out of the resources you need."
          : msg,
      );
    } finally {
      setBusy(null);
    }
  };

  const advance = async (status: string, note: string) => {
    if (!activeRequest) return;
    setBusy(status);
    try {
      const { error } = await supabase
        .from("emergency_requests")
        .update({ status } as never)
        .eq("id", activeRequest.id);
      if (error) throw error;
      await supabase.from("handoff_events").insert({
        request_id: activeRequest.id,
        assignment_id: activeAssignment?.id ?? null,
        event_type: status,
        actor_id: user?.id ?? null,
        note,
      } as never);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["requests"] }),
        qc.invalidateQueries({ queryKey: ["timeline"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the case.");
    } finally {
      setBusy(null);
    }
  };

  // Humanized auto-progress: accepted -> en_route -> arrived -> handed_over.
  // Gaps mimic real ops — crew acknowledgement, ETA-based travel time,
  // handover formalities — each with jitter so runs never look scripted.
  const activeStatus = activeRequest?.status;
  const activeReqId = activeRequest?.id;
  const activeAssignId = activeAssignment?.id;
  const assignedEtaMin =
    ranked.find((x) => x.hospital.id === activeAssignment?.hospital_id)?.etaMinutes ?? 15;
  const [pendingAuto, setPendingAuto] = useState<{ label: string; at: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Ticking clock only while an auto step is pending (drives the countdown).
  useEffect(() => {
    if (!pendingAuto) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pendingAuto]);

  useEffect(() => {
    if (!activeReqId) {
      setPendingAuto(null);
      return;
    }
    const jitter = (base: number, spread: number) =>
      Math.max(5000, Math.round(base + (Math.random() * 2 - 1) * spread));
    const etaNote = `ETA ~${Math.max(1, Math.round(assignedEtaMin))} min`;
    const step =
      activeStatus === "accepted"
        ? {
            status: "en_route",
            label: "En route",
            // Crew acknowledgement + loading the patient: ~14–30s.
            delay: jitter(22000, 8000),
            note: pick([
              `Crew acknowledged, wheels rolling (${etaNote})`,
              `Departing pickup with patient aboard (${etaNote})`,
              `Crew confirmed departure, patient stable for transport (${etaNote})`,
            ]),
            toast: "Crew is on the way.",
          }
        : activeStatus === "en_route"
          ? {
              status: "arrived",
              label: "Arrived",
              // Travel scales with the ranked ETA (~4s per ETA minute,
              // clamped 25s–2min) with ±20% jitter.
              delay: jitter(
                Math.min(120000, Math.max(25000, assignedEtaMin * 4000)),
                Math.min(120000, Math.max(25000, assignedEtaMin * 4000)) * 0.2,
              ),
              note: pick([
                "Ambulance at hospital bay, crew with patient",
                "Arrived at receiving bay, handing over paperwork",
                "On scene at hospital entrance with patient",
              ]),
              toast: "Ambulance reached the hospital.",
            }
          : activeStatus === "arrived"
            ? {
                status: "handed_over",
                label: "Handed over",
                // Bedside handover + briefing the receiving team: ~30–60s.
                delay: jitter(45000, 15000),
                note: pick([
                  "Patient handed over, receiving team briefed",
                  "Bedside handover done, documents signed",
                  "Care transferred, crew debriefed the receiving team",
                ]),
                toast: "Handover complete — care transferred.",
              }
            : null;
    if (!step) {
      setPendingAuto(null);
      return;
    }
    setPendingAuto({ label: step.label, at: Date.now() + step.delay });
    const t = setTimeout(() => {
      void (async () => {
        await advance(step.status, step.note);
        if (step.status === "handed_over" && activeAssignId) {
          await supabase.rpc("release_assignment", {
            p_assignment_id: activeAssignId,
            p_new_status: "completed",
            p_reason: "Patient handed over (auto)",
          } as never);
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["assignments"] }),
            qc.invalidateQueries({ queryKey: ["availability"] }),
          ]);
        }
        toast.success(`Status auto-updated: ${step.label} — ${step.toast}`);
      })();
    }, step.delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReqId, activeStatus, activeAssignId, assignedEtaMin]);

  const makeBrief = async () => {
    if (!activeRequest || !activeAssignment) return;
    const hospital = hospitalById.get(activeAssignment.hospital_id);
    const top = ranked.find((r) => r.hospital.id === activeAssignment.hospital_id) ?? ranked[0];
    setBusy("brief");
    try {
      const res = await briefFn({
        data: {
          complaint: activeRequest.chief_complaint,
          severity: activeRequest.severity,
          age: activeRequest.patient_age,
          sex: activeRequest.patient_sex,
          hospitalName: hospital?.name ?? "receiving hospital",
          etaMinutes: top?.etaMinutes ?? 15,
          capabilities: activeRequest.required_capabilities,
          resources: [
            activeRequest.needs_icu ? "ICU bed" : null,
            activeRequest.needs_er ? "ER bed" : null,
            activeRequest.needs_ventilator ? "ventilator" : null,
            activeRequest.needs_ot ? "operating theatre" : null,
          ]
            .filter(Boolean)
            .join(", "),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBrief(res.brief);
      await supabase.from("handoff_briefs").insert({
        request_id: activeRequest.id,
        content: res.brief,
      } as never);
      toast.success("Pre-arrival brief shared with the hospital.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not write the brief.");
    } finally {
      setBusy(null);
    }
  };

  const mapPoints = ranked.map((r, i) => ({
    id: r.hospital.id,
    name: r.hospital.name,
    lat: r.hospital.lat,
    lng: r.hospital.lng,
    tone: (i === 0 ? "primary" : r.freshness === "stale" ? "danger" : "success") as
      | "primary"
      | "danger"
      | "success",
    detail: `${Math.round(r.etaMinutes)} min`,
  }));

  return (
    <AppShell
      title="Dispatch console"
      subtitle="Log the patient, compare hospitals that can actually take them, and hold the bed."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Stethoscope className="h-4 w-4 text-primary" aria-hidden />
            New emergency case
          </h2>

          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amb">Ambulance</Label>
                <Input id="amb" value={ambulanceId} onChange={(e) => setAmbulanceId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder="—"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sex">Sex</Label>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger id="sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="complaint">What's happening</Label>
              <Textarea
                id="complaint"
                rows={3}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                placeholder="e.g. 54-year-old, crushing chest pain for 30 minutes, sweating, BP low"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runTriage}
                disabled={busy === "triage"}
              >
                {busy === "triage" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                Suggest triage
              </Button>
              {triageNote ? (
                <p className="text-xs text-muted-foreground">
                  Suggestion: {triageNote} Review before sending — this is decision support, not a
                  diagnosis.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger id="severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="serious">Serious</SelectItem>
                  <SelectItem value="stable">Stable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Resources needed</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["icu", "ICU bed"],
                    ["er", "ER bed"],
                    ["ventilator", "Ventilator"],
                    ["ot", "Operating theatre"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    {label}
                    <Switch
                      checked={needs[key]}
                      onCheckedChange={(v) => setNeeds((n) => ({ ...n, [key]: v }))}
                      aria-label={label}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Specialities required</legend>
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map((c) => {
                  const on = caps.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setCaps((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))
                      }
                      className={
                        on
                          ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                          : "rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                      }
                    >
                      {capabilityLabel(c)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lat">Pickup latitude</Label>
                <Input
                  id="lat"
                  value={pickup.lat}
                  onChange={(e) => setPickup((p) => ({ ...p, lat: Number(e.target.value) || p.lat }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng">Pickup longitude</Label>
                <Input
                  id="lng"
                  value={pickup.lng}
                  onChange={(e) => setPickup((p) => ({ ...p, lng: Number(e.target.value) || p.lng }))}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!navigator.geolocation) {
                  toast.error("This device can't share its location.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) =>
                    setPickup({ lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4) }),
                  () => toast.error("Location permission denied."),
                );
              }}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Use my location
            </Button>

            <Button onClick={createRequest} disabled={busy === "create"}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Log case and find hospitals
            </Button>
          </div>
        </section>

        <div className="space-y-6">
          <section className="surface-card overflow-hidden">
            <HospitalMap points={mapPoints} pickup={pickup} className="h-64 w-full" />
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">
              {activeRequest ? "Recommended for this case" : "Best match right now"}
            </h2>
            {ranked.length === 0 ? (
              <p className="surface-card p-5 text-sm text-muted-foreground">
                No hospital currently has everything this patient needs. Loosen a requirement or call
                the nearest centre directly.
              </p>
            ) : null}
            {ranked.map((r, i) => {
              const hospital = hospitalById.get(r.hospital.id);
              const held = assignments.find(
                (a) =>
                  a.request_id === activeRequest?.id &&
                  a.hospital_id === r.hospital.id &&
                  (a.status === "pending" || a.status === "accepted"),
              );
              return (
                <article key={r.hospital.id} className="surface-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {i === 0 ? <Badge>Best match</Badge> : null}
                        <h3 className="font-semibold">{r.hospital.name}</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{hospital?.address}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold">{Math.round(r.etaMinutes)} min</p>
                      <p className="text-xs text-muted-foreground">
                        score {r.score}
                        {r.etaSource === "estimated_offline" ? " · estimated" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <FreshnessBadge ageSeconds={r.dataAgeSeconds} {...(hospital?.phone ? { phone: hospital.phone } : {})} />
                  </div>

                  <p className="mt-3 text-sm leading-relaxed">{r.explanation}</p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Travel {r.breakdown.eta}%</span>
                    <span>·</span>
                    <span>Resource match {r.breakdown.match}%</span>
                    <span>·</span>
                    <span>Data freshness {r.breakdown.freshness}%</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      onClick={() => holdBed(r)}
                      disabled={!activeRequest || !!activeAssignment || busy === `hold-${r.hospital.id}`}
                    >
                      {busy === `hold-${r.hospital.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : null}
                      {held ? `Bed ${held.status}` : activeAssignment ? "Assigned — one case, one hospital" : "Hold this bed"}
                    </Button>
                    {hospital?.phone ? (
                      <Button variant="outline" asChild>
                        <a href={`tel:${hospital.phone}`}>Call hospital</a>
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>

          {activeRequest ? (
            <section className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Active case</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUS_TONE[activeRequest.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {statusLabel(activeRequest.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeRequest.ambulance_id} · {activeRequest.chief_complaint}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                One case stays with one hospital. Statuses advance on their own with realistic gaps
                (crew acknowledgement → ETA-based travel → bedside handover) — buttons below are manual override.
              </p>
              {pendingAuto ? (
                <p className="mt-1 text-xs font-medium text-primary">
                  Next: {pendingAuto.label} in ~
                  {Math.max(0, Math.ceil((pendingAuto.at - nowMs) / 1000))}s
                  {activeStatus === "en_route"
                    ? ` (based on ~${Math.max(1, Math.round(assignedEtaMin))} min ETA)`
                    : ""}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === "en_route"}
                  onClick={() => advance("en_route", "Ambulance en route")}
                >
                  Mark en route
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === "arrived"}
                  onClick={() => advance("arrived", "Ambulance arrived at hospital")}
                >
                  Mark arrived
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === "handed_over"}
                  onClick={() => advance("handed_over", "Patient handed over to hospital team")}
                >
                  Mark handed over
                </Button>
                <Button size="sm" disabled={!activeAssignment || busy === "brief"} onClick={makeBrief}>
                  {busy === "brief" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden />
                  )}
                  Write handover brief
                </Button>
              </div>

              {brief ? (
                <div className="mt-4 rounded-xl border border-border bg-surface-raised p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {brief}
                </div>
              ) : null}

              <ol className="mt-5 space-y-3 border-l border-border pl-4">
                {timeline.map((e) => (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <span className="font-medium capitalize">{statusLabel(e.event_type)}</span>
                    {e.note ? <span className="text-muted-foreground"> — {e.note}</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
                {timeline.length === 0 ? (
                  <li className="text-sm text-muted-foreground">Nothing logged yet.</li>
                ) : null}
              </ol>
            </section>
          ) : null}

          <section className="surface-card p-5">
            <h2 className="font-semibold">Recent cases</h2>
            <ul className="mt-3 divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <button
                    type="button"
                    className="text-left text-sm font-medium underline-offset-4 hover:underline"
                    onClick={() => {
                      setActiveId(r.id);
                      setBrief(null);
                    }}
                  >
                    {r.ambulance_id} · {r.chief_complaint.slice(0, 48)}
                  </button>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </li>
              ))}
              {requests.length === 0 ? (
                <li className="py-2 text-sm text-muted-foreground">No cases logged yet.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
