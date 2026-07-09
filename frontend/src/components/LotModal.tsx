import React, { useState, useEffect } from "react";
import type { ParkingLot, Camera, VehicleEvent } from "../types";
import { api } from "../services/api";

interface Props {
  lot: ParkingLot;
  onClose: () => void;
  onAdjust: (lotId: number, delta: number) => void;
}

export function LotModal({ lot, onClose, onAdjust }: Props) {
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [tab, setTab] = useState<"events" | "cameras" | "add-camera">("events");

  // Add camera form state
  const [camForm, setCamForm] = useState<{
    name: string; ip_address: string; port: number; username: string;
    password: string; channel: number; direction: "entry" | "exit" | "both";
  }>({
    name: "", ip_address: "", port: 80, username: "admin",
    password: "", channel: 1, direction: "entry",
  });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    api.getEvents(lot.id).then(setEvents).catch(console.error);
    api.getCameras(lot.id).then(setCameras).catch(console.error);
  }, [lot.id]);

  async function handleAddCamera(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const cam = await api.createCamera({ ...camForm, parking_lot_id: lot.id });
      setCameras((prev) => [...prev, cam]);
      setTab("cameras");
    } catch (err) {
      alert("Failed to add camera");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestCamera(camId: number) {
    setTestResult("Testing…");
    const res = await api.testCamera(camId);
    setTestResult(res.reachable ? "✅ Reachable" : "❌ Not reachable");
    setTimeout(() => setTestResult(null), 4000);
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 13,
    background: active ? "#3b82f6" : "transparent",
    color: active ? "white" : "#94a3b8",
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#00000088",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#1e293b", borderRadius: 16, width: 680, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{lot.name}</h2>
            {lot.location && <p style={{ color: "#94a3b8", fontSize: 13 }}>{lot.location}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 24 }}>×</button>
        </div>

        {/* Count + adjust */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: "#3b82f6" }}>{lot.current_count}</span>
          <span style={{ color: "#94a3b8" }}>/ {lot.capacity} vehicles</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => onAdjust(lot.id, -1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ef4444", color: "#ef4444", background: "transparent", cursor: "pointer", fontWeight: 600 }}>−1 Exit</button>
            <button onClick={() => onAdjust(lot.id, 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #22c55e", color: "#22c55e", background: "transparent", cursor: "pointer", fontWeight: 600 }}>+1 Entry</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #334155", display: "flex", gap: 8 }}>
          {(["events", "cameras", "add-camera"] as const).map((t) => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
              {t === "add-camera" ? "+ Add Camera" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {tab === "events" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "#64748b", textAlign: "left" }}>
                  <th style={{ paddingBottom: 8 }}>Plate</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Confidence</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #334155" }}>
                    <td style={{ padding: "8px 0", fontWeight: 600 }}>{e.license_plate || "—"}</td>
                    <td style={{ color: e.event_type === "entry" ? "#22c55e" : "#ef4444" }}>{e.event_type}</td>
                    <td style={{ color: "#94a3b8" }}>{e.vehicle_type || "—"}</td>
                    <td style={{ color: "#94a3b8" }}>{e.confidence != null ? `${(e.confidence * 100).toFixed(0)}%` : "—"}</td>
                    <td style={{ color: "#64748b" }}>{new Date(e.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "cameras" && (
            <div>
              {testResult && <div style={{ marginBottom: 12, color: "#94a3b8" }}>{testResult}</div>}
              {cameras.length === 0 && <p style={{ color: "#475569" }}>No cameras configured yet.</p>}
              {cameras.map((cam) => (
                <div key={cam.id} style={{ background: "#0f172a", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{cam.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{cam.ip_address}:{cam.port} · Ch{cam.channel} · {cam.direction}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleTestCamera(cam.id)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #3b82f6", color: "#3b82f6", background: "transparent", cursor: "pointer", fontSize: 12 }}>Test</button>
                      <button onClick={() => api.deleteCamera(cam.id).then(() => setCameras(c => c.filter(x => x.id !== cam.id)))} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ef4444", color: "#ef4444", background: "transparent", cursor: "pointer", fontSize: 12 }}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "add-camera" && (
            <form onSubmit={handleAddCamera} style={{ display: "grid", gap: 12 }}>
              {[
                { label: "Camera Name", key: "name", type: "text" },
                { label: "IP Address", key: "ip_address", type: "text" },
                { label: "Port", key: "port", type: "number" },
                { label: "Username", key: "username", type: "text" },
                { label: "Password", key: "password", type: "password" },
                { label: "Channel", key: "channel", type: "number" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>{label}</label>
                  <input
                    type={type}
                    required
                    value={(camForm as any)[key]}
                    onChange={(e) => setCamForm(f => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "white" }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Direction</label>
                <select value={camForm.direction} onChange={(e) => setCamForm(f => ({ ...f, direction: e.target.value as "entry" | "exit" | "both" }))} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "white" }}>
                  <option value="entry">Entry only</option>
                  <option value="exit">Exit only</option>
                  <option value="both">Both (camera decides)</option>
                </select>
              </div>
              <button type="submit" disabled={saving} style={{ padding: "10px 20px", borderRadius: 8, background: "#3b82f6", color: "white", border: "none", cursor: "pointer", fontWeight: 600 }}>
                {saving ? "Adding…" : "Add Camera"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
