import React, { useState } from "react";
import { api } from "../services/api";
import type { ParkingLot } from "../types";

interface Props {
  onClose: () => void;
  onCreated: (lot: ParkingLot) => void;
}

export function AddLotModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({ name: "", location: "", capacity: 100, amadeus_lot_id: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const lot = await api.createLot({
        ...form,
        amadeus_lot_id: form.amadeus_lot_id || undefined,
      });
      onCreated(lot);
      onClose();
    } catch {
      alert("Failed to create parking lot");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid #334155", background: "#0f172a", color: "white",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: 460, padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Add Parking Lot</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Name *</label>
            <input required style={inputStyle} value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Location</label>
            <input style={inputStyle} value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Capacity *</label>
            <input required type="number" min={1} style={inputStyle} value={form.capacity} onChange={(e) => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Amadeus 8 Lot ID (optional)</label>
            <input style={inputStyle} value={form.amadeus_lot_id} onChange={(e) => setForm(f => ({ ...f, amadeus_lot_id: e.target.value }))} placeholder="e.g. LOT-001" />
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #334155", color: "#94a3b8", background: "transparent", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#3b82f6", color: "white", cursor: "pointer", fontWeight: 600 }}>
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
