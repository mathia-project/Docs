from typing import Literal

from app.schemas.base import ApiModel


class HealthResponse(ApiModel):
    status: Literal["ok"]
    service: str
    version: str
    environment: str
