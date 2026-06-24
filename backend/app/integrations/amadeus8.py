"""
Amadeus 8 parking management system integration.

Amadeus 8 exposes a REST API for parking lot occupancy.
This module pushes vehicle events and syncs lot counts.
"""
import logging
import asyncio
from typing import Optional
import aiohttp
from app.core.config import settings

logger = logging.getLogger(__name__)


class Amadeus8Client:
    def __init__(self):
        self.host = settings.AMADEUS_HOST
        self.port = settings.AMADEUS_PORT
        self.api_key = settings.AMADEUS_API_KEY
        self.base_url = f"http://{self.host}:{self.port}/api/v1" if self.host else None

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["X-API-Key"] = self.api_key
        return h

    @property
    def enabled(self) -> bool:
        return bool(self.host)

    async def push_vehicle_event(self, event: dict) -> bool:
        """
        Push a vehicle entry/exit event to Amadeus 8.
        Returns True on success.
        """
        if not self.enabled:
            return False
        payload = {
            "lotId": event.get("amadeus_lot_id"),
            "licensePlate": event.get("license_plate"),
            "eventType": event.get("event_type"),
            "vehicleType": event.get("vehicle_type"),
            "timestamp": event.get("timestamp"),
        }
        try:
            async with aiohttp.ClientSession(headers=self._headers()) as session:
                async with session.post(
                    f"{self.base_url}/parking/events",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status in (200, 201):
                        return True
                    logger.warning("Amadeus 8 push returned %s", resp.status)
                    return False
        except Exception as exc:
            logger.error("Amadeus 8 push failed: %s", exc)
            return False

    async def get_lot_occupancy(self, amadeus_lot_id: str) -> Optional[int]:
        """
        Fetch current occupancy count from Amadeus 8 for a lot.
        Returns count or None on failure.
        """
        if not self.enabled:
            return None
        try:
            async with aiohttp.ClientSession(headers=self._headers()) as session:
                async with session.get(
                    f"{self.base_url}/parking/lots/{amadeus_lot_id}/occupancy",
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("currentCount")
                    return None
        except Exception as exc:
            logger.error("Amadeus 8 occupancy fetch failed: %s", exc)
            return None

    async def sync_lot_count(self, amadeus_lot_id: str, count: int) -> bool:
        """Override the occupancy count in Amadeus 8."""
        if not self.enabled:
            return False
        try:
            async with aiohttp.ClientSession(headers=self._headers()) as session:
                async with session.put(
                    f"{self.base_url}/parking/lots/{amadeus_lot_id}/occupancy",
                    json={"currentCount": count},
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as resp:
                    return resp.status in (200, 204)
        except Exception as exc:
            logger.error("Amadeus 8 sync failed: %s", exc)
            return False


amadeus_client = Amadeus8Client()
