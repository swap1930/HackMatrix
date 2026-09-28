import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { freshnessLevel, type FreshnessLevel } from "@/lib/ranking";
import { cn } from "@/lib/utils";

const MAP: Record<FreshnessLevel, { label: string; Icon: typeof Clock; cls: string }> = {
  fresh: { label: "Fresh", Icon: CheckCircle2, cls: "bg-success/15 text-success border-success/40" },
  aging: { label: "Aging", Icon: Clock, cls: "bg-warning/15 text-warning border-warning/40" },
  stale: { label: "Stale", Icon: AlertTriangle, cls: "bg-danger/15 text-danger border-danger/40" },
};

export function relativeAge(seconds: number) {
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export function FreshnessBadge({
  ageSeconds,
  phone,
  className,
}: {
  ageSeconds: number;
  phone?: string;
  className?: string;
}) {
  const level = freshnessLevel(ageSeconds);
  const { label, Icon, cls } = MAP[level];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          cls,
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
        <span className="font-normal opacity-80">· {relativeAge(ageSeconds)}</span>
      </span>
      {level === "stale" && phone ? (
        <a
          href={`tel:${phone}`}
          className="text-xs font-medium text-danger underline underline-offset-2"
        >
          Confirm by phone
        </a>
      ) : null}
    </span>
  );
}
