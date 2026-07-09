"""
Camera LPR test listener — SSE proxy endpoint.
Connects to a Hikvision camera ISAPI alert stream and forwards
parsed LPR events to the browser via Server-Sent Events.
"""
import asyncio
import json
import logging
from typing import AsyncGenerator

import aiohttp
from aiohttp import BasicAuth
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/camera-test", tags=["camera-test"])


async def _needs_digest(ip: str, port: int) -> bool:
    """Return True if camera requires Digest auth."""
    url = f"http://{ip}:{port}/ISAPI/System/deviceInfo"
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as r:
                if r.status == 401:
                    www_auth = r.headers.get("WWW-Authenticate", "")
                    return "Digest" in www_auth
        except Exception:
            pass
    return False


async def _stream_lpr_events(ip: str, port: int, username: str, password: str) -> AsyncGenerator[str, None]:
    """Open ISAPI alert stream and yield SSE-formatted LPR events."""
    import xmltodict

    stream_url = f"http://{ip}:{port}/ISAPI/Event/notification/alertStream"

    # Try to get device info first
    device_info = await _get_device_info(ip, port, username, password)
    yield _sse("connected", {"message": f"Connected to {device_info}", "url": stream_url})

    auth = BasicAuth(username, password)

    connector = aiohttp.TCPConnector(ssl=False)
    timeout = aiohttp.ClientTimeout(connect=8, sock_read=None)

    try:
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            # Try Basic first, then Digest
            from aiohttp import BasicAuth as _BA
        auth_options = [{"auth": _BA(username, password)}]
        # DigestAuth class name varies by aiohttp version
        try:
            from aiohttp import DigestAuth
            auth_options.append({"auth": DigestAuth(username, password)})
        except ImportError:
            pass

        for auth_method in auth_options:
                try:
                    async with session.get(stream_url, **auth_method) as resp:
                        if resp.status == 401:
                            continue
                        if resp.status != 200:
                            yield _sse("error", {"message": f"Camera returned HTTP {resp.status}"})
                            return

                        yield _sse("info", {"message": f"Stream open (HTTP {resp.status}). Waiting for LPR events…"})

                        buffer = b""
                        async for chunk in resp.content.iter_chunked(4096):
                            buffer += chunk
                            # Extract complete XML blocks
                            while True:
                                start = buffer.find(b"<EventNotificationAlert")
                                if start == -1:
                                    break
                                end = buffer.find(b"</EventNotificationAlert>", start)
                                if end == -1:
                                    break
                                end += len(b"</EventNotificationAlert>")
                                xml_bytes = buffer[start:end]
                                buffer = buffer[end:]

                                try:
                                    doc = xmltodict.parse(xml_bytes)
                                    alert = doc.get("EventNotificationAlert", {})
                                    event_type = alert.get("eventType", "")

                                    lpr_types = {"ANPR", "licensePlate", "TrafficVehicle", "ANPRInVehicleDetector"}
                                    if event_type not in lpr_types:
                                        # Forward non-LPR events as info so tester sees all traffic
                                        yield _sse("raw_event", {"eventType": event_type})
                                        continue

                                    lpr = (
                                        alert.get("ANPR")
                                        or alert.get("licensePlate")
                                        or alert.get("TrafficVehicle")
                                        or {}
                                    )

                                    plate = (
                                        lpr.get("licensePlate")
                                        or lpr.get("plate")
                                        or lpr.get("plateNumber")
                                        or "UNKNOWN"
                                    )
                                    confidence = lpr.get("confidence") or lpr.get("plateScore")
                                    vehicle_type = lpr.get("vehicleType")
                                    direction = alert.get("direction") or lpr.get("direction")
                                    country = lpr.get("country") or lpr.get("plateCountry")

                                    # Extract plate image if present
                                    plate_image = None
                                    pic_list = alert.get("pictureURLList") or {}
                                    pic = pic_list.get("pictureURL") if pic_list else None
                                    if pic and isinstance(pic, dict):
                                        plate_image = pic.get("#text") or pic.get("url")

                                    event = {
                                        "plate": plate,
                                        "confidence": float(confidence) if confidence else None,
                                        "vehicle_type": vehicle_type,
                                        "direction": direction,
                                        "country": country,
                                        "event_type": event_type,
                                        "channel": alert.get("channelID"),
                                        "plate_image": plate_image,
                                        "timestamp": alert.get("dateTime"),
                                        "raw_type": event_type,
                                    }
                                    yield _sse("lpr_event", event)

                                except Exception as parse_err:
                                    logger.warning("XML parse error: %s", parse_err)
                                    yield _sse("parse_error", {"message": str(parse_err)})
                    break  # auth succeeded
                except aiohttp.ClientError as e:
                    yield _sse("error", {"message": f"Connection error: {e}"})
                    return

    except asyncio.CancelledError:
        yield _sse("disconnected", {"message": "Stream closed by client"})
    except Exception as e:
        yield _sse("error", {"message": str(e)})


async def _get_device_info(ip: str, port: int, username: str, password: str) -> str:
    import xmltodict
    url = f"http://{ip}:{port}/ISAPI/System/deviceInfo"
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, auth=BasicAuth(username, password), timeout=aiohttp.ClientTimeout(total=5)) as r:
                if r.status == 200:
                    data = xmltodict.parse(await r.text())
                    info = data.get("DeviceInfo", {})
                    model = info.get("model", "Unknown")
                    firmware = info.get("firmwareVersion", "")
                    return f"{model} (fw: {firmware})"
    except Exception:
        pass
    return f"{ip}:{port}"


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/stream")
async def camera_stream(
    ip: str = Query(...),
    port: int = Query(80),
    username: str = Query("admin"),
    password: str = Query(...),
):
    """SSE endpoint — streams live LPR events from a Hikvision camera."""
    async def generate():
        async for chunk in _stream_lpr_events(ip, port, username, password):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/ping")
async def ping_camera(
    ip: str = Query(...),
    port: int = Query(80),
    username: str = Query("admin"),
    password: str = Query(...),
):
    """Quick reachability + device info check."""
    info = await _get_device_info(ip, port, username, password)
    reachable = info != f"{ip}:{port}" or True
    return {"reachable": reachable, "device_info": info, "ip": ip, "port": port}
