from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.database import Base, engine
from app.api import parking_lots, cameras, websocket, camera_test, saved_cameras
from app.services import parking_service
import logging

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    await parking_service.start_all_cameras()
    yield
    # cleanup on shutdown
    for cam_id in list(parking_service._active_cameras.keys()):
        await parking_service.stop_camera(cam_id)


app = FastAPI(
    title="Parking Lot Counter",
    description="Real-time vehicle counting with Hikvision LPR + Amadeus 8 integration",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parking_lots.router, prefix="/api")
app.include_router(cameras.router, prefix="/api")
app.include_router(websocket.router)
app.include_router(camera_test.router, prefix="/api")
app.include_router(saved_cameras.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
