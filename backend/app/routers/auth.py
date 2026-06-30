import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserCreateResponse,
    UserOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_session)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not auth_service.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    token = auth_service.create_access_token(user)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/users", response_model=UserCreateResponse, status_code=201)
async def create_commercial_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    temporary_password = secrets.token_urlsafe(10)
    user = User(
        email=data.email,
        hashed_password=auth_service.hash_password(temporary_password),
        full_name=data.full_name,
        role="commercial",
        is_active=True,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un utilisateur avec cet email existe déjà.")
    await db.refresh(user)
    return UserCreateResponse(user=UserOut.model_validate(user), temporary_password=temporary_password)


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()
