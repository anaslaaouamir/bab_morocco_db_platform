from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:anas@localhost:5432/bab_morocco"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    DEFAULT_AI_PROVIDER: str = "claude"
    GOOGLE_MAPS_API_KEY: str = ""
    APIFY_API_TOKEN: str = ""
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "onboarding@resend.dev"
    RESEND_INBOUND_DOMAIN: str = ""
    RESEND_WEBHOOK_SECRET: str = ""
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
