from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.core.database import get_db
from app.models.parking_lot import ParkingLot, Camera, VehicleEvent
from app.services import parking_service

router = APIRouter(prefix="/parking-lots", tags=["parking-lots"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ParkingLotCreate(BaseModel):
    name: str
    location: Optional[str] = None
    capacity: int = 100
    amadeus_lot_id: Optional[str] = None


class ParkingLotUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None
    amadeus_lot_id: Optional[str] = None


class ParkingLotOut(BaseModel):
    id: int
    name: str
    location: Optional[str]
    capacity: int
    current_count: int
    is_active: bool
    amadeus_lot_id: Optional[str]
    occupancy_pct: float
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_ext(cls, lot: ParkingLot):
        obj = cls.model_validate(lot)
        obj.occupancy_pct = round(lot.current_count / lot.capacity * 100, 1) if lot.capacity else 0
        return obj


class ManualAdjustRequest(BaseModel):
    delta: int  # positive = add, negative = remove


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ParkingLotOut])
def list_lots(db: Session = Depends(get_db)):
    lots = db.query(ParkingLot).filter(ParkingLot.is_active == True).all()
    return [ParkingLotOut.from_orm_ext(lot) for lot in lots]


@router.post("/", response_model=ParkingLotOut, status_code=201)
def create_lot(data: ParkingLotCreate, db: Session = Depends(get_db)):
    lot = ParkingLot(**data.model_dump())
    db.add(lot)
    db.commit()
    db.refresh(lot)
    return ParkingLotOut.from_orm_ext(lot)


@router.get("/{lot_id}", response_model=ParkingLotOut)
def get_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.query(ParkingLot).filter(ParkingLot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return ParkingLotOut.from_orm_ext(lot)


@router.put("/{lot_id}", response_model=ParkingLotOut)
def update_lot(lot_id: int, data: ParkingLotUpdate, db: Session = Depends(get_db)):
    lot = db.query(ParkingLot).filter(ParkingLot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(lot, k, v)
    db.commit()
    db.refresh(lot)
    return ParkingLotOut.from_orm_ext(lot)


@router.delete("/{lot_id}", status_code=204)
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.query(ParkingLot).filter(ParkingLot.id == lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    lot.is_active = False
    db.commit()


@router.post("/{lot_id}/adjust", response_model=ParkingLotOut)
def adjust_count(lot_id: int, body: ManualAdjustRequest, db: Session = Depends(get_db)):
    lot = parking_service.manual_adjust(lot_id, body.delta, db)
    if not lot:
        raise HTTPException(status_code=404, detail="Parking lot not found")
    return ParkingLotOut.from_orm_ext(lot)


@router.get("/{lot_id}/events")
def get_events(
    lot_id: int,
    limit: int = 50,
    event_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(VehicleEvent).filter(VehicleEvent.parking_lot_id == lot_id)
    if event_type:
        q = q.filter(VehicleEvent.event_type == event_type)
    events = q.order_by(VehicleEvent.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "license_plate": e.license_plate,
            "event_type": e.event_type,
            "confidence": e.confidence,
            "vehicle_type": e.vehicle_type,
            "timestamp": e.timestamp.isoformat(),
            "amadeus_synced": e.amadeus_synced,
        }
        for e in events
    ]
