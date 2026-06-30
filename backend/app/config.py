from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./bab_morocco.db"
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_MAPS_API_KEY: str = ""
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""
    ENV: str = "development"
    SECRET_KEY: str = "changeme"
    APP_VERSION: str = "1.0.0"

    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
