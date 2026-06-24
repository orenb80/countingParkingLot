from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.websocket_manager import ws_manager
from app.core.database import SessionLocal
from app.models.parking_lot import ParkingLot
import asyncio
import json

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    # Send current state to new client
    db = SessionLocal()
    try:
        lots = db.query(ParkingLot).filter(ParkingLot.is_active == True).all()
        await ws_manager.send_personal(websocket, {
            "type": "initial_state",
            "lots": [
                {
                    "id": lot.id,
                    "name": lot.name,
                    "capacity": lot.capacity,
                    "current_count": lot.current_count,
                    "location": lot.location,
                }
                for lot in lots
            ],
        })
    finally:
        db.close()

    try:
        while True:
            # Keep connection alive; client can send pings
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
