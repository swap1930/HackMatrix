/**
 * In-memory mirror of `supabase/migrations/... reserve/respond/release` logic.
 * Exists so the double-booking / concurrency contract is unit-tested without
 * needing a live Postgres row lock. Semantics intentionally match the SQL:
 * - `reserve` serialises on the hospital row (FOR UPDATE), checks effective
 *   capacity, throws INSUFFICIENT_CAPACITY instead of over-booking.
 * - `idempotency_key` UNIQUE: same key returns the existing assignment.
 * - `pending` holds expire after 5 minutes and free their resources.
 * - `respond(accept)` clears expiry; `respond(reject)` frees resources.
 */

export interface Needs {
  icu: boolean;
  er: boolean;
  ventilator: boolean;
  ot: boolean;
}

export interface AvailabilityState {
  hospital_id: string;
  icu_beds: number;
  er_beds: number;
  ventilators: number;
  ot_available: number;
  reserved_icu: number;
  reserved_er: number;
  reserved_ventilators: number;
  reserved_ot: number;
  updated_at: string;
}

export type AssignmentStatus = "pending" | "accepted" | "rejected" | "expired" | "released" | "completed";

export interface AssignmentRecord {
  id: string;
  request_id: string;
  hospital_id: string;
  status: AssignmentStatus;
  reserved_resources: { icu: number; er: number; ventilator: number; ot: number };
  idempotency_key: string;
  expires_at: number | null;
  responded_at: number | null;
}

export const HOLD_MS = 5 * 60 * 1000;

let seq = 0;

export class ReservationStore {
  availability = new Map<string, AvailabilityState>();
  byIdempotency = new Map<string, AssignmentRecord>();
  byId = new Map<string, AssignmentRecord>();

  constructor(initial: AvailabilityState[] = []) {
    for (const a of initial) this.availability.set(a.hospital_id, { ...a });
  }

  effective(hospitalId: string) {
    const a = this.availability.get(hospitalId);
    if (!a) throw new Error("HOSPITAL_NOT_FOUND");
    return {
      icu: a.icu_beds - a.reserved_icu,
      er: a.er_beds - a.reserved_er,
      ventilator: a.ventilators - a.reserved_ventilators,
      ot: a.ot_available - a.reserved_ot,
    };
  }

  /** Frees expired pending holds. Mirrors `expire_stale_assignments` with SKIP LOCKED. */
  expireStale(now: number): number {
    let n = 0;
    for (const a of this.byId.values()) {
      if (a.status === "pending" && a.expires_at !== null && a.expires_at < now) {
        this.free(a);
        a.status = "expired";
        a.responded_at = now;
        n += 1;
      }
    }
    return n;
  }

  private free(a: AssignmentRecord) {
    const av = this.availability.get(a.hospital_id);
    if (!av) return;
    av.reserved_icu = Math.max(0, av.reserved_icu - a.reserved_resources.icu);
    av.reserved_er = Math.max(0, av.reserved_er - a.reserved_resources.er);
    av.reserved_ventilators = Math.max(0, av.reserved_ventilators - a.reserved_resources.ventilator);
    av.reserved_ot = Math.max(0, av.reserved_ot - a.reserved_resources.ot);
  }

  /**
   * Synchronous check-and-reserve. In Postgres the `SELECT ... FOR UPDATE`
   * serialises concurrent transactions; here synchronous mutation gives the
   * same guarantee, so a second concurrent caller sees the first caller's
   * reservation and gets INSUFFICIENT_CAPACITY.
   */
  reserve(
    requestId: string,
    hospitalId: string,
    needs: Needs,
    idempotencyKey: string,
    now: number = Date.now(),
  ): AssignmentRecord {
    this.expireStale(now);

    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return existing;

    const av = this.availability.get(hospitalId);
    if (!av) throw new Error("HOSPITAL_NOT_FOUND");

    const n = {
      icu: needs.icu ? 1 : 0,
      er: needs.er ? 1 : 0,
      ventilator: needs.ventilator ? 1 : 0,
      ot: needs.ot ? 1 : 0,
    };

    const eff = this.effective(hospitalId);
    if (eff.icu < n.icu || eff.er < n.er || eff.ventilator < n.ventilator || eff.ot < n.ot) {
      throw new Error("INSUFFICIENT_CAPACITY");
    }

    av.reserved_icu += n.icu;
    av.reserved_er += n.er;
    av.reserved_ventilators += n.ventilator;
    av.reserved_ot += n.ot;

    const record: AssignmentRecord = {
      id: `a-${(seq += 1)}`,
      request_id: requestId,
      hospital_id: hospitalId,
      status: "pending",
      reserved_resources: n,
      idempotency_key: idempotencyKey,
      expires_at: now + HOLD_MS,
      responded_at: null,
    };
    this.byIdempotency.set(idempotencyKey, record);
    this.byId.set(record.id, record);
    return record;
  }

  respond(assignmentId: string, action: "accept" | "reject", now: number = Date.now()): AssignmentRecord {
    const a = this.byId.get(assignmentId);
    if (!a) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (a.status !== "pending") throw new Error("ASSIGNMENT_NOT_PENDING");
    if (action === "accept") {
      a.status = "accepted";
      a.responded_at = now;
      a.expires_at = null;
      return a;
    }
    this.free(a);
    a.status = "rejected";
    a.responded_at = now;
    return a;
  }

  release(assignmentId: string, status: AssignmentStatus = "released", now: number = Date.now()): AssignmentRecord {
    const a = this.byId.get(assignmentId);
    if (!a) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (a.status === "pending" || a.status === "accepted") this.free(a);
    a.status = status;
    a.responded_at = now;
    return a;
  }

  pendingCount(hospitalId: string): number {
    return [...this.byId.values()].filter((a) => a.hospital_id === hospitalId && a.status === "pending").length;
  }
}
