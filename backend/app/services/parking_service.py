"""
Core service: processes LPR events, updates lot counts, broadcasts via WebSocket.
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Optional
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.parking_lot import ParkingLot, Camera, VehicleEvent
from app.services.websocket_manager import ws_manager
from app.integrations.amadeus8 import amadeus_client
from app.integrations.hikvision import HikvisionLPRClient

logger = logging.getLogger(__name__)

# camera_id -> running HikvisionLPRClient
_active_cameras: Dict[int, HikvisionLPRClient] = {}
_camera_tasks: Dict[int, asyncio.Task] = {}


async def handle_lpr_event(event: dict):
    """Process an incoming LPR event from any camera."""
    db: Session = SessionLocal()
    try:
        parking_lot_id = event["parking_lot_id"]
        camera_id = event.get("camera_id")
        event_type = event["event_type"]  # entry | exit

        lot = db.query(ParkingLot).filter(ParkingLot.id == parking_lot_id).first()
        if not lot:
            return

        # Update count
        if event_type == "entry":
            lot.current_count = min(lot.current_count + 1, lot.capacity)
        elif event_type == "exit":
            lot.current_count = max(lot.current_count - 1, 0)

        # Persist event
        ve = VehicleEvent(
            parking_lot_id=parking_lot_id,
            camera_id=camera_id,
            license_plate=event.get("license_plate"),
            event_type=event_type,
            confidence=event.get("confidence"),
            vehicle_type=event.get("vehicle_type"),
            amadeus_synced=False,
        )
        db.add(ve)
        db.commit()
        db.refresh(lot)
        db.refresh(ve)

        # Broadcast to all dashboard clients
        await ws_manager.broadcast({
            "type": "vehicle_event",
            "parking_lot_id": parking_lot_id,
            "parking_lot_name": lot.name,
            "current_count": lot.current_count,
            "capacity": lot.capacity,
            "event": {
                "id": ve.id,
                "license_plate": ve.license_plate,
                "event_type": ve.event_type,
                "confidence": ve.confidence,
                "vehicle_type": ve.vehicle_type,
                "timestamp": ve.timestamp.isoformat(),
            },
        })

        # Async push to Amadeus 8
        if lot.amadeus_lot_id:
            asyncio.create_task(
                amadeus_client.push_vehicle_event({
                    **event,
                    "amadeus_lot_id": lot.amadeus_lot_id,
                })
            )
    finally:
        db.close()


async def start_camera(camera: Camera):
    """Start streaming events from a Hikvision camera."""
    if camera.id in _active_cameras:
        return
    client = HikvisionLPRClient(
        ip=camera.ip_address,
        port=camera.port,
        username=camera.username,
        password=camera.password,
        channel=camera.channel,
        camera_id=camera.id,
        parking_lot_id=camera.parking_lot_id,
        direction=camera.direction,
    )
    _active_cameras[camera.id] = client

    async def run():
        logger.info("Starting LPR stream for camera %s (%s)", camera.id, camera.ip_address)
        await client.stream_events(handle_lpr_event)

    task = asyncio.create_task(run())
    _camera_tasks[camera.id] = task


async def stop_camera(camera_id: int):
    client = _active_cameras.pop(camera_id, None)
    if client:
        client.stop()
    task = _camera_tasks.pop(camera_id, None)
    if task:
        task.cancel()


async def start_all_cameras():
    """Called on app startup — start streaming for all active cameras."""
    db: Session = SessionLocal()
    try:
        cameras = (
            db.query(Camera)
            .join(ParkingLot)
            .filter(Camera.is_active == True, ParkingLot.is_active == True)
            .all()
        )
        for cam in cameras:
            await start_camera(cam)
    finally:
        db.close()


def manual_adjust(parking_lot_id: int, delta: int, db: Session) -> Optional[ParkingLot]:
    """Manual count adjustment (for corrections/overrides)."""
    lot = db.query(ParkingLot).filter(ParkingLot.id == parking_lot_id).first()
    if not lot:
        return None
    lot.current_count = max(0, min(lot.current_count + delta, lot.capacity))
    db.commit()
    db.refresh(lot)
    return lot
