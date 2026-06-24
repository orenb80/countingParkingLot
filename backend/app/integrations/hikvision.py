"""
Hikvision ISAPI integration for LPR events.

Supports two modes:
  1. Alert streaming  – polls /ISAPI/Event/notification/alertStream (multipart HTTP)
  2. Search/pull      – polls /ISAPI/Traffic/channels/{ch}/vehicleDetect/plates (fallback)

Each camera runs its own background task.
"""
import asyncio
import logging
import base64
from datetime import datetime
from typing import Optional, Callable, Awaitable
import aiohttp
import xmltodict

logger = logging.getLogger(__name__)


class HikvisionLPRClient:
    def __init__(
        self,
        ip: str,
        port: int,
        username: str,
        password: str,
        channel: int = 1,
        camera_id: int = 0,
        parking_lot_id: int = 0,
        direction: str = "both",
    ):
        self.base_url = f"http://{ip}:{port}"
        self.auth = aiohttp.BasicAuth(username, password)
        self.channel = channel
        self.camera_id = camera_id
        self.parking_lot_id = parking_lot_id
        self.direction = direction
        self._running = False

    async def stream_events(self, callback: Callable[[dict], Awaitable[None]]):
        """Stream LPR events via Hikvision alert stream endpoint."""
        url = f"{self.base_url}/ISAPI/Event/notification/alertStream"
        self._running = True
        while self._running:
            try:
                async with aiohttp.ClientSession(auth=self.auth) as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=None)) as resp:
                        if resp.status != 200:
                            logger.warning("Camera %s stream returned %s", self.camera_id, resp.status)
                            await asyncio.sleep(10)
                            continue
                        buffer = b""
                        async for chunk in resp.content.iter_chunked(4096):
                            buffer += chunk
                            events = self._extract_xml_events(buffer)
                            for xml_bytes, end in events:
                                buffer = buffer[end:]
                                await self._handle_xml(xml_bytes, callback)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Camera %s stream error: %s", self.camera_id, exc)
                await asyncio.sleep(10)

    def stop(self):
        self._running = False

    def _extract_xml_events(self, data: bytes):
        """Extract complete XML blocks from multipart stream buffer."""
        results = []
        start = data.find(b"<EventNotificationAlert")
        while start != -1:
            end = data.find(b"</EventNotificationAlert>", start)
            if end == -1:
                break
            end += len(b"</EventNotificationAlert>")
            results.append((data[start:end], end))
            start = data.find(b"<EventNotificationAlert", end)
        return results

    async def _handle_xml(self, xml_bytes: bytes, callback):
        try:
            doc = xmltodict.parse(xml_bytes)
            alert = doc.get("EventNotificationAlert", {})
            event_type = alert.get("eventType", "")
            if event_type not in ("ANPR", "licensePlate", "TrafficVehicle"):
                return
            lpr = (
                alert.get("ANPR", {})
                or alert.get("licensePlate", {})
                or alert.get("TrafficVehicle", {})
            )
            plate = lpr.get("licensePlate") or lpr.get("plate") or lpr.get("plateNumber", "")
            confidence = float(lpr.get("confidence", 0) or 0)
            vehicle_type = lpr.get("vehicleType", None)
            direction = self._resolve_direction(alert.get("direction", ""))
            event = {
                "camera_id": self.camera_id,
                "parking_lot_id": self.parking_lot_id,
                "license_plate": plate,
                "confidence": confidence,
                "vehicle_type": vehicle_type,
                "event_type": direction,
                "timestamp": datetime.utcnow().isoformat(),
                "raw": alert,
            }
            await callback(event)
        except Exception as exc:
            logger.error("Failed to parse Hikvision XML: %s", exc)

    def _resolve_direction(self, raw: str) -> str:
        """Map camera-reported direction to entry/exit based on camera config."""
        raw_lower = (raw or "").lower()
        if self.direction == "entry":
            return "entry"
        if self.direction == "exit":
            return "exit"
        # direction == "both": use raw value from camera
        if "exit" in raw_lower or "out" in raw_lower:
            return "exit"
        return "entry"

    async def test_connection(self) -> bool:
        """Check if camera is reachable."""
        url = f"{self.base_url}/ISAPI/System/deviceInfo"
        try:
            async with aiohttp.ClientSession(auth=self.auth) as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    return resp.status == 200
        except Exception:
            return False
