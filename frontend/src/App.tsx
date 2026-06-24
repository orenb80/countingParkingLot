import React, { useState, useEffect, useCallback } from "react";
import { LotCard } from "./components/LotCard";
import { EventFeed } from "./components/EventFeed";
import { LotModal } from "./components/LotModal";
import { AddLotModal } from "./components/AddLotModal";
import { useWebSocket } from "./hooks/useWebSocket";
import { api } from "./services/api";
import type { ParkingLot, WsVehicleEvent, WsInitialState, VehicleEvent } from "./types";

interface FeedItem extends VehicleEvent {
  lot_name: string;
}

export default function App() {
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [flashLots, setFlashLots] = useState<Set<number>>(new Set());
  const [selectedLot, setSelectedLot] = useState<ParkingLot | null>(null);
  const [showAddLot, setShowAddLot] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api.getLots().then(setLots).catch(console.error);
  }, []);

  const handleWsMessage = useCallback((msg: unknown) => {
    const m = msg as WsVehicleEvent | WsInitialState | { type: string };
    setConnected(true);

    if (m.type === "initial_state") {
      const init = m as WsInitialState;
      setLots((prev) => {
        const map = new Map(prev.map((l) => [l.id, l]));
        init.lots.forEach((l) => {
          const existing = map.get(l.id);
          if (existing) {
            map.set(l.id, { ...existing, current_count: l.current_count });
          }
        });
        return Array.from(map.values());
      });
    }

    if (m.type === "vehicle_event") {
      const ve = m as WsVehicleEvent;
      setLots((prev) =>
        prev.map((l) =>
          l.id === ve.parking_lot_id
            ? { ...l, current_count: ve.current_count }
            : l
        )
      );
      setFeed((prev) => [
        { ...ve.event, lot_name: ve.parking_lot_name },
        ...prev.slice(0, 99),
      ]);
      setFlashLots((prev) => {
        const next = new Set(prev);
        next.add(ve.parking_lot_id);
        return next;
      });
      setTimeout(() => {
        setFlashLots((prev) => {
          const next = new Set(prev);
          next.delete(ve.parking_lot_id);
          return next;
        });
      }, 1500);
    }
  }, []);

  useWebSocket(handleWsMessage);

  async function handleAdjust(lotId: number, delta: number) {
    const updated = await api.adjustCount(lotId, delta);
    setLots((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    if (selectedLot?.id === lotId) setSelectedLot(updated);
  }

  const totalVehicles = lots.reduce((s, l) => s + l.current_count, 0);
  const totalCapacity = lots.reduce((s, l) => s + l.capacity, 0);
  const globalPct = totalCapacity > 0 ? ((totalVehicles / totalCapacity) * 100).toFixed(1) : "0";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "16px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>Parking Lot Dashboard</h1>
          <p style={{ fontSize: 12, color: "#64748b" }}>Hikvision LPR · Amadeus 8</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 20 }}>
          {/* Global stats */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>{totalVehicles}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>vehicles / {totalCapacity} cap · {globalPct}%</div>
          </div>
          {/* WS indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444" }} />
            <span style={{ fontSize: 12, color: "#64748b" }}>{connected ? "Live" : "Connecting"}</span>
          </div>
          <button
            onClick={() => setShowAddLot(true)}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #3b82f6", color: "#3b82f6", background: "transparent", cursor: "pointer", fontWeight: 600 }}
          >
            + Add Lot
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", gap: 0 }}>
        {/* Lot grid */}
        <div style={{ padding: 32, overflowY: "auto" }}>
          {lots.length === 0 && (
            <div style={{ textAlign: "center", paddingTop: 80, color: "#475569" }}>
              <p style={{ fontSize: 18, marginBottom: 8 }}>No parking lots configured.</p>
              <button onClick={() => setShowAddLot(true)} style={{ color: "#3b82f6", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Add your first lot →</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                onSelect={setSelectedLot}
                flash={flashLots.has(lot.id)}
              />
            ))}
          </div>
        </div>

        {/* Event feed */}
        <div style={{ borderLeft: "1px solid #1e293b", padding: 24, overflowY: "auto" }}>
          <EventFeed events={feed} />
        </div>
      </main>

      {selectedLot && (
        <LotModal
          lot={selectedLot}
          onClose={() => setSelectedLot(null)}
          onAdjust={handleAdjust}
        />
      )}
      {showAddLot && (
        <AddLotModal
          onClose={() => setShowAddLot(false)}
          onCreated={(lot) => setLots((prev) => [...prev, lot])}
        />
      )}
    </div>
  );
}
