import asyncio
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import AsyncSessionLocal
from app.models.user import User
from app.services import auth_service
from app.services.notification_bus import notification_bus

router = APIRouter(tags=["notifications"])


async def _watch_disconnect(websocket: WebSocket) -> None:
    """
    This channel is push-only — the client never sends anything — so the
    only way to notice a closed tab/dropped connection promptly is to keep a
    receive() pending. Without this, a browser tab closed while the event
    queue is idle would never be detected (nothing would ever call
    send_json() to surface the failure), leaking the queue forever.
    """
    while True:
        await websocket.receive_text()


async def _forward_events(websocket: WebSocket, queue: "asyncio.Queue[dict]") -> None:
    while True:
        event = await queue.get()
        await websocket.send_json(event)


@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket) -> None:
    """
    Live push channel for webhook-driven events (inbound email replies, email
    opens) so the UI updates without a manual refresh. Browsers can't send an
    Authorization header on a WebSocket handshake, so the JWT is passed as a
    query parameter instead and validated the same way as any other request.
    """
    token = websocket.query_params.get("token")
    user: User | None = None
    if token:
        try:
            payload = auth_service.decode_token(token)
            async with AsyncSessionLocal() as db:
                user = await db.get(User, uuid.UUID(payload["sub"]))
        except (ValueError, KeyError):
            user = None

    if not user or not user.is_active:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    queue = notification_bus.register(user.id, user.role == "admin")

    reader = asyncio.create_task(_watch_disconnect(websocket))
    sender = asyncio.create_task(_forward_events(websocket, queue))
    try:
        done, pending = await asyncio.wait({reader, sender}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        # asyncio.wait() never raises a task's exception itself — retrieve it
        # from each finished task so it isn't logged as "never retrieved"
        # (the ordinary case here is a WebSocketDisconnect from either side).
        for task in done:
            task.exception()
    finally:
        notification_bus.unregister(user.id, queue)
