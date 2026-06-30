import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict


class RoleEnum(str, Enum):
    admin = "admin"
    commercial = "commercial"


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    must_change_password: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(BaseModel):
    email: str
    full_name: str


class UserCreateResponse(BaseModel):
    user: UserOut
    temporary_password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ResetPasswordResponse(BaseModel):
    temporary_password: str
