import { describe, expect, it } from "vitest";
import {
  fallbackEta,
  freshnessLevel,
  freshnessScore,
  passesHardFilter,
  rankHospitals,
  type RankHospital,
  type RankRequest,
} from "./ranking";

const NOW = new Date("2026-01-01T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function hospital(over: Partial<RankHospital> & { id: string }): RankHospital {
  return {
    name: over.id,
    lat: 18.52,
    lng: 73.85,
    capabilities: ["trauma", "stroke"],
    icu_beds: 4,
    er_beds: 8,
    ventilators: 3,
    ot_available: 2,
    reserved_icu: 0,
    reserved_er: 0,
    reserved_ventilators: 0,
    reserved_ot: 0,
    updated_at: minutesAgo(1),
    ...over,
  };
}

const baseRequest: RankRequest = {
  severity: "critical",
  required_capabilities: ["trauma"],
  needs_icu: true,
  needs_er: true,
  needs_ventilator: false,
  needs_ot: false,
  pickup_lat: 18.52,
  pickup_lng: 73.85,
};

describe("hard filter", () => {
  it("excludes hospitals missing a required capability", () => {
    const h = hospital({ id: "a", capabilities: ["stroke"] });
    expect(passesHardFilter(baseRequest, h)).toBe(false);
  });

  it("excludes hospitals with no effective ICU availability", () => {
    const h = hospital({ id: "a", icu_beds: 1, reserved_icu: 1 });
    expect(passesHardFilter(baseRequest, h)).toBe(false);
  });

  it("keeps hospitals that satisfy everything", () => {
    expect(passesHardFilter(baseRequest, hospital({ id: "a" }))).toBe(true);
  });
});

describe("ordering", () => {
  it("prefers the closer hospital when resources are equal", () => {
    const near = hospital({ id: "near", lat: 18.53, lng: 73.86 });
    const far = hospital({ id: "far", lat: 18.75, lng: 74.2 });
    const ranked = rankHospitals(baseRequest, [far, near], { now: NOW });
    expect(ranked[0]!.hospital.id).toBe("near");
  });

  it("prefers the better resource match when ETA is equal", () => {
    const rich = hospital({ id: "rich", icu_beds: 8, er_beds: 20 });
    const thin = hospital({ id: "thin", icu_beds: 1, er_beds: 1 });
    const ranked = rankHospitals(baseRequest, [thin, rich], { now: NOW });
    expect(ranked[0]!.hospital.id).toBe("rich");
  });
});

describe("stale data", () => {
  it("classifies freshness bands", () => {
    expect(freshnessLevel(60)).toBe("fresh");
    expect(freshnessLevel(10 * 60)).toBe("aging");
    expect(freshnessLevel(20 * 60)).toBe("stale");
  });

  it("decays freshness linearly", () => {
    expect(freshnessScore(60)).toBe(1);
    expect(freshnessScore(30 * 60)).toBe(0);
    expect(freshnessScore(16 * 60)).toBeLessThan(0.6);
  });

  it("penalises and flags stale hospitals", () => {
    const stale = hospital({ id: "stale", updated_at: minutesAgo(40) });
    const [r] = rankHospitals(baseRequest, [stale], { now: NOW });
    expect(r!.stalePenaltyApplied).toBe(true);
    expect(r!.needsPhoneConfirmation).toBe(true);
    expect(r!.explanation).toMatch(/confirm by phone/i);
  });

  it("never ranks a stale hospital #1 for a critical case when a comparable fresh one exists", () => {
    const stale = hospital({
      id: "stale",
      lat: 18.521,
      lng: 73.851,
      icu_beds: 20,
      er_beds: 40,
      updated_at: minutesAgo(40),
    });
    const fresh = hospital({ id: "fresh", lat: 18.545, lng: 73.87, updated_at: minutesAgo(1) });
    const ranked = rankHospitals({ ...baseRequest, severity: "critical" }, [stale, fresh], {
      now: NOW,
      etas: {
        stale: { minutes: 10, source: "routed" },
        fresh: { minutes: 13, source: "routed" },
      },
    });
    expect(ranked[0]!.hospital.id).toBe("fresh");
  });
});

describe("routing fallback", () => {
  it("falls back to haversine at 40 km/h and labels it offline", () => {
    const h = hospital({ id: "a", lat: 18.72, lng: 73.85 });
    const eta = fallbackEta(baseRequest, h);
    expect(eta.source).toBe("estimated_offline");
    expect(eta.minutes).toBeGreaterThan(25);
    expect(eta.minutes).toBeLessThan(45);
  });

  it("labels ETA source on ranked results when routing is unavailable", () => {
    const ranked = rankHospitals(baseRequest, [hospital({ id: "a" })], { now: NOW });
    expect(ranked[0]!.etaSource).toBe("estimated_offline");
  });
});

describe("top 3", () => {
  it("returns at most three options with a breakdown", () => {
    const hs = Array.from({ length: 6 }, (_, i) =>
      hospital({ id: `h${i}`, lat: 18.52 + i * 0.02 }),
    );
    const ranked = rankHospitals(baseRequest, hs, { now: NOW });
    expect(ranked).toHaveLength(3);
    expect(ranked[0]!.breakdown).toHaveProperty("eta");
    expect(ranked[0]!.score).toBeGreaterThan(0);
    expect(ranked[0]!.score).toBeLessThanOrEqual(100);
  });
});
