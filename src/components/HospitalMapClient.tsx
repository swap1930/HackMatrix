import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import type { HospitalMapProps } from "./HospitalMap";

const TONE: Record<string, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

export default function HospitalMapClient({ points, pickup, className }: HospitalMapProps) {
  const center = pickup ?? points[0] ?? { lat: 18.5204, lng: 73.8567 };

  return (
    <div className={className}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", borderRadius: "var(--radius-xl)" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pickup ? (
          <CircleMarker
            center={[pickup.lat, pickup.lng]}
            radius={9}
            pathOptions={{ color: "var(--color-info)", fillColor: "var(--color-info)", fillOpacity: 0.9 }}
          >
            <Tooltip>Pickup location</Tooltip>
          </CircleMarker>
        ) : null}
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={10}
            pathOptions={{ color: TONE[p.tone], fillColor: TONE[p.tone], fillOpacity: 0.75 }}
          >
            <Tooltip>
              <span className="font-medium">{p.name}</span>
              {p.detail ? <> — {p.detail}</> : null}
            </Tooltip>
          </CircleMarker>
        ))}
        {pickup
          ? points.slice(0, 1).map((p) => (
              <Polyline
                key={`line-${p.id}`}
                positions={[
                  [pickup.lat, pickup.lng],
                  [p.lat, p.lng],
                ]}
                pathOptions={{ color: "var(--color-primary)", dashArray: "6 8", weight: 2 }}
              />
            ))
          : null}
      </MapContainer>
    </div>
  );
}
