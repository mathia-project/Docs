from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Strict base model shared by all public API contracts."""

    model_config = ConfigDict(extra="forbid")
