from pydantic import Field
from pydantic_settings import BaseSettings

from .db_url import normalize_async_database_url


class Settings(BaseSettings):
    # Public Polkadot RPC — replace with your own endpoint for production indexing
    SUBSTRATE_RPC_URL: str = Field(
        default="wss://rpc.polkadot.io",
        env="SUBSTRATE_RPC_URL",
    )
    DATABASE_URL: str = Field(..., env="DATABASE_URL")
    LOG_LEVEL: str = Field("INFO", env="LOG_LEVEL")

    # Retry configuration
    MAX_RETRIES: int = Field(5, env="MAX_RETRIES")
    RETRY_DELAY_SECONDS: int = Field(2, env="RETRY_DELAY_SECONDS")
    METRICS_PORT: int = Field(8001, env="METRICS_PORT")

    # Jump to this block when DB is behind (0 = disabled). Use ~recent Polkadot height for demos.
    INDEXER_START_BLOCK: int = Field(0, env="INDEXER_START_BLOCK")
    # Stop indexing after this height (0 = disabled / follow tip)
    INDEXER_END_BLOCK: int = Field(0, env="INDEXER_END_BLOCK")
    # When DB is empty, start this many blocks behind finalized head
    INDEXER_CATCHUP_WINDOW: int = Field(2000, env="INDEXER_CATCHUP_WINDOW")
    # Fail the block (no ProcessedBlock) if System.Events cannot be fetched
    INDEXER_REQUIRE_EVENTS: bool = Field(True, env="INDEXER_REQUIRE_EVENTS")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def async_database_url(self) -> str:
        return normalize_async_database_url(self.DATABASE_URL)

    @property
    def http_port(self) -> int:
        """Cloud Run sets PORT; local dev uses METRICS_PORT."""
        import os

        if os.environ.get("PORT"):
            return int(os.environ["PORT"])
        return self.METRICS_PORT


settings = Settings()
