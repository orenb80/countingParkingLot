"""
Camera LPR test listener — SSE proxy endpoint.
Uses requests (sync) in a thread so we can properly handle
Hikvision's multipart alert stream with auto Digest/Basic auth negotiation.
"""
import json
import logging
import threading
import queue
from typing import Generator

import requests
from requests.auth import HTTPBasicAuth, HTTPDigestAuth
import xmltodict
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/camera-test", tags=["camera-test"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _get_device_info(ip: str, port: int, username: str, password: str) -> tuple[str, object]:
    """
    Fetch device info and return (description, auth_object).
    Tries Digest first (most Hikvision cameras), falls back to Basic.
    """
    url = f"http://{ip}:{port}/ISAPI/System/deviceInfo"
    for auth in [HTTPDigestAuth(username, password), HTTPBasicAuth(username, password)]:
        try:
            r = requests.get(url, auth=auth, timeout=6)
            if r.status_code == 200:
                info = xmltodict.parse(r.text).get("DeviceInfo", {})
                model = info.get("model", "Unknown")
                fw = info.get("firmwareVersion", "")
                return f"{model} (fw: {fw})", auth
        except Exception:
            pass
    return f"{ip}:{port}", HTTPDigestAuth(username, password)


def _stream_worker(ip: str, port: int, username: str, password: str, q: queue.Queue, stop: threading.Event):
    """Runs in a background thread — pushes SSE strings into the queue."""
    stream_url = f"http://{ip}:{port}/ISAPI/Event/notification/alertStream"

    device_info, auth = _get_device_info(ip, port, username, password)
    q.put(_sse("connected", {"message": f"Connected to {device_info}"}))
    q.put(_sse("info", {"message": f"Opening stream: {stream_url}"}))

    try:
        with requests.get(stream_url, auth=auth, stream=True, timeout=(8, None)) as resp:
            if resp.status_code == 401:
                q.put(_sse("error", {"message": "Authentication failed — check username and password"}))
                return
            if resp.status_code != 200:
                q.put(_sse("error", {"message": f"Camera returned HTTP {resp.status_code}"}))
                return

            q.put(_sse("info", {"message": f"Stream open (HTTP {resp.status_code}). Waiting for LPR events…"}))

            buffer = b""
            for chunk in resp.iter_content(chunk_size=4096):
                if stop.is_set():
                    break
                if not chunk:
                    continue
                buffer += chunk

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
                            q.put(_sse("raw_event", {"eventType": event_type}))
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
                        }
                        q.put(_sse("lpr_event", event))

                    except Exception as parse_err:
                        logger.warning("XML parse error: %s", parse_err)
                        q.put(_sse("parse_error", {"message": str(parse_err)}))

    except requests.exceptions.ConnectionError as e:
        q.put(_sse("error", {"message": f"Connection error: {e}"}))
    except Exception as e:
        q.put(_sse("error", {"message": str(e)}))
    finally:
        q.put(None)  # sentinel — stream ended


@router.get("/stream")
def camera_stream(
    ip: str = Query(...),
    port: int = Query(80),
    username: str = Query("admin"),
    password: str = Query(...),
):
    """SSE endpoint — streams live LPR events from a Hikvision camera."""
    q: queue.Queue = queue.Queue()
    stop = threading.Event()

    t = threading.Thread(target=_stream_worker, args=(ip, port, username, password, q, stop), daemon=True)
    t.start()

    def generate() -> Generator[str, None, None]:
        try:
            while True:
                item = q.get(timeout=30)
                if item is None:
                    break
                yield item
        except queue.Empty:
            yield _sse("error", {"message": "Stream timeout — no data received for 30s"})
        finally:
            stop.set()

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
def ping_camera(
    ip: str = Query(...),
    port: int = Query(80),
    username: str = Query("admin"),
    password: str = Query(...),
):
    """Quick reachability + device info check."""
    info, auth = _get_device_info(ip, port, username, password)
    reachable = info != f"{ip}:{port}"
    auth_type = "digest" if isinstance(auth, HTTPDigestAuth) else "basic"
    return {"reachable": reachable, "device_info": info, "ip": ip, "port": port, "auth_type": auth_type}
