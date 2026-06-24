export interface ParkingLot {
  id: number;
  name: string;
  location?: string;
  capacity: number;
  current_count: number;
  is_active: boolean;
  amadeus_lot_id?: string;
  occupancy_pct: number;
  created_at: string;
}

export interface Camera {
  id: number;
  parking_lot_id: number;
  name: string;
  ip_address: string;
  port: number;
  username: string;
  channel: number;
  direction: "entry" | "exit" | "both";
  is_active: boolean;
  last_seen?: string;
  created_at: string;
}

export interface VehicleEvent {
  id: number;
  license_plate?: string;
  event_type: "entry" | "exit";
  confidence?: number;
  vehicle_type?: string;
  timestamp: string;
  amadeus_synced: boolean;
}

export interface WsVehicleEvent {
  type: "vehicle_event";
  parking_lot_id: number;
  parking_lot_name: string;
  current_count: number;
  capacity: number;
  event: VehicleEvent;
}

export interface WsInitialState {
  type: "initial_state";
  lots: Array<{
    id: number;
    name: string;
    capacity: number;
    current_count: number;
    location?: string;
  }>;
}
