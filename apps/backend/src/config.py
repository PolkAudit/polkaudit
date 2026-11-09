from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings

from src.db_url import normalize_async_database_url


class Settings(BaseSettings):
    DATABASE_URL: str = Field(..., env="DATABASE_URL")
    API_KEY: str = Field(..., env="API_KEY")
    # JWT signing secret — prefer dedicated key; falls back to API_KEY if unset
    SECRET_KEY: Optional[str] = Field(None, env="SECRET_KEY")
    LOG_LEVEL: str = Field("INFO", env="LOG_LEVEL")

    # Public app URL for magic links
    APP_PUBLIC_URL: str = Field("https://console.polkaudit.xyz", env="APP_PUBLIC_URL")
    API_PUBLIC_URL: str = Field("https://api.polkaudit.xyz", env="API_PUBLIC_URL")

    # Optional SMTP — if unset, magic links are logged only
    SMTP_HOST: Optional[str] = Field(None, env="SMTP_HOST")
    SMTP_PORT: int = Field(587, env="SMTP_PORT")
    SMTP_USER: Optional[str] = Field(None, env="SMTP_USER")
    SMTP_PASSWORD: Optional[str] = Field(None, env="SMTP_PASSWORD")
    SMTP_FROM: str = Field("PolkAudit <noreply@polkaudit.xyz>", env="SMTP_FROM")
    SMTP_USE_TLS: bool = Field(True, env="SMTP_USE_TLS")

    # Optional Razorpay — if unset, checkout returns manual contact mode
    RAZORPAY_KEY_ID: Optional[str] = Field(None, env="RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET: Optional[str] = Field(None, env="RAZORPAY_KEY_SECRET")
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = Field(None, env="RAZORPAY_WEBHOOK_SECRET")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def async_database_url(self) -> str:
        return normalize_async_database_url(self.DATABASE_URL)

    @property
    def razorpay_enabled(self) -> bool:
        return bool(self.RAZORPAY_KEY_ID and self.RAZORPAY_KEY_SECRET)

    @property
    def jwt_secret(self) -> str:
        return (self.SECRET_KEY or self.API_KEY or "").strip() or "dev-insecure-secret"


settings = Settings()
