import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "rr-theme";
const HC_KEY = "rr-high-contrast";

interface ThemeCtx {
  mode: ThemeMode;
  resolved: "light" | "dark";
  highContrast: boolean;
  setMode: (m: ThemeMode) => void;
  setHighContrast: (v: boolean) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function systemDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode, highContrast: boolean) {
  if (typeof document === "undefined") return;
  const dark = mode === "dark" || (mode === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("hc", highContrast);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [highContrast, setHighContrastState] = useState(false);
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? "system";
    const hc = localStorage.getItem(HC_KEY) === "true";
    setModeState(stored);
    setHighContrastState(hc);
  }, []);

  useEffect(() => {
    applyTheme(mode, highContrast);
    setResolved(mode === "dark" || (mode === "system" && systemDark()) ? "dark" : "light");
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system", highContrast);
      setResolved(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode, highContrast]);

  const setMode = useCallback((m: ThemeMode) => {
    localStorage.setItem(THEME_KEY, m);
    setModeState(m);
  }, []);

  const setHighContrast = useCallback((v: boolean) => {
    localStorage.setItem(HC_KEY, String(v));
    setHighContrastState(v);
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, highContrast, setMode, setHighContrast }),
    [mode, resolved, highContrast, setMode, setHighContrast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Inline script that applies the stored theme before React hydrates (no flash). */
export const themeBootstrapScript = `(function(){try{var m=localStorage.getItem('${THEME_KEY}')||'system';var hc=localStorage.getItem('${HC_KEY}')==='true';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;if(d)e.classList.add('dark');if(hc)e.classList.add('hc');}catch(e){}})();`;
