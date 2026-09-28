import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light theme", Icon: Sun },
  { mode: "dark", label: "Dark theme", Icon: Moon },
  { mode: "system", label: "Use system theme", Icon: Monitor },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-1 rounded-full border border-border bg-surface p-1"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={label}
          title={label}
          onClick={() => setMode(m)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            mode === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
