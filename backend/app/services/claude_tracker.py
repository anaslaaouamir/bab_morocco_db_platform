import logging
import time
import uuid
from datetime import datetime

from app.database import AsyncSessionLocal
from app.models.api_usage import ApiUsageLog

logger = logging.getLogger(__name__)


async def tracked_claude_call(
    client,
    *,
    model: str,
    max_tokens: int,
    messages: list,
    generator: str,
    prospect_id: uuid.UUID | None = None,
):
    """Wrap client.messages.create, log token usage to api_usage_logs.

    Uses its own DB session so callers don't need to thread one through.
    Returns the Anthropic Message object unchanged.
    """
    start = time.monotonic()
    success = True
    error_msg = None
    message = None

    try:
        message = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=messages,
        )
        return message
    except Exception as exc:
        success = False
        error_msg = str(exc)[:500]
        raise
    finally:
        duration_ms = int((time.monotonic() - start) * 1000)
        input_tokens = message.usage.input_tokens if message else 0
        output_tokens = message.usage.output_tokens if message else 0

        try:
            async with AsyncSessionLocal() as db:
                log = ApiUsageLog(
                    id=uuid.uuid4(),
                    timestamp=datetime.utcnow(),
                    generator=generator,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    prospect_id=prospect_id,
                    duration_ms=duration_ms,
                    success=success,
                    error_message=error_msg,
                )
                db.add(log)
                await db.commit()
        except Exception:
            logger.exception("Failed to log API usage")
