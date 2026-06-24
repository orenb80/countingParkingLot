from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.models.parking_lot import Camera
from app.services import parking_service

router = APIRouter(prefix="/cameras", tags=["cameras"])


class CameraCreate(BaseModel):
    parking_lot_id: int
    name: str
    ip_address: str
    port: int = 80
    username: str = "admin"
    password: str
    channel: int = 1
    direction: str = "entry"


class CameraOut(BaseModel):
    id: int
    parking_lot_id: int
    name: str
    ip_address: str
    port: int
    username: str
    channel: int
    direction: str
    is_active: bool
    last_seen: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[CameraOut])
def list_cameras(parking_lot_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Camera)
    if parking_lot_id:
        q = q.filter(Camera.parking_lot_id == parking_lot_id)
    return q.all()


@router.post("/", response_model=CameraOut, status_code=201)
async def create_camera(data: CameraCreate, db: Session = Depends(get_db)):
    cam = Camera(**data.model_dump())
    db.add(cam)
    db.commit()
    db.refresh(cam)
    if cam.is_active:
        await parking_service.start_camera(cam)
    return cam


@router.delete("/{camera_id}", status_code=204)
async def delete_camera(camera_id: int, db: Session = Depends(get_db)):
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    await parking_service.stop_camera(camera_id)
    cam.is_active = False
    db.commit()


@router.post("/{camera_id}/test")
async def test_camera(camera_id: int, db: Session = Depends(get_db)):
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    from app.integrations.hikvision import HikvisionLPRClient
    client = HikvisionLPRClient(
        ip=cam.ip_address, port=cam.port,
        username=cam.username, password=cam.password,
    )
    ok = await client.test_connection()
    return {"reachable": ok, "camera_id": camera_id}
