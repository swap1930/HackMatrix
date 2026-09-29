import { describe, expect, it } from "vitest";
import { ReservationStore } from "./reservation";

const HOSPITAL = "h1";

function storeWithOneIcuBed() {
  return new ReservationStore([
    {
      hospital_id: HOSPITAL,
      icu_beds: 1,
      er_beds: 5,
      ventilators: 2,
      ot_available: 1,
      reserved_icu: 0,
      reserved_er: 0,
      reserved_ventilators: 0,
      reserved_ot: 0,
      updated_at: new Date().toISOString(),
    },
  ]);
}

const ICU_NEEDS = { icu: true, er: false, ventilator: false, ot: false };

describe("concurrent reservation / double-booking", () => {
  it("second simultaneous request for the last ICU bed fails with INSUFFICIENT_CAPACITY", async () => {
    const store = storeWithOneIcuBed();
    const now = Date.now();

    // Two ambulances race for the same last bed. The store serialises like
    // Postgres `SELECT ... FOR UPDATE`, so exactly one wins.
    const results = await Promise.allSettled([
      (async () => store.reserve("req-a", HOSPITAL, ICU_NEEDS, "req-a:h1", now))(),
      (async () => store.reserve("req-b", HOSPITAL, ICU_NEEDS, "req-b:h1", now))(),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      message: "INSUFFICIENT_CAPACITY",
    });

    // Only one bed is ever held — no double-booking.
    expect(store.effective(HOSPITAL).icu).toBe(0);
    expect(store.pendingCount(HOSPITAL)).toBe(1);
  });

  it("same idempotency key returns the existing hold without double-reserving", () => {
    const store = storeWithOneIcuBed();
    const now = Date.now();
    const first = store.reserve("req-a", HOSPITAL, ICU_NEEDS, "req-a:h1", now);
    const second = store.reserve("req-a", HOSPITAL, ICU_NEEDS, "req-a:h1", now);
    expect(second.id).toBe(first.id);
    expect(store.effective(HOSPITAL).icu).toBe(0);
    expect(store.pendingCount(HOSPITAL)).toBe(1);
  });

  it("rejection frees the bed so the next ambulance can reserve it", () => {
    const store = storeWithOneIcuBed();
    const now = Date.now();
    const first = store.reserve("req-a", HOSPITAL, ICU_NEEDS, "req-a:h1", now);
    store.respond(first.id, "reject", now + 1000);
    expect(store.effective(HOSPITAL).icu).toBe(1);

    const second = store.reserve("req-b", HOSPITAL, ICU_NEEDS, "req-b:h1", now + 2000);
    expect(second.status).toBe("pending");
    expect(store.effective(HOSPITAL).icu).toBe(0);
  });

  it("expired 5-minute holds release automatically before a new reservation", () => {
    const store = storeWithOneIcuBed();
    const now = Date.now();
    store.reserve("req-a", HOSPITAL, ICU_NEEDS, "req-a:h1", now);
    // 6 minutes later the hold has expired and must not block the next request.
    const second = store.reserve("req-b", HOSPITAL, ICU_NEEDS, "req-b:h1", now + 6 * 60 * 1000);
    expect(second.status).toBe("pending");
    const expired = [...store.byId.values()].find((a) => a.request_id === "req-a");
    expect(expired?.status).toBe("expired");
  });

  it("accepted holds stop expiring and keep the bed reserved", () => {
    const store = storeWithOneIcuBed();
    const now = Date.now();
    const first = store.reserve("req-a", HOSPITAL, ICU_NEEDS, "req-a:h1", now);
    store.respond(first.id, "accept", now + 1000);
    expect(first.expires_at).toBeNull();

    expect(() => store.reserve("req-b", HOSPITAL, ICU_NEEDS, "req-b:h1", now + 6 * 60 * 1000)).toThrow(
      "INSUFFICIENT_CAPACITY",
    );
  });
});
