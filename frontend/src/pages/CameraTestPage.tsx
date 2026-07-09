import React, { useState, useRef, useEffect } from "react";
import { api } from "../services/api";
import type { SavedCamera } from "../types";

interface LprEvent {
  id: number;
  plate: string;
  confidence: number | null;
  vehicle_type: string | null;
  direction: string | null;
  country: string | null;
  event_type: string;
  channel: string | null;
  plate_image: string | null;
  timestamp: string | null;
  received_at: string;
}

interface LogEntry {
  id: number;
  type: "info" | "lpr_event" | "error" | "raw_event" | "parse_error" | "connected" | "disconnected";
  message?: string;
  data?: unknown;
  time: string;
}

type ConnectStatus = "idle" | "connecting" | "connected" | "error" | "disconnected";

let _id = 0;
const nextId = () => ++_id;

const DEFAULT_FORM = { name: "", ip: "", port: "80", username: "admin", password: "" };

export function CameraTestPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [events, setEvents] = useState<LprEvent[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  // Saved cameras
  const [savedCameras, setSavedCameras] = useState<SavedCamera[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  useEffect(() => {
    api.getSavedCameras().then(setSavedCameras).catch(console.error);
  }, []);

  function addLog(type: LogEntry["type"], message?: string, data?: unknown) {
    setLog((prev) => [...prev, { id: nextId(), type, message, data, time: new Date().toLocaleTimeString() }]);
  }

  function loadCamera(cam: SavedCamera) {
    setForm({ name: cam.name, ip: cam.ip_address, port: String(cam.port), username: cam.username, password: cam.password });
    setEditingId(cam.id);
    setDeviceInfo(null);
  }

  async function handleSaveCamera() {
    if (!form.ip || !form.password) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name || form.ip,
        ip_address: form.ip,
        port: Number(form.port),
        username: form.username,
        password: form.password,
        channel: 1,
        direction: "both" as const,
      };
      if (editingId) {
        const updated = await api.updateSavedCamera(editingId, payload);
        setSavedCameras((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await api.createSavedCamera(payload);
        setSavedCameras((prev) => [...prev, created]);
        setEditingId(created.id);
      }
    } catch {
      alert("Failed to save camera");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCamera(id: number) {
    await api.deleteSavedCamera(id);
    setSavedCameras((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(DEFAULT_FORM);
    }
  }

  async function handlePing() {
    setPinging(true);
    setDeviceInfo(null);
    try {
      const params = new URLSearchParams({ ip: form.ip, port: form.port, username: form.username, password: form.password });
      const res = await fetch(`/api/camera-test/ping?${params}`);
      const data = await res.json();
      setDeviceInfo(`${data.device_info} · auth: ${data.auth_type}`);
      addLog("info", `Camera reachable: ${data.device_info} (${data.auth_type} auth)`);
    } catch {
      addLog("error", "Ping failed — check IP and port");
    } finally {
      setPinging(false);
    }
  }

  function handleConnect() {
    esRef.current?.close();
    setStatus("connecting");
    setStatusMsg("Connecting…");
    setEvents([]);
    addLog("info", `Connecting to ${form.ip}:${form.port}…`);

    const params = new URLSearchParams({ ip: form.ip, port: form.port, username: form.username, password: form.password });
    const es = new EventSource(`/api/camera-test/stream?${params}`);
    esRef.current = es;

    es.addEventListener("connected", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setStatus("connected");
      setStatusMsg(d.message);
      addLog("connected", d.message);
    });
    es.addEventListener("info", (e) => {
      addLog("info", JSON.parse((e as MessageEvent).data).message);
    });
    es.addEventListener("lpr_event", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      const ev: LprEvent = { ...d, id: nextId(), received_at: new Date().toLocaleTimeString() };
      setEvents((prev) => [ev, ...prev.slice(0, 199)]);
      addLog("lpr_event", undefined, d);
    });
    es.addEventListener("raw_event", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      addLog("raw_event", `Non-LPR: ${d.eventType}`);
    });
    es.addEventListener("error", (e: Event) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        setStatus("error");
        setStatusMsg(d.message);
        addLog("error", d.message);
      } catch {
        setStatus("disconnected");
        setStatusMsg("Connection lost");
        addLog("disconnected", "Connection lost");
      }
    });
    es.addEventListener("parse_error", (e) => {
      addLog("parse_error", JSON.parse((e as MessageEvent).data).message);
    });
  }

  function handleDisconnect() {
    esRef.current?.close();
    esRef.current = null;
    setStatus("disconnected");
    setStatusMsg("Disconnected");
    addLog("disconnected", "Disconnected by user");
  }

  const statusColor: Record<ConnectStatus, string> = {
    idle: "#64748b", connecting: "#eab308", connected: "#22c55e", error: "#ef4444", disconnected: "#94a3b8",
  };

  const logColor: Record<string, string> = {
    connected: "#22c55e", disconnected: "#94a3b8", info: "#60a5fa",
    lpr_event: "#a78bfa", error: "#ef4444", raw_event: "#64748b", parse_error: "#f97316",
  };

  const inputStyle: React.CSSProperties = {
    background: "#0f172a", border: "1px solid #334155", borderRadius: 8,
    color: "white", padding: "8px 12px", width: "100%", fontSize: 13,
  };

  const dirInfo = (d: string | null) => {
    if (!d) return null;
    const l = d.toLowerCase();
    if (l.includes("exit") || l.includes("out")) return { label: "EXIT", color: "#ef4444" };
    return { label: "ENTRY", color: "#22c55e" };
  };

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>LPR Camera Test Listener</h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>Connect to a Hikvision camera and watch LPR events in real time.</p>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>

        {/* Saved cameras sidebar */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>Saved Cameras</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {savedCameras.length === 0 && (
              <p style={{ fontSize: 12, color: "#475569" }}>No cameras saved yet.</p>
            )}
            {savedCameras.map((cam) => (
              <div
                key={cam.id}
                style={{
                  background: editingId === cam.id ? "#1e3a5f" : "#1e293b",
                  border: `1px solid ${editingId === cam.id ? "#3b82f6" : "#334155"}`,
                  borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                }}
                onClick={() => loadCamera(cam)}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{cam.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{cam.ip_address}:{cam.port}</div>
                {cam.last_seen && (
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                    Last seen: {new Date(cam.last_seen).toLocaleDateString()}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteCamera(cam.id); }}
                  style={{ marginTop: 6, fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main panel */}
        <div>
          {/* Connection form */}
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              {[
                { label: "Camera Name", key: "name", type: "text", placeholder: "e.g. Gate 1 Entry" },
                { label: "Port", key: "port", type: "number", placeholder: "80" },
                { label: "IP Address", key: "ip", type: "text", placeholder: "192.168.1.100" },
                { label: "Username", key: "username", type: "text", placeholder: "admin" },
                { label: "Password", key: "password", type: "password", placeholder: "••••••" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>{label}</label>
                  <input
                    style={inputStyle} type={type} placeholder={placeholder}
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button onClick={handlePing} disabled={!form.ip || pinging}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>
                {pinging ? "Pinging…" : "Ping"}
              </button>

              {status !== "connected" && status !== "connecting" ? (
                <button onClick={handleConnect} disabled={!form.ip || !form.password}
                  style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", cursor: "pointer", fontWeight: 600 }}>
                  Connect & Listen
                </button>
              ) : (
                <button onClick={handleDisconnect}
                  style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "#ef4444", color: "white", cursor: "pointer", fontWeight: 600 }}>
                  Disconnect
                </button>
              )}

              <button onClick={handleSaveCamera} disabled={!form.ip || saving}
                style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #22c55e", background: "transparent", color: "#22c55e", cursor: "pointer", fontSize: 13 }}>
                {saving ? "Saving…" : editingId ? "Update Camera" : "Save Camera"}
              </button>

              {editingId && (
                <button onClick={() => { setEditingId(null); setForm(DEFAULT_FORM); setDeviceInfo(null); }}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
                  New
                </button>
              )}

              <button onClick={() => { setEvents([]); setLog([]); }}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
                Clear
              </button>

              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor[status], boxShadow: status === "connected" ? `0 0 8px ${statusColor[status]}` : "none" }} />
                <span style={{ fontSize: 13, color: statusColor[status], fontWeight: 500 }}>{statusMsg || status}</span>
              </div>
            </div>

            {deviceInfo && (
              <div style={{ marginTop: 10, padding: "7px 12px", background: "#0f172a", borderRadius: 8, fontSize: 12, color: "#22c55e" }}>
                {deviceInfo}
              </div>
            )}
          </div>

          {/* Events + Log */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
            {/* LPR Events */}
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8", marginBottom: 10 }}>
                LPR Events <span style={{ color: "#a78bfa" }}>{events.length}</span>
              </h2>
              {events.length === 0 && (
                <div style={{ background: "#1e293b", borderRadius: 10, padding: 40, textAlign: "center", color: "#475569" }}>
                  {status === "connected" ? "Waiting for vehicles…" : "Connect to a camera to see events"}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {events.map((ev) => {
                  const dir = dirInfo(ev.direction);
                  return (
                    <div key={ev.id} style={{ background: "#1e293b", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 14, alignItems: "center", borderLeft: `3px solid ${dir?.color ?? "#334155"}` }}>
                      {ev.plate_image && (
                        <img src={`data:image/jpeg;base64,${ev.plate_image}`} alt="plate"
                          style={{ height: 44, borderRadius: 6, border: "1px solid #334155" }} />
                      )}
                      <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#f1f5f9", minWidth: 140 }}>
                        {ev.plate}
                      </div>
                      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px", fontSize: 12 }}>
                        {dir && <span style={{ color: dir.color, fontWeight: 700 }}>{dir.label}</span>}
                        {ev.vehicle_type && <span style={{ color: "#94a3b8" }}>Type: {ev.vehicle_type}</span>}
                        {ev.confidence != null && (
                          <span style={{ color: ev.confidence >= 0.8 ? "#22c55e" : "#eab308" }}>
                            Confidence: {(ev.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                        {ev.country && <span style={{ color: "#94a3b8" }}>Country: {ev.country}</span>}
                        {ev.channel && <span style={{ color: "#64748b" }}>Ch: {ev.channel}</span>}
                        <span style={{ color: "#475569" }}>{ev.event_type}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", textAlign: "right", flexShrink: 0 }}>
                        <div>{ev.received_at}</div>
                        {ev.timestamp && <div style={{ marginTop: 2 }}>{new Date(ev.timestamp).toLocaleString()}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Activity log */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>Activity Log</h2>
                <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                  <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
                  Raw events
                </label>
              </div>
              <div style={{ background: "#1e293b", borderRadius: 10, padding: 14, height: 500, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
                {log.filter((e) => showRaw || e.type !== "raw_event").map((entry) => (
                  <div key={entry.id} style={{ marginBottom: 5, color: logColor[entry.type] ?? "#94a3b8" }}>
                    <span style={{ color: "#475569" }}>[{entry.time}]</span>{" "}
                    <span style={{ fontWeight: 600 }}>[{entry.type}]</span>{" "}
                    {entry.message || (entry.type === "lpr_event" ? `PLATE: ${(entry.data as LprEvent)?.plate}` : "")}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
