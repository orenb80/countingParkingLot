from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.models.parking_lot import SavedCamera

router = APIRouter(prefix="/saved-cameras", tags=["saved-cameras"])


class SavedCameraCreate(BaseModel):
    name: str
    ip_address: str
    port: int = 80
    username: str = "admin"
    password: str
    channel: int = 1
    direction: str = "entry"
    notes: Optional[str] = None


class SavedCameraOut(BaseModel):
    id: int
    name: str
    ip_address: str
    port: int
    username: str
    channel: int
    direction: str
    notes: Optional[str]
    last_seen: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[SavedCameraOut])
def list_saved_cameras(db: Session = Depends(get_db)):
    return db.query(SavedCamera).order_by(SavedCamera.name).all()


@router.post("/", response_model=SavedCameraOut, status_code=201)
def create_saved_camera(data: SavedCameraCreate, db: Session = Depends(get_db)):
    cam = SavedCamera(**data.model_dump())
    db.add(cam)
    db.commit()
    db.refresh(cam)
    return cam


@router.put("/{cam_id}", response_model=SavedCameraOut)
def update_saved_camera(cam_id: int, data: SavedCameraCreate, db: Session = Depends(get_db)):
    cam = db.query(SavedCamera).filter(SavedCamera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    for k, v in data.model_dump().items():
        setattr(cam, k, v)
    db.commit()
    db.refresh(cam)
    return cam


@router.delete("/{cam_id}", status_code=204)
def delete_saved_camera(cam_id: int, db: Session = Depends(get_db)):
    cam = db.query(SavedCamera).filter(SavedCamera.id == cam_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    db.delete(cam)
    db.commit()


@router.post("/{cam_id}/update-last-seen", status_code=204)
def update_last_seen(cam_id: int, db: Session = Depends(get_db)):
    cam = db.query(SavedCamera).filter(SavedCamera.id == cam_id).first()
    if cam:
        from datetime import timezone
        cam.last_seen = datetime.now(timezone.utc)
        db.commit()
