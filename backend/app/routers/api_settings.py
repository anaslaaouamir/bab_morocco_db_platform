from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, cast, func, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import require_admin
from app.models.api_usage import ApiUsageLog
from app.models.user import User

router = APIRouter(prefix="/api-settings", tags=["api-settings"])


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
        "daily_breakdown": daily_breakdown,
    }
