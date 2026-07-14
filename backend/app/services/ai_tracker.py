import logging
import time
import uuid
from datetime import datetime

from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.api_usage import ApiUsageLog
from app.models.system_settings import SystemSetting

logger = logging.getLogger(__name__)

MONTHLY_LIMIT_KEY = "monthly_token_limit"


async def _check_monthly_limit() -> None:
    """Raise ValueError if the configured monthly token cap is already reached.

    No row / value <= 0 in system_settings means unlimited — the default until
    an admin sets a cap in Settings. Counts tokens from ALL providers.
    """
    async with AsyncSessionLocal() as db:
        setting = (
            await db.execute(select(SystemSetting).where(SystemSetting.key == MONTHLY_LIMIT_KEY))
        ).scalar_one_or_none()
        if not setting or not setting.value:
            return
        try:
            limit = int(setting.value)
        except ValueError:
            return
        if limit <= 0:
            return

        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        current_total = (
            await db.execute(
                select(func.coalesce(func.sum(ApiUsageLog.total_tokens), 0)).where(
                    ApiUsageLog.timestamp >= month_start
                )
            )
        ).scalar_one()

        if current_total >= limit:
            raise ValueError(
                f"Monthly token limit reached ({current_total} / {limit} tokens). "
                "Increase the limit in Settings or wait until next month."
            )


async def _log_usage(
    *,
    generator: str,
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    prospect_id: uuid.UUID | None,
    duration_ms: int,
    success: bool,
    error_msg: str | None,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            log = ApiUsageLog(
                id=uuid.uuid4(),
                timestamp=datetime.utcnow(),
                generator=generator,
                provider=provider,
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
    await _check_monthly_limit()

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

        await _log_usage(
            generator=generator,
            provider="claude",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            prospect_id=prospect_id,
            duration_ms=duration_ms,
            success=success,
            error_msg=error_msg,
        )


async def tracked_openai_call(
    client,
    *,
    model: str,
    max_tokens: int,
    messages: list,
    generator: str,
    prospect_id: uuid.UUID | None = None,
):
    """Wrap client.chat.completions.create, log token usage to api_usage_logs.

    Uses its own DB session so callers don't need to thread one through.
    Returns the OpenAI ChatCompletion object unchanged.
    """
    await _check_monthly_limit()

    start = time.monotonic()
    success = True
    error_msg = None
    response = None

    try:
        response = await client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=messages,
        )
        return response
    except Exception as exc:
        success = False
        error_msg = str(exc)[:500]
        raise
    finally:
        duration_ms = int((time.monotonic() - start) * 1000)
        input_tokens = response.usage.prompt_tokens if response else 0
        output_tokens = response.usage.completion_tokens if response else 0

        await _log_usage(
            generator=generator,
            provider="openai",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            prospect_id=prospect_id,
            duration_ms=duration_ms,
            success=success,
            error_msg=error_msg,
        )
