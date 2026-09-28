import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Activity, Building2, ChevronRight, Plus, ShieldCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAvailability, useHospitals } from "@/lib/data";
import { getCurrentRole, homeForRole } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const role = await getCurrentRole();
    if (role !== "admin") throw redirect({ to: homeForRole(role) });
  },
  head: () => ({ meta: [{ title: "Admin console · RapidRoute" }] }),
  component: AdminConsole,
});

function AdminConsole() {
  const { data: hospitals = [], isLoading } = useHospitals();
  const { data: availability = [] } = useAvailability();
  const totalBeds = availability.reduce((sum, item) => sum + item.icu_beds + item.er_beds, 0);
  const availableBeds = availability.reduce((sum, item) => sum + item.icu_beds + item.er_beds - item.reserved_icu - item.reserved_er, 0);
  const stats: Array<{ label: string; value: number; Icon: typeof Activity }> = [
    { label: "Hospitals", value: hospitals.length, Icon: Building2 },
    { label: "Available beds", value: availableBeds, Icon: Activity },
    { label: "Network beds", value: totalBeds, Icon: Users },
  ];

  return (
    <AppShell title="Admin console" subtitle="Manage the RapidRoute network and onboard hospital teams.">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, Icon }) => <div key={label} className="surface-card p-5"><Icon className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold">{value}</p></div>)}
      </div>
      <section className="surface-card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6"><div><h2 className="text-lg font-semibold">Hospital accounts</h2><p className="mt-1 text-sm text-muted-foreground">Create a login for a hospital staff member or review network capacity.</p></div><Button asChild><Link to="/auth" search={{ mode: "signup" }}><Plus className="mr-2 h-4 w-4" />Create hospital account</Link></Button></div>
        <div className="divide-y divide-border">
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading hospitals…</p> : hospitals.map((hospital) => { const current = availability.find((item) => item.hospital_id === hospital.id); const available = current ? current.icu_beds + current.er_beds - current.reserved_icu - current.reserved_er : 0; return <div key={hospital.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-medium">{hospital.name}</p><p className="mt-1 text-sm text-muted-foreground">{hospital.address}</p></div><div className="flex items-center gap-3"><Badge variant={available > 0 ? "default" : "secondary"}>{available} beds available</Badge><ChevronRight className="h-4 w-4 text-muted-foreground" /></div></div> })}
        </div>
      </section>
      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Admin access is active</p><p className="mt-1 text-sm text-muted-foreground">New staff accounts should be created with a hospital email, then linked to the hospital from Settings after sign-in.</p></div></div></div>
    </AppShell>
  );
}

