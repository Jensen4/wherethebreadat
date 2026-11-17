from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    database_url: str
    migration_database_url: str | None = None
    secret_key: SecretStr = Field(validation_alias=AliasChoices("SECRET_KEY", "JWT_SECRET"))
    environment: Literal["development", "production"] = "development"
    session_minutes: int = Field(default=60, ge=1, le=1440)
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("secret_key")
    @classmethod
    def validate_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if len(secret) < 32 or secret.startswith("replace-with"):
            raise ValueError("Set SECRET_KEY to a random secret of at least 32 characters")
        return value

    @model_validator(mode="after")
    def production_settings(self):
        if self.environment == "production":
            url = make_url(self.database_url)
            if not url.drivername.startswith("postgresql"):
                raise ValueError("Production requires PostgreSQL")
            if url.username in {"bread", "bread_admin", "postgres"} or len(url.password or "") < 32:
                raise ValueError("Use a restricted database role and a strong production password")
            if not self.cors_origins or any(
                not origin.startswith("https://") or "*" in origin for origin in self.cors_origins
            ):
                raise ValueError("Production CORS_ORIGINS must contain explicit HTTPS origins")
        return self

    @property
    def secure_cookies(self) -> bool:
        return self.environment == "production"

    @property
    def session_cookie_name(self) -> str:
        return "__Host-bread_session" if self.secure_cookies else "bread_session"


@lru_cache
def get_settings() -> Settings:
    return Settings()
