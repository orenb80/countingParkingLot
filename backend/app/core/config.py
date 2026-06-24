from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Parking Lot Counter"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite:///./parking.db"

    # Hikvision camera defaults (overridable per-camera in DB)
    HIKVISION_DEFAULT_PORT: int = 80
    HIKVISION_EVENT_POLL_INTERVAL: int = 5  # seconds

    # Amadeus 8 integration
    AMADEUS_HOST: Optional[str] = None
    AMADEUS_PORT: int = 8080
    AMADEUS_API_KEY: Optional[str] = None
    AMADEUS_SYNC_INTERVAL: int = 30  # seconds

    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
