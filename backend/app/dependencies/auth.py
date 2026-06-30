import uuid

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.prospect import Prospect
from app.models.user import User
from app.services import auth_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_session),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié.")
    try:
        payload = auth_service.decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide.")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable ou inactif.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")
    return user


async def require_own_prospect(
    prospect_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
) -> Prospect:
    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")
    if user.role == "commercial" and prospect.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Vous n'avez pas accès à ce prospect.")
    return prospect
