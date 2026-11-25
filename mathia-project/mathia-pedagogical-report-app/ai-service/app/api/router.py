from fastapi import APIRouter

from app.api.routes import (
    evaluations,
    health,
    predictions,
    question_generation,
    report_documents,
    reports,
    resource_generation,
    support_predictions,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(predictions.router)
api_router.include_router(reports.router)
api_router.include_router(evaluations.router)
api_router.include_router(support_predictions.router)
api_router.include_router(report_documents.router)
api_router.include_router(question_generation.router)
api_router.include_router(resource_generation.router)
