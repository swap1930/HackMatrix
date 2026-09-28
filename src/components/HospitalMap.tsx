import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tone: "primary" | "success" | "warning" | "danger";
  detail?: string;
}

export interface HospitalMapProps {
  points: MapPoint[];
  pickup?: { lat: number; lng: number } | null;
  className?: string;
}

const LazyMap = lazy(() => import("./HospitalMapClient"));

const Placeholder = ({ className }: { className?: string }) => (
  <div
    className={className ?? ""}
    style={{ background: "var(--color-muted)", borderRadius: "var(--radius-xl)" }}
    aria-hidden
  />
);

export function HospitalMap(props: HospitalMapProps) {
  return (
    <ClientOnly fallback={<Placeholder className={props.className ?? ""} />}>
      <Suspense fallback={<Placeholder className={props.className ?? ""} />}>
        <LazyMap {...props} />
      </Suspense>
    </ClientOnly>
  );
}
