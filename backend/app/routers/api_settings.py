from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query
from sqlalchemy import case, cast, func, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import MODEL_OPTIONS, settings as app_settings
from app.database import get_session
from app.dependencies.auth import require_admin
from app.models.api_usage import ApiUsageLog
from app.models.system_settings import SystemSetting
from app.models.user import User

router = APIRouter(prefix="/api-settings", tags=["api-settings"])

# Settings manageable via GET/PUT below (allow-list — prevents arbitrary key writes)
MANAGEABLE_SETTINGS = {"monthly_token_limit", "default_ai_provider", "default_claude_model", "default_openai_model"}

# API keys manageable via the UI (allow-list)
MANAGEABLE_KEYS = {
    "anthropic_api_key": {
        "label": "Claude AI (Anthropic)",
        "config_attr": "ANTHROPIC_API_KEY",
        "group": "Intelligence Artificielle",
    },
    "openai_api_key": {
        "label": "OpenAI (GPT-4o)",
        "config_attr": "OPENAI_API_KEY",
        "group": "Intelligence Artificielle",
    },
    "resend_api_key": {
        "label": "Clé API",
        "config_attr": "RESEND_API_KEY",
        "group": "Resend (Email)",
    },
    "resend_from_email": {
        "label": "Adresse expéditeur",
        "config_attr": "RESEND_FROM_EMAIL",
        "secret": False,
        "group": "Resend (Email)",
    },
    "resend_inbound_domain": {
        "label": "Domaine entrant",
        "config_attr": "RESEND_INBOUND_DOMAIN",
        "secret": False,
        "group": "Resend (Email)",
    },
    "resend_webhook_secret": {
        "label": "Secret webhook",
        "config_attr": "RESEND_WEBHOOK_SECRET",
        "group": "Resend (Email)",
    },
    "google_maps_api_key": {
        "label": "Google Maps / Places",
        "config_attr": "GOOGLE_MAPS_API_KEY",
        "group": "Google Maps / Places",
    },
    "yousign_api_key": {
        "label": "Clé API",
        "config_attr": "YOUSIGN_API_KEY",
        "group": "Yousign (Signature électronique)",
    },
    "yousign_sandbox": {
        "label": "Mode Sandbox (true/false)",
        "config_attr": "YOUSIGN_SANDBOX",
        "secret": False,
        "group": "Yousign (Signature électronique)",
        "cast": "bool",
    },
    "yousign_webhook_secret": {
        "label": "Secret webhook",
        "config_attr": "YOUSIGN_WEBHOOK_SECRET",
        "group": "Yousign (Signature électronique)",
    },
    "yousign_signer_email": {
        "label": "Email signataire Bab Morocco",
        "config_attr": "YOUSIGN_SIGNER_EMAIL",
        "secret": False,
        "group": "Yousign (Signature électronique)",
    },
}


def _coerce(value: str, cast: str | None) -> object:
    if cast == "bool":
        return value.strip().lower() in ("true", "1", "yes")
    return value


def _mask_key(value: str) -> str:
    if not value or len(value) < 10:
        return "***" if value else ""
    return value[:6] + "..." + value[-4:]


def _period_range(period: str) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, now


@router.get("/usage")
async def get_usage(
    period: str = Query("month", pattern="^(today|week|month)$"),
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    start, end = _period_range(period)

    base = select(ApiUsageLog).where(ApiUsageLog.timestamp >= start, ApiUsageLog.timestamp <= end)

    # Totals
    totals = await db.execute(
        select(
            func.count(ApiUsageLog.id).label("total_calls"),
            func.coalesce(func.sum(ApiUsageLog.input_tokens), 0).label("total_input_tokens"),
            func.coalesce(func.sum(ApiUsageLog.output_tokens), 0).label("total_output_tokens"),
            func.coalesce(func.sum(ApiUsageLog.total_tokens), 0).label("total_tokens"),
            func.sum(case((ApiUsageLog.success == False, 1), else_=0)).label("failed_calls"),  # noqa: E712
        ).where(ApiUsageLog.timestamp >= start, ApiUsageLog.timestamp <= end)
    )
    row = totals.one()

    # By generator
    by_gen_rows = await db.execute(
        select(
            ApiUsageLog.generator,
            func.count(ApiUsageLog.id).label("calls"),
            func.coalesce(func.sum(ApiUsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(ApiUsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(ApiUsageLog.total_tokens), 0).label("total_tokens"),
        )
        .where(ApiUsageLog.timestamp >= start, ApiUsageLog.timestamp <= end)
        .group_by(ApiUsageLog.generator)
    )
    by_generator = {}
    for g in by_gen_rows.all():
        by_generator[g.generator] = {
            "calls": g.calls,
            "input_tokens": g.input_tokens,
            "output_tokens": g.output_tokens,
            "total_tokens": g.total_tokens,
        }

    # Daily breakdown
    date_expr = cast(func.date(ApiUsageLog.timestamp), String)
    daily_rows = await db.execute(
        select(
            date_expr.label("date"),
            func.count(ApiUsageLog.id).label("calls"),
            func.coalesce(func.sum(ApiUsageLog.total_tokens), 0).label("total_tokens"),
        )
        .where(ApiUsageLog.timestamp >= start, ApiUsageLog.timestamp <= end)
        .group_by(date_expr)
        .order_by(date_expr)
    )
    daily_breakdown = [
        {"date": d.date, "calls": d.calls, "total_tokens": d.total_tokens}
        for d in daily_rows.all()
    ]

    # By provider
    by_provider_rows = await db.execute(
        select(
            ApiUsageLog.provider,
            func.count(ApiUsageLog.id).label("calls"),
            func.coalesce(func.sum(ApiUsageLog.total_tokens), 0).label("total_tokens"),
        )
        .where(ApiUsageLog.timestamp >= start, ApiUsageLog.timestamp <= end)
        .group_by(ApiUsageLog.provider)
    )
    by_provider = {
        p.provider: {"calls": p.calls, "total_tokens": p.total_tokens}
        for p in by_provider_rows.all()
    }

    # By model (nested under provider)
    by_model_rows = await db.execute(
        select(
            ApiUsageLog.provider,
            ApiUsageLog.model,
            func.count(ApiUsageLog.id).label("calls"),
            func.coalesce(func.sum(ApiUsageLog.total_tokens), 0).label("total_tokens"),
        )
        .where(ApiUsageLog.timestamp >= start, ApiUsageLog.timestamp <= end)
        .group_by(ApiUsageLog.provider, ApiUsageLog.model)
    )
    by_model: dict[str, list] = {}
    for m in by_model_rows.all():
        by_model.setdefault(m.provider, []).append({
            "model": m.model,
            "calls": m.calls,
            "total_tokens": m.total_tokens,
        })

    return {
        "period": period,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "total_tokens": row.total_tokens,
        "total_input_tokens": row.total_input_tokens,
        "total_output_tokens": row.total_output_tokens,
        "total_calls": row.total_calls,
        "failed_calls": row.failed_calls or 0,
        "by_generator": by_generator,
        "by_provider": by_provider,
        "by_model": by_model,
        "daily_breakdown": daily_breakdown,
    }


@router.get("/models")
async def get_models(_admin: User = Depends(require_admin)):
    return MODEL_OPTIONS


@router.get("/settings")
async def get_settings(
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> dict[str, str]:
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    return {row.key: row.value for row in rows if row.key in MANAGEABLE_SETTINGS}


@router.put("/settings")
async def update_settings(
    data: dict[str, object] = Body(...),
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> dict[str, str]:
    for key, value in data.items():
        if key not in MANAGEABLE_SETTINGS:
            continue
        str_value = str(value)
        existing = (
            await db.execute(select(SystemSetting).where(SystemSetting.key == key))
        ).scalar_one_or_none()
        if existing:
            existing.value = str_value
            existing.updated_at = datetime.utcnow()
        else:
            db.add(SystemSetting(key=key, value=str_value, updated_at=datetime.utcnow()))
        if key == "default_ai_provider" and str_value in ("claude", "openai"):
            app_settings.DEFAULT_AI_PROVIDER = str_value
        if key == "default_claude_model":
            app_settings.DEFAULT_CLAUDE_MODEL = str_value
        if key == "default_openai_model":
            app_settings.DEFAULT_OPENAI_MODEL = str_value
    await db.commit()

    rows = (await db.execute(select(SystemSetting))).scalars().all()
    return {row.key: row.value for row in rows if row.key in MANAGEABLE_SETTINGS}


# ─── API Key management ─────────────────────────────────────────────────────


def _display_value(value: str, is_secret: bool) -> str:
    if is_secret:
        return _mask_key(value)
    return value


def _key_info(key_name: str, db_value: str | None) -> dict:
    meta = MANAGEABLE_KEYS[key_name]
    is_secret = meta.get("secret", True)
    group = meta.get("group", "")
    raw_env_value = getattr(app_settings, meta["config_attr"], "")
    env_value = str(raw_env_value) if raw_env_value not in (None, "") else ""

    input_type = "bool" if meta.get("cast") == "bool" else "text"
    base = {"key": key_name, "label": meta["label"], "group": group, "secret": is_secret, "input_type": input_type}

    if db_value:
        return {**base, "masked_value": _display_value(db_value, is_secret), "is_set": True, "source": "database"}
    elif env_value:
        return {**base, "masked_value": _display_value(env_value, is_secret), "is_set": True, "source": "env_file"}
    else:
        return {**base, "masked_value": "", "is_set": False, "source": "not_set"}


@router.get("/keys")
async def get_keys(
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    rows = (await db.execute(select(SystemSetting))).scalars().all()
    db_map = {row.key: row.value for row in rows if row.key in MANAGEABLE_KEYS}

    keys = []
    for key_name in MANAGEABLE_KEYS:
        keys.append(_key_info(key_name, db_map.get(key_name)))
    return {"keys": keys}


@router.put("/keys/{key_name}")
async def update_key(
    key_name: str = Path(...),
    body: dict = Body(...),
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    if key_name not in MANAGEABLE_KEYS:
        raise HTTPException(404, f"Unknown key: {key_name}")

    value = (body.get("value") or "").strip()
    if not value:
        raise HTTPException(400, "Value cannot be empty. Use DELETE to remove a key.")

    existing = (
        await db.execute(select(SystemSetting).where(SystemSetting.key == key_name))
    ).scalar_one_or_none()
    if existing:
        existing.value = value
        existing.updated_at = datetime.utcnow()
    else:
        db.add(SystemSetting(key=key_name, value=value, updated_at=datetime.utcnow()))
    await db.commit()

    meta = MANAGEABLE_KEYS[key_name]
    setattr(app_settings, meta["config_attr"], _coerce(value, meta.get("cast")))

    return _key_info(key_name, value)


@router.delete("/keys/{key_name}")
async def delete_key(
    key_name: str = Path(...),
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    if key_name not in MANAGEABLE_KEYS:
        raise HTTPException(404, f"Unknown key: {key_name}")

    existing = (
        await db.execute(select(SystemSetting).where(SystemSetting.key == key_name))
    ).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()

    import os
    meta = MANAGEABLE_KEYS[key_name]
    env_value = os.environ.get(meta["config_attr"], "")
    if env_value:
        setattr(app_settings, meta["config_attr"], _coerce(env_value, meta.get("cast")))
    else:
        default = type(app_settings).model_fields[meta["config_attr"]].default
        setattr(app_settings, meta["config_attr"], default)

    return _key_info(key_name, None)
