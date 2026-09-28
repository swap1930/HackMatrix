/**
 * RapidRoute ranking engine — pure, deterministic, unit-testable.
 * Mirrored by the server-side ranking used when routing data is available.
 */

export type Severity = "critical" | "serious" | "stable";

export interface RankHospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capabilities: string[];
  icu_beds: number;
  er_beds: number;
  ventilators: number;
  ot_available: number;
  reserved_icu: number;
  reserved_er: number;
  reserved_ventilators: number;
  reserved_ot: number;
  /** ISO timestamp of the last availability update */
  updated_at: string;
}

export interface RankRequest {
  severity: Severity;
  required_capabilities: string[];
  needs_icu: boolean;
  needs_er: boolean;
  needs_ventilator: boolean;
  needs_ot: boolean;
  pickup_lat: number;
  pickup_lng: number;
}

export interface EtaResult {
  minutes: number;
  source: "routed" | "estimated_offline";
}

export interface RankedHospital {
  hospital: RankHospital;
  score: number;
  etaMinutes: number;
  etaSource: EtaResult["source"];
  dataAgeSeconds: number;
  freshness: FreshnessLevel;
  stalePenaltyApplied: boolean;
  needsPhoneConfirmation: boolean;
  breakdown: { eta: number; match: number; freshness: number };
  explanation: string;
}

export type FreshnessLevel = "fresh" | "aging" | "stale";

export const FALLBACK_SPEED_KMH = 40;
export const STALE_SECONDS = 15 * 60;

export const WEIGHTS: Record<Severity, { eta: number; match: number; freshness: number }> = {
  critical: { eta: 0.45, match: 0.35, freshness: 0.2 },
  serious: { eta: 0.35, match: 0.35, freshness: 0.3 },
  stable: { eta: 0.25, match: 0.35, freshness: 0.4 },
};

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Fallback ETA when the routing API fails or times out. */
export function fallbackEta(req: RankRequest, h: RankHospital): EtaResult {
  const km = haversineKm(req.pickup_lat, req.pickup_lng, h.lat, h.lng);
  return { minutes: (km / FALLBACK_SPEED_KMH) * 60, source: "estimated_offline" };
}

export function dataAgeSeconds(h: RankHospital, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - new Date(h.updated_at).getTime()) / 1000));
}

export function freshnessLevel(ageSeconds: number): FreshnessLevel {
  if (ageSeconds < 5 * 60) return "fresh";
  if (ageSeconds <= STALE_SECONDS) return "aging";
  return "stale";
}

/** Linear decay: 1.0 under 2 minutes, 0 above 30 minutes. */
export function freshnessScore(ageSeconds: number): number {
  const min = 120;
  const max = 30 * 60;
  if (ageSeconds <= min) return 1;
  if (ageSeconds >= max) return 0;
  return 1 - (ageSeconds - min) / (max - min);
}

export function effective(h: RankHospital) {
  return {
    icu: h.icu_beds - h.reserved_icu,
    er: h.er_beds - h.reserved_er,
    ventilator: h.ventilators - h.reserved_ventilators,
    ot: h.ot_available - h.reserved_ot,
  };
}

/** HARD FILTER: capability present and effective availability for every needed resource. */
export function passesHardFilter(req: RankRequest, h: RankHospital): boolean {
  const caps = new Set(h.capabilities);
  if (!req.required_capabilities.every((c) => caps.has(c))) return false;
  const e = effective(h);
  if (req.needs_icu && e.icu < 1) return false;
  if (req.needs_er && e.er < 1) return false;
  if (req.needs_ventilator && e.ventilator < 1) return false;
  if (req.needs_ot && e.ot < 1) return false;
  return true;
}

/** Resource match = capability coverage + spare-capacity headroom. */
export function resourceMatchScore(req: RankRequest, h: RankHospital): number {
  const caps = new Set(h.capabilities);
  const capScore = req.required_capabilities.length
    ? req.required_capabilities.filter((c) => caps.has(c)).length / req.required_capabilities.length
    : 1;
  const e = effective(h);
  const needed: number[] = [];
  if (req.needs_icu) needed.push(Math.min(1, e.icu / 3));
  if (req.needs_er) needed.push(Math.min(1, e.er / 6));
  if (req.needs_ventilator) needed.push(Math.min(1, e.ventilator / 3));
  if (req.needs_ot) needed.push(Math.min(1, e.ot / 2));
  const headroom = needed.length ? needed.reduce((a, b) => a + b, 0) / needed.length : 1;
  return 0.6 * capScore + 0.4 * headroom;
}

/** ETA score: 1.0 at 0 min, 0 at 60+ min. */
export function etaScore(minutes: number): number {
  return Math.max(0, Math.min(1, 1 - minutes / 60));
}

export interface RankOptions {
  now?: Date;
  /** Routed ETAs by hospital id; missing entries fall back to haversine. */
  etas?: Record<string, EtaResult | undefined>;
  limit?: number;
}

export function rankHospitals(
  req: RankRequest,
  hospitals: RankHospital[],
  options: RankOptions = {},
): RankedHospital[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 3;

  const candidates = hospitals.filter((h) => passesHardFilter(req, h));
  const weights = WEIGHTS[req.severity];

  let ranked: RankedHospital[] = candidates.map((h) => {
    const eta = options.etas?.[h.id] ?? fallbackEta(req, h);
    const age = dataAgeSeconds(h, now);
    const level = freshnessLevel(age);
    const parts = {
      eta: etaScore(eta.minutes),
      match: resourceMatchScore(req, h),
      freshness: freshnessScore(age),
    };
    let score =
      100 * (parts.eta * weights.eta + parts.match * weights.match + parts.freshness * weights.freshness);
    const stale = level === "stale";
    if (stale) score *= 0.6;

    return {
      hospital: h,
      score: Math.round(score * 10) / 10,
      etaMinutes: Math.round(eta.minutes * 10) / 10,
      etaSource: eta.source,
      dataAgeSeconds: age,
      freshness: level,
      stalePenaltyApplied: stale,
      needsPhoneConfirmation: stale,
      breakdown: {
        eta: Math.round(parts.eta * 100),
        match: Math.round(parts.match * 100),
        freshness: Math.round(parts.freshness * 100),
      },
      explanation: "",
    };
  });

  ranked.sort((a, b) => b.score - a.score || a.etaMinutes - b.etaMinutes);

  // Safety rule: never rank a stale hospital #1 for a critical case when a fresh
  // hospital exists within 1.5x the stale hospital's ETA.
  if (req.severity === "critical" && ranked.length > 1 && ranked[0]!.freshness === "stale") {
    const top = ranked[0]!;
    const idx = ranked.findIndex(
      (r, i) => i > 0 && r.freshness !== "stale" && r.etaMinutes <= top.etaMinutes * 1.5,
    );
    if (idx > 0) {
      const fresh = ranked.splice(idx, 1)[0]!;
      ranked = [fresh, ...ranked];
    }
  }

  return ranked.slice(0, limit).map((r) => ({ ...r, explanation: explain(r, req) }));
}

export function explain(r: RankedHospital, req: RankRequest): string {
  const bits: string[] = [];
  bits.push(
    `${r.hospital.name} is about ${Math.round(r.etaMinutes)} min away${
      r.etaSource === "estimated_offline" ? " (estimated, offline routing)" : ""
    }.`,
  );
  const e = effective(r.hospital);
  const res: string[] = [];
  if (req.needs_icu) res.push(`${e.icu} ICU bed${e.icu === 1 ? "" : "s"}`);
  if (req.needs_er) res.push(`${e.er} ER bed${e.er === 1 ? "" : "s"}`);
  if (req.needs_ventilator) res.push(`${e.ventilator} ventilator${e.ventilator === 1 ? "" : "s"}`);
  if (req.needs_ot) res.push(`${e.ot} OT${e.ot === 1 ? "" : "s"}`);
  if (res.length) bits.push(`It has ${res.join(", ")} free right now.`);
  if (req.required_capabilities.length)
    bits.push(`It covers ${req.required_capabilities.join(", ")}.`);
  if (r.freshness === "stale")
    bits.push("Its capacity data is over 15 minutes old — confirm by phone before committing.");
  return bits.join(" ");
}
