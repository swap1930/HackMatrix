import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RankHospital } from "./ranking";

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone: string;
  capabilities: string[];
}

export interface Availability {
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

export interface EmergencyRequest {
  id: string;
  created_by: string;
  patient_age: number | null;
  patient_sex: string | null;
  chief_complaint: string;
  severity: "critical" | "serious" | "stable";
  required_capabilities: string[];
  needs_icu: boolean;
  needs_er: boolean;
  needs_ventilator: boolean;
  needs_ot: boolean;
  pickup_lat: number;
  pickup_lng: number;
  ambulance_id: string;
  status: string;
  created_at: string;
}

export interface Assignment {
  id: string;
  request_id: string;
  hospital_id: string;
  status: string;
  reject_reason: string | null;
  expires_at: string | null;
  created_at: string;
  responded_at: string | null;
  data_age_seconds: number | null;
  reserved_resources: Record<string, number> | null;
}

export interface HandoffEvent {
  id: string;
  request_id: string;
  event_type: string;
  note: string | null;
  created_at: string;
}

export const CAPABILITIES = [
  "trauma",
  "cardiac_cath",
  "stroke",
  "neuro_surgery",
  "burn",
  "obstetrics",
  "pediatric",
  "er_general",
] as const;

export const capabilityLabel = (c: string) =>
  c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/** Pune city centre — default pickup point. */
export const PUNE_CENTER = { lat: 18.5204, lng: 73.8567 };

export function useHospitals() {
  return useQuery({
    queryKey: ["hospitals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hospitals").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Hospital[];
    },
  });
}

export function useAvailability() {
  return useQuery({
    queryKey: ["availability"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hospital_availability").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as Availability[];
    },
    refetchInterval: 60_000,
  });
}

export function useRequests() {
  return useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emergency_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as EmergencyRequest[];
    },
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: ["assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
    refetchInterval: 30_000,
  });
}

export function useTimeline(requestId: string | null) {
  return useQuery({
    queryKey: ["timeline", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handoff_events")
        .select("*")
        .eq("request_id", requestId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HandoffEvent[];
    },
  });
}

/** Live updates for capacity, requests and assignments. */
export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("rapidroute-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "hospital_availability" }, () =>
        qc.invalidateQueries({ queryKey: ["availability"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["requests"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => {
        qc.invalidateQueries({ queryKey: ["assignments"] });
        qc.invalidateQueries({ queryKey: ["availability"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "handoff_events" }, () =>
        qc.invalidateQueries({ queryKey: ["timeline"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function toRankHospitals(
  hospitals: Hospital[],
  availability: Availability[],
): RankHospital[] {
  const byId = new Map(availability.map((a) => [a.hospital_id, a]));
  return hospitals
    .map((h) => {
      const a = byId.get(h.id);
      if (!a) return null;
      return {
        id: h.id,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        capabilities: h.capabilities,
        icu_beds: a.icu_beds,
        er_beds: a.er_beds,
        ventilators: a.ventilators,
        ot_available: a.ot_available,
        reserved_icu: a.reserved_icu,
        reserved_er: a.reserved_er,
        reserved_ventilators: a.reserved_ventilators,
        reserved_ot: a.reserved_ot,
        updated_at: a.updated_at,
      } satisfies RankHospital;
    })
    .filter((h): h is RankHospital => h !== null);
}
