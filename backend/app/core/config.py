from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    telegram_bot_token: str

    # Домен фронтенда на Vercel, напр. "https://omnicap.vercel.app".
    # Список через запятую, если нужно разрешить несколько (prod + preview).
    allowed_origins_raw: str = "http://localhost:3000"

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str  # тот же секрет, что в Supabase Auth settings

    anthropic_api_key: str
    claude_vision_model: str = "claude-sonnet-5"

    # KEK для envelope encryption. В проде — ключ из KMS/Vault, не из .env.
    master_kek_b64: str

    internal_cron_secret: str

    access_token_ttl_seconds: int = 3600
    screenshot_job_ttl_hours: int = 24
    max_screenshot_size_mb: int = 8

    class Config:
        env_file = ".env"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins_raw.split(",") if origin.strip()]


settings = Settings()
