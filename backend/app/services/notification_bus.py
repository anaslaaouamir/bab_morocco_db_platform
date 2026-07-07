import asyncio
import uuid


class NotificationBus:
    """
    In-process pub/sub that pushes webhook-driven events (inbound replies,
    email opens) to connected browser tabs over WebSocket, so the UI updates
    live instead of only on manual refresh. No external broker — this app
    runs as a single backend process, so an in-memory queue per connection
    is sufficient.

    Routing mirrors the ownership model used everywhere else in the app: a
    Commercial only receives events for prospects assigned to them; an Admin
    receives every event, regardless of ownership.
    """

    def __init__(self) -> None:
        self._queues: dict[uuid.UUID, set[asyncio.Queue]] = {}
        self._admins: set[uuid.UUID] = set()

    def register(self, user_id: uuid.UUID, is_admin: bool) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._queues.setdefault(user_id, set()).add(queue)
        if is_admin:
            self._admins.add(user_id)
        return queue

    def unregister(self, user_id: uuid.UUID, queue: asyncio.Queue) -> None:
        queues = self._queues.get(user_id)
        if not queues:
            return
        queues.discard(queue)
        if not queues:
            self._queues.pop(user_id, None)
            self._admins.discard(user_id)

    def publish(self, event: dict, assigned_to: uuid.UUID | None) -> None:
        """Deliver `event` to every connected Admin plus the owning Commercial, if any."""
        targets = set(self._admins)
        if assigned_to is not None:
            targets.add(assigned_to)
        for user_id in targets:
            for queue in self._queues.get(user_id, ()):
                queue.put_nowait(event)


notification_bus = NotificationBus()
