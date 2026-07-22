from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:anas@localhost:5432/bab_morocco"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    DEFAULT_AI_PROVIDER: str = "claude"
    DEFAULT_CLAUDE_MODEL: str = "claude-sonnet-4-6"
    DEFAULT_OPENAI_MODEL: str = "gpt-4o"
    GOOGLE_MAPS_API_KEY: str = ""
    APIFY_API_TOKEN: str = ""
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "onboarding@resend.dev"
    RESEND_INBOUND_DOMAIN: str = ""
    RESEND_WEBHOOK_SECRET: str = ""
    YOUSIGN_API_KEY: str = ""
    YOUSIGN_SANDBOX: bool = True
    YOUSIGN_WEBHOOK_SECRET: str = ""
    YOUSIGN_SIGNER_EMAIL: str = ""
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

MODEL_OPTIONS = {
    "claude": [
        {"id": "claude-sonnet-4-6", "label": "Sonnet 4.6", "tier": "standard"},
        {"id": "claude-sonnet-5", "label": "Sonnet 5", "tier": "standard"},
        {"id": "claude-opus-4-8", "label": "Opus 4.8", "tier": "premium"},
        {"id": "claude-haiku-4-5-20251001", "label": "Haiku 4.5", "tier": "budget", "contract_warning": True},
    ],
    "openai": [
        {"id": "gpt-4o", "label": "GPT-4o", "tier": "standard"},
        {"id": "gpt-4o-mini", "label": "GPT-4o Mini", "tier": "budget", "contract_warning": True},
    ],
}
