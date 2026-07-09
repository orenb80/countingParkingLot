import React, { useState, useRef, useEffect } from "react";

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

export function CameraTestPage() {
  const [form, setForm] = useState({
    ip: "",
    port: "80",
    username: "admin",
    password: "",
  });
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [events, setEvents] = useState<LprEvent[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  function addLog(type: LogEntry["type"], message?: string, data?: unknown) {
    setLog((prev) => [
      ...prev,
      { id: nextId(), type, message, data, time: new Date().toLocaleTimeString() },
    ]);
  }

  async function handlePing() {
    setPinging(true);
    setDeviceInfo(null);
    try {
      const params = new URLSearchParams({ ip: form.ip, port: form.port, username: form.username, password: form.password });
      const res = await fetch(`/api/camera-test/ping?${params}`);
      const data = await res.json();
      if (data.reachable) {
        setDeviceInfo(data.device_info);
        addLog("info", `Camera reachable: ${data.device_info}`);
      } else {
        addLog("error", "Camera not reachable");
      }
    } catch {
      addLog("error", "Ping failed — check IP and port");
    } finally {
      setPinging(false);
    }
  }

  function handleConnect() {
    if (esRef.current) {
      esRef.current.close();
    }
    setStatus("connecting");
    setStatusMsg("Connecting…");
    addLog("info", `Connecting to ${form.ip}:${form.port}…`);

    const params = new URLSearchParams({ ip: form.ip, port: form.port, username: form.username, password: form.password });
    const es = new EventSource(`/api/camera-test/stream?${params}`);
    esRef.current = es;

    es.addEventListener("connected", (e) => {
      const d = JSON.parse(e.data);
      setStatus("connected");
      setStatusMsg(d.message);
      addLog("connected", d.message);
    });

    es.addEventListener("info", (e) => {
      const d = JSON.parse(e.data);
      addLog("info", d.message);
    });

    es.addEventListener("lpr_event", (e) => {
      const d = JSON.parse(e.data);
      const ev: LprEvent = { ...d, id: nextId(), received_at: new Date().toLocaleTimeString() };
      setEvents((prev) => [ev, ...prev.slice(0, 199)]);
      addLog("lpr_event", undefined, d);
    });

    es.addEventListener("raw_event", (e) => {
      const d = JSON.parse(e.data);
      addLog("raw_event", `Non-LPR event: ${d.eventType}`, d);
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        setStatus("error");
        setStatusMsg(d.message);
        addLog("error", d.message);
      } catch {
        // SSE connection-level error
        if (status === "connected") {
          setStatus("disconnected");
          setStatusMsg("Stream disconnected");
          addLog("disconnected", "Stream disconnected unexpectedly");
        }
      }
    });

    es.addEventListener("disconnected", (e) => {
      const d = JSON.parse(e.data);
      setStatus("disconnected");
      setStatusMsg(d.message);
      addLog("disconnected", d.message);
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
        setStatusMsg("Connection closed");
      }
    };
  }

  function handleDisconnect() {
    esRef.current?.close();
    esRef.current = null;
    setStatus("disconnected");
    setStatusMsg("Disconnected by user");
    addLog("disconnected", "Disconnected by user");
  }

  function handleClear() {
    setEvents([]);
    setLog([]);
  }

  const statusColor: Record<ConnectStatus, string> = {
    idle: "#64748b",
    connecting: "#eab308",
    connected: "#22c55e",
    error: "#ef4444",
    disconnected: "#94a3b8",
  };

  const inputStyle: React.CSSProperties = {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
    color: "white",
    padding: "8px 12px",
    width: "100%",
    fontSize: 13,
  };

  const logTypeColor: Record<string, string> = {
    connected: "#22c55e",
    disconnected: "#94a3b8",
    info: "#60a5fa",
    lpr_event: "#a78bfa",
    error: "#ef4444",
    raw_event: "#64748b",
    parse_error: "#f97316",
  };

  const directionLabel = (d: string | null) => {
    if (!d) return null;
    const l = d.toLowerCase();
    if (l.includes("exit") || l.includes("out")) return { label: "EXIT", color: "#ef4444" };
    return { label: "ENTRY", color: "#22c55e" };
  };

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>LPR Camera Test Listener</h1>
        <p style={{ color: "#64748b", fontSize: 13 }}>Connect to a Hikvision camera and watch LPR events in real time.</p>
      </div>

      {/* Connection form */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Camera IP</label>
            <input style={inputStyle} placeholder="192.168.1.100" value={form.ip} onChange={(e) => setForm(f => ({ ...f, ip: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Port</label>
            <input style={inputStyle} value={form.port} onChange={(e) => setForm(f => ({ ...f, port: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Username</label>
            <input style={inputStyle} value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Password</label>
            <input style={inputStyle} type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={handlePing}
            disabled={!form.ip || pinging}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}
          >
            {pinging ? "Pinging…" : "Ping Camera"}
          </button>

          {status !== "connected" && status !== "connecting" ? (
            <button
              onClick={handleConnect}
              disabled={!form.ip || !form.password}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", cursor: "pointer", fontWeight: 600 }}
            >
              Connect & Listen
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "white", cursor: "pointer", fontWeight: 600 }}
            >
              Disconnect
            </button>
          )}

          <button
            onClick={handleClear}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}
          >
            Clear
          </button>

          {/* Status indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor[status], boxShadow: status === "connected" ? `0 0 8px ${statusColor[status]}` : "none" }} />
            <span style={{ fontSize: 13, color: statusColor[status], fontWeight: 500 }}>{statusMsg || status}</span>
          </div>
        </div>

        {deviceInfo && (
          <div style={{ marginTop: 12, padding: "8px 14px", background: "#0f172a", borderRadius: 8, fontSize: 12, color: "#22c55e" }}>
            Device: {deviceInfo}
          </div>
        )}
      </div>

      {/* Main content: events + log */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20 }}>

        {/* LPR Events */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>
              LPR Events <span style={{ color: "#a78bfa", marginLeft: 8 }}>{events.length}</span>
            </h2>
          </div>

          {events.length === 0 && (
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 48, textAlign: "center", color: "#475569" }}>
              {status === "connected" ? "Waiting for vehicles…" : "Connect to a camera to see events"}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((ev) => {
              const dir = directionLabel(ev.direction);
              return (
                <div key={ev.id} style={{ background: "#1e293b", borderRadius: 10, padding: "14px 18px", display: "flex", gap: 16, alignItems: "center", borderLeft: `3px solid ${dir?.color ?? "#334155"}` }}>
                  {/* Plate image */}
                  {ev.plate_image && (
                    <img
                      src={`data:image/jpeg;base64,${ev.plate_image}`}
                      alt="plate"
                      style={{ height: 48, borderRadius: 6, border: "1px solid #334155" }}
                    />
                  )}

                  {/* Plate number */}
                  <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, letterSpacing: 2, color: "#f1f5f9", minWidth: 160 }}>
                    {ev.plate}
                  </div>

                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12 }}>
                    {dir && (
                      <span style={{ color: dir.color, fontWeight: 700 }}>{dir.label}</span>
                    )}
                    {ev.vehicle_type && <span style={{ color: "#94a3b8" }}>Type: {ev.vehicle_type}</span>}
                    {ev.confidence != null && (
                      <span style={{ color: ev.confidence >= 0.8 ? "#22c55e" : "#eab308" }}>
                        Confidence: {(ev.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {ev.country && <span style={{ color: "#94a3b8" }}>Country: {ev.country}</span>}
                    {ev.channel && <span style={{ color: "#64748b" }}>Ch: {ev.channel}</span>}
                    <span style={{ color: "#64748b" }}>Event: {ev.event_type}</span>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>Activity Log</h2>
            <label style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
              Show raw events
            </label>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, height: 600, overflowY: "auto", fontFamily: "monospace", fontSize: 12 }}>
            {log
              .filter((e) => showRaw || e.type !== "raw_event")
              .map((entry) => (
                <div key={entry.id} style={{ marginBottom: 6, color: logTypeColor[entry.type] ?? "#94a3b8" }}>
                  <span style={{ color: "#475569" }}>[{entry.time}]</span>{" "}
                  <span style={{ fontWeight: 600 }}>[{entry.type}]</span>{" "}
                  {entry.message || (entry.type === "lpr_event" ? `PLATE: ${(entry.data as LprEvent)?.plate}` : JSON.stringify(entry.data))}
                </div>
              ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
