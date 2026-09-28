import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Ambulance, Clock, Hospital, Lock, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth, homeForRole } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RapidRoute — get the patient to the right bed, first time" },
      {
        name: "description",
        content:
          "RapidRoute ranks Pune hospitals by travel time, matching resources and how fresh their capacity data is, then holds the bed safely until the hospital confirms.",
      },
      { property: "og:title", content: "RapidRoute — emergency bed routing for Pune" },
      {
        property: "og:description",
        content:
          "Live bed capacity, ranked hospital recommendations and safe bed holds for ambulance dispatch.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    Icon: Radio,
    title: "Live capacity, honestly labelled",
    body: "Every hospital card shows how old its numbers are. Anything over 15 minutes is marked stale with a one-tap phone confirmation.",
  },
  {
    Icon: Lock,
    title: "One bed, one ambulance",
    body: "Beds are held in the database itself, so two ambulances can never be sent to the same bed. A rejection or 5 minutes of silence frees the hold.",
  },
  {
    Icon: Activity,
    title: "Ranking you can explain",
    body: "Travel time, resource match and data freshness are weighted by severity — and every recommendation comes with the reason in plain words.",
  },
  {
    Icon: Clock,
    title: "Nothing lost at handover",
    body: "A shared timeline and pre-arrival brief mean the receiving team knows what is coming before the doors open.",
  },
];

function Landing() {
  const { user, role, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ambulance className="h-4 w-4" aria-hidden />
          </span>
          RapidRoute
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!loading && user ? (
            <Button asChild>
              <Link to={homeForRole(role)}>Open console</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-16">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="pulse-dot h-2 w-2 rounded-full bg-danger" aria-hidden />
          Live pilot · 6 hospitals across Pune
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Get the patient to the right bed, the first time.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          RapidRoute tells the ambulance crew which hospital can actually take this patient right
          now — ranked by travel time, the resources on board and how recently the hospital updated
          its numbers. Then it holds the bed until the hospital confirms.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to={user ? homeForRole(role) : "/auth"}>
              {user ? "Open console" : "Start dispatching"}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              Create a hospital account
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="surface-card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">Three people, one shared picture</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            {
              Icon: Ambulance,
              role: "Dispatcher",
              body: "Logs the patient, sees the top three hospitals with reasons, and holds a bed in one tap.",
            },
            {
              Icon: Hospital,
              role: "Hospital staff",
              body: "Gets the request with a 5-minute timer, accepts or declines, and keeps capacity current.",
            },
            {
              Icon: Activity,
              role: "Coordinator",
              body: "Watches city-wide capacity, spots stale reporting, and runs drills with the simulator.",
            },
          ].map(({ Icon, role: r, body }) => (
            <div key={r} className="surface-card p-6">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 font-semibold">{r}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        RapidRoute — decision support for emergency transport. Never a substitute for clinical
        judgement.
      </footer>
    </div>
  );
}
