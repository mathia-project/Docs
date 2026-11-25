import os
from dataclasses import dataclass
from functools import lru_cache


def _read_origins(raw_origins: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str
    app_version: str
    environment: str
    cors_origins: tuple[str, ...]
    database_url: str
    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_host: str
    postgres_port: int
    directus_url: str
    support_model_path: str
    ai_structured_provider: str
    google_cloud_project: str | None
    google_cloud_location: str
    google_genai_model: str
    ai_max_concurrency: int
    ai_timeout_seconds: float
    search_provider: str


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Mathia AI Service"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
        environment=os.getenv("ENVIRONMENT", "development"),
        cors_origins=_read_origins(os.getenv("AI_CORS_ORIGINS", "http://localhost:5173")),
        database_url=os.getenv(
            "DATABASE_URL",
            "postgresql://mathia:mathia-local-database-password@127.0.0.1:5432/mathia",
        ),
        postgres_db=os.getenv("POSTGRES_DB", "mathia"),
        postgres_user=os.getenv("POSTGRES_USER", "mathia"),
        postgres_password=os.getenv("POSTGRES_PASSWORD", "mathia-local-database-password"),
        postgres_host=os.getenv("POSTGRES_HOST", "database"),
        postgres_port=int(os.getenv("POSTGRES_PORT", "5432")),
        directus_url=os.getenv("DIRECTUS_URL", "http://127.0.0.1:8055"),
        support_model_path=os.getenv(
            "SUPPORT_MODEL_PATH",
            "modelo_integrado/modelo_pu.joblib",
        ),
        ai_structured_provider=os.getenv(
            "AI_STRUCTURED_PROVIDER",
            os.getenv("AI_PROVIDER", "mock"),
        ),
        google_cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
        google_cloud_location=os.getenv("GOOGLE_CLOUD_LOCATION", "eu"),
        google_genai_model=os.getenv(
            "VERTEX_AI_MODEL",
            os.getenv("GOOGLE_GENAI_MODEL", "gemini-3.1-flash-lite"),
        ),
        ai_max_concurrency=int(os.getenv("AI_MAX_CONCURRENCY", "5")),
        ai_timeout_seconds=float(os.getenv("AI_TIMEOUT_SECONDS", "30.0")),
        search_provider=os.getenv("AI_SEARCH_PROVIDER", os.getenv("SEARCH_PROVIDER", "disabled")),
    )
