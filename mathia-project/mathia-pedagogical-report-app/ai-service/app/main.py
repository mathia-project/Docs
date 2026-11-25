from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.providers.factory import close_structured_provider


@asynccontextmanager
async def lifespan(_application: FastAPI):
    yield
    await close_structured_provider()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
        description=(
            "Internal prediction and pedagogical-report service for Mathia. "
            "Includes deterministic baselines and the trusted PU educational-support model."
        ),
    )

    if settings.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

    application.include_router(api_router)
    return application


app = create_app()
