import React from "react";
import type { VehicleEvent } from "../types";

interface FeedItem extends VehicleEvent {
  lot_name: string;
}

interface Props {
  events: FeedItem[];
}

export function EventFeed({ events }: Props) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, height: "100%", overflowY: "auto" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#94a3b8" }}>
        Live Events
      </h2>
      {events.length === 0 && (
        <p style={{ color: "#475569", textAlign: "center", paddingTop: 40 }}>
          Waiting for vehicle events…
        </p>
      )}
      {events.map((e) => (
        <div
          key={e.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: e.event_type === "entry" ? "#22c55e22" : "#ef444422",
              color: e.event_type === "entry" ? "#22c55e" : "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {e.event_type === "entry" ? "↓" : "↑"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
              {e.license_plate || "Unknown"}
              <span style={{ color: "#64748b", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                {e.lot_name}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {e.vehicle_type || "Vehicle"} ·{" "}
              {e.confidence ? `${(e.confidence * 100).toFixed(0)}% conf` : ""} ·{" "}
              {new Date(e.timestamp).toLocaleTimeString()}
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: e.event_type === "entry" ? "#22c55e" : "#ef4444",
              textTransform: "uppercase",
            }}
          >
            {e.event_type}
          </div>
        </div>
      ))}
    </div>
  );
}
