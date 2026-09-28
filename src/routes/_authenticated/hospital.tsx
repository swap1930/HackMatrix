import { createFileRoute, redirect } from "@tanstack/react-router";
import { Building2, CheckCircle2, Clock3, Phone, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAssignments, useAvailability, useHospitals } from "@/lib/data";
import { useAuth, getCurrentRole, homeForRole } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/hospital")({
  beforeLoad: async () => {
    const role = await getCurrentRole();
    if (role !== "hospital_staff" && role !== "admin") throw redirect({ to: homeForRole(role) });
  },
  head: () => ({ meta: [{ title: "Hospital workspace · RapidRoute" }] }),
  component: HospitalWorkspace,
});

function HospitalWorkspace() {
  const { profile } = useAuth();
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();
  const { data: availability = [], refetch } = useAvailability();
  const { data: assignments = [] } = useAssignments();
  const hospital = hospitals.find((item) => item.id === profile?.hospital_id);
  const capacity = availability.find((item) => item.hospital_id === hospital?.id);
  const activeAssignments = assignments.filter((item) => item.hospital_id === hospital?.id && ["pending", "accepted"].includes(item.status));

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
              ["ICU beds", capacity ? capacity.icu_beds - capacity.reserved_icu : 0],
              ["ER beds", capacity ? capacity.er_beds - capacity.reserved_er : 0],
              ["Ventilators", capacity ? capacity.ventilators - capacity.reserved_ventilators : 0],
              ["OT available", capacity ? capacity.ot_available - capacity.reserved_ot : 0],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-background p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl bg-muted/50 p-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Capacity last updated {capacity ? new Date(capacity.updated_at).toLocaleTimeString() : "—"}</span>
            <Button variant="ghost" size="sm" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
        </section>
        <section className="surface-card p-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><div><h2 className="font-semibold">Incoming requests</h2><p className="text-sm text-muted-foreground">Requests waiting on your team</p></div></div>
          <div className="mt-6 space-y-3">
            {activeAssignments.length ? activeAssignments.map((assignment) => <div key={assignment.id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><span className="font-medium">Emergency request</span><Badge variant={assignment.status === "accepted" ? "default" : "secondary"}>{assignment.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">Review the dispatch console request and respond before the hold expires.</p></div>) : <div className="rounded-xl border border-dashed border-border p-6 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-success" /><p className="mt-3 font-medium">No pending requests</p><p className="mt-1 text-sm text-muted-foreground">Your team is ready for the next emergency.</p></div>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

