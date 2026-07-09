from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class SavedCamera(Base):
    """Standalone camera registry — not tied to a parking lot yet."""
    __tablename__ = "saved_cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    port = Column(Integer, default=80)
    username = Column(String, nullable=False, default="admin")
    password = Column(String, nullable=False)
    channel = Column(Integer, default=1)
    direction = Column(String, default="entry")
    notes = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ParkingLot(Base):
    __tablename__ = "parking_lots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    capacity = Column(Integer, nullable=False, default=100)
    current_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    amadeus_lot_id = Column(String, nullable=True)  # Amadeus 8 external ID
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    cameras = relationship("Camera", back_populates="parking_lot")
    vehicle_events = relationship("VehicleEvent", back_populates="parking_lot")


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    parking_lot_id = Column(Integer, ForeignKey("parking_lots.id"), nullable=False)
    name = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    port = Column(Integer, default=80)
    username = Column(String, nullable=False, default="admin")
    password = Column(String, nullable=False)
    channel = Column(Integer, default=1)
    direction = Column(String, default="entry")  # "entry" | "exit" | "both"
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    parking_lot = relationship("ParkingLot", back_populates="cameras")


class VehicleEvent(Base):
    __tablename__ = "vehicle_events"

    id = Column(Integer, primary_key=True, index=True)
    parking_lot_id = Column(Integer, ForeignKey("parking_lots.id"), nullable=False)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    license_plate = Column(String, nullable=True)
    event_type = Column(String, nullable=False)  # "entry" | "exit"
    confidence = Column(Float, nullable=True)
    vehicle_type = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    amadeus_synced = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    parking_lot = relationship("ParkingLot", back_populates="vehicle_events")
