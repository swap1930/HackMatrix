import { Link, useNavigate } from "@tanstack/react-router";
import { Ambulance, Building2, LogOut, Settings, ShieldCheck } from "lucide-react";
import { roleLabel, useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dispatch", label: "Dispatch", Icon: Ambulance, roles: ["dispatcher", "admin"] },
  { to: "/hospital", label: "Hospital", Icon: Building2, roles: ["hospital_staff", "admin"] },
  { to: "/admin", label: "Admin", Icon: ShieldCheck, roles: ["admin"] },
  { to: "/settings", label: "Settings", Icon: Settings, roles: ["dispatcher", "hospital_staff", "admin"] },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { role, profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Ambulance className="h-4 w-4" aria-hidden />
            </span>
            RapidRoute
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.filter((n) => !role || n.roles.includes(role as never)).map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                )}
                activeProps={{ className: "bg-primary/10 text-primary" }}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden items-end text-right sm:flex sm:flex-col">
              <p className="text-sm font-medium leading-tight">{profile?.full_name || user?.email}</p>
              <span className="mt-1 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {roleLabel(role)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
