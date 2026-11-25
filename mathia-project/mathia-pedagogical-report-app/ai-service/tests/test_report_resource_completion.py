"""Regression coverage for valid provider documents that omit available resources."""

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.providers.base import StructuredGenerationResult
from app.schemas.report_generation import ResourceEvidence
from app.services.report_generator import (
    _build_fallback_document,
    generate_student_report_proposal,
)
from tests.test_report_flow import build_test_snapshot


@pytest.mark.parametrize("action_count", [0, 1, 20])
@pytest.mark.parametrize("resource_count", [0, 1, 5])
def test_provider_resource_omissions_are_completed(action_count, resource_count):
    snapshot = build_test_snapshot()
    snapshot.resources = [
        ResourceEvidence(
            resource_id=uuid4(), title=f"Practice {index}",
            domain_id="6.NS", target_level="reinforcement",
        )
        for index in range(resource_count)
    ]
    document = _build_fallback_document(snapshot)
    action = document.action_plan[0].model_copy(update={"resource_ids": []})
    document.action_plan = [action.model_copy(deep=True) for _ in range(action_count)]
    document.summary = "Provider narrative."
    provider = AsyncMock(provider_name="google_vertex", model_name="test-model")
    provider.generate_structured.return_value = StructuredGenerationResult(
        provider_name="google_vertex", model_name="test-model",
        data=document.model_dump(mode="json"),
    )
    with patch("app.services.report_generator.get_structured_provider", return_value=provider):
        result = asyncio.run(generate_student_report_proposal(snapshot))

    assert result.document.summary == "Provider narrative."
    assert result.metadata.provider == "google_vertex"
    # Empty provider plans receive a fallback action even when no resources exist.
    assert len(result.document.action_plan) == (action_count or 1)
    ids = [rid for action in result.document.action_plan for rid in action.resource_ids]
    assert ids == [resource.resource_id for resource in snapshot.resources[:3]]
    if action_count:
        assert result.document.action_plan[0].description == action.description


@pytest.mark.parametrize("authorized", [True, False])
def test_existing_resource_references_are_preserved_or_rejected(authorized):
    snapshot = build_test_snapshot()
    resource = ResourceEvidence(
        resource_id=uuid4(), title="Practice", domain_id="6.NS", target_level="reinforcement",
    )
    snapshot.resources = [resource]
    document = _build_fallback_document(snapshot)
    if not authorized:
        document.action_plan[0].resource_ids = [uuid4()]
    provider = AsyncMock(provider_name="google_vertex", model_name="test-model")
    provider.generate_structured.return_value = StructuredGenerationResult(
        provider_name="google_vertex", model_name="test-model",
        data=document.model_dump(mode="json"),
    )
    with patch("app.services.report_generator.get_structured_provider", return_value=provider):
        if authorized:
            result = asyncio.run(generate_student_report_proposal(snapshot))
            assert result.document == document
        else:
            with pytest.raises(ValueError, match="authorized snapshot"):
                asyncio.run(generate_student_report_proposal(snapshot))
