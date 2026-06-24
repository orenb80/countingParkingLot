import React from "react";
import type { ParkingLot } from "../types";

interface Props {
  lot: ParkingLot;
  onSelect: (lot: ParkingLot) => void;
  flash?: boolean;
}

function occupancyColor(pct: number) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f97316";
  if (pct >= 50) return "#eab308";
  return "#22c55e";
}

export function LotCard({ lot, onSelect, flash }: Props) {
  const pct = lot.capacity > 0 ? (lot.current_count / lot.capacity) * 100 : 0;
  const color = occupancyColor(pct);
  const free = lot.capacity - lot.current_count;

  return (
    <div
      onClick={() => onSelect(lot)}
      style={{
        background: flash ? "#1e3a5f" : "#1e293b",
        border: `1px solid ${flash ? color : "#334155"}`,
        borderRadius: 12,
        padding: "20px 24px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        boxShadow: flash ? `0 0 20px ${color}44` : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{lot.name}</h3>
          {lot.location && (
            <p style={{ fontSize: 12, color: "#94a3b8" }}>{lot.location}</p>
          )}
        </div>
        <div
          style={{
            background: color + "22",
            color,
            borderRadius: 20,
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {pct.toFixed(0)}%
        </div>
      </div>

      {/* Count display */}
      <div style={{ margin: "20px 0 12px", textAlign: "center" }}>
        <span style={{ fontSize: 56, fontWeight: 700, color, lineHeight: 1 }}>
          {lot.current_count}
        </span>
        <span style={{ fontSize: 20, color: "#94a3b8" }}>/{lot.capacity}</span>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#0f172a", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: color,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "#64748b" }}>
        <span>{free} free</span>
        <span>{lot.current_count} occupied</span>
      </div>
    </div>
  );
}
