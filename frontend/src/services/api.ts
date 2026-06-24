import type { ParkingLot, Camera, VehicleEvent } from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Parking lots
  getLots: () => request<ParkingLot[]>("/parking-lots/"),
  createLot: (data: Partial<ParkingLot>) =>
    request<ParkingLot>("/parking-lots/", { method: "POST", body: JSON.stringify(data) }),
  updateLot: (id: number, data: Partial<ParkingLot>) =>
    request<ParkingLot>(`/parking-lots/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLot: (id: number) =>
    request<void>(`/parking-lots/${id}`, { method: "DELETE" }),
  adjustCount: (id: number, delta: number) =>
    request<ParkingLot>(`/parking-lots/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify({ delta }),
    }),
  getEvents: (lotId: number, limit = 50) =>
    request<VehicleEvent[]>(`/parking-lots/${lotId}/events?limit=${limit}`),

  // Cameras
  getCameras: (lotId?: number) =>
    request<Camera[]>(`/cameras/${lotId ? `?parking_lot_id=${lotId}` : ""}`),
  createCamera: (data: Partial<Camera> & { password: string }) =>
    request<Camera>("/cameras/", { method: "POST", body: JSON.stringify(data) }),
  deleteCamera: (id: number) =>
    request<void>(`/cameras/${id}`, { method: "DELETE" }),
  testCamera: (id: number) =>
    request<{ reachable: boolean }>(`/cameras/${id}/test`, { method: "POST" }),
};
