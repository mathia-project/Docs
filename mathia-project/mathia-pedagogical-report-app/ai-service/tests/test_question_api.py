"""Tests for FastAPI AI questions endpoint."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes.question_generation import verify_authenticated_user
from app.main import app

client = TestClient(app)


def mock_auth_user():
    return {"id": "teacher-123", "email": "teacher@mathia.test", "role": "teacher"}


def test_generate_questions_unauthenticated():
    response = client.post(
        "/ai/questions/generate",
        json={
            "course_id": "grade-6",
            "domain_id": "6.RP",
            "cluster_id": "6.RP.A",
            "standard_id": "6.RP.A.1",
            "question_type": "single_choice",
            "difficulty": "medium",
            "quantity": 3,
        },
    )
    assert response.status_code == 401


def test_generate_questions_quantity_exceeded():
    app.dependency_overrides[verify_authenticated_user] = mock_auth_user
    try:
        response = client.post(
            "/ai/questions/generate",
            headers={"Authorization": "Bearer fake-token"},
            json={
                "course_id": "grade-6",
                "domain_id": "6.RP",
                "cluster_id": "6.RP.A",
                "standard_id": "6.RP.A.1",
                "question_type": "single_choice",
                "difficulty": "medium",
                "quantity": 30,  # exceeds max 25
            },
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(verify_authenticated_user, None)


@pytest.mark.parametrize("language", ["es", "it"])
def test_generate_questions_success_with_mock(language):
    app.dependency_overrides[verify_authenticated_user] = mock_auth_user

    mock_curr = {
        "course": {"id": "grade-6", "grade_level": 6},
        "domain": {"id": "6.RP", "code": "6.RP"},
        "cluster": {"id": "6.RP.A", "code": "6.RP.A"},
        "standard": {
            "id": "6.RP.A.1",
            "code": "6.RP.A.1",
            "ccss_id": "CCSS.MATH.CONTENT.6.RP.A.1",
            "description": {"es": "Razón y proporcionalidad"},
        },
        "substandard": None,
    }

    with patch("app.services.question_generator.validate_curriculum_route", return_value=mock_curr):
        response = client.post(
            "/ai/questions/generate",
            headers={"Authorization": "Bearer fake-token"},
            json={
                "course_id": "grade-6",
                "domain_id": "6.RP",
                "cluster_id": "6.RP.A",
                "standard_id": "6.RP.A.1",
                "question_type": "single_choice",
                "difficulty": "medium",
                "language": language,
                "quantity": 3,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["schema_version"] == "1.0"
        assert len(data["questions"]) == 3
        assert data["metadata"]["provider"] == "mock"
        assert data["questions"][0]["curriculum"]["standard_code"] == "6.RP.A.1"
        assert data["questions"][0]["question_type"] == "single_choice"
        assert data["questions"][0]["language"] == language
    
    app.dependency_overrides.pop(verify_authenticated_user, None)
