import asyncio
from datetime import UTC, datetime
from uuid import UUID

import httpx

from app.api.routes import support_predictions as support_prediction_routes
from app.main import app
from app.schemas.support_predictions import StoredSupportPrediction

STUDENT_ID = "11111111-1111-4111-8111-111111111111"
SECOND_STUDENT_ID = "22222222-2222-4222-8222-222222222222"
CLASS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def request(
    method: str,
    path: str,
    json: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, path, json=json, headers=headers)

    return asyncio.run(send())


def student_payload(
    student_id: str = STUDENT_ID,
    scores: list[float] | None = None,
    attendance_rate: float = 0.90,
    engagement_rate: float = 0.80,
) -> dict[str, object]:
    return {
        "student_id": student_id,
        "scores": scores or [70, 80],
        "attendance_rate": attendance_rate,
        "engagement_rate": engagement_rate,
    }


def test_health_endpoint() -> None:
    response = request("GET", "/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "Mathia AI Service",
        "version": "0.1.0",
        "environment": "development",
    }


def test_support_prediction_requires_directus_authentication() -> None:
    response = request("POST", f"/predict/student/{STUDENT_ID}/support")

    assert response.status_code == 401


def test_support_prediction_runs_only_after_relational_authorization(monkeypatch) -> None:
    school_id = UUID("33333333-3333-4333-8333-333333333333")

    async def verify_token(_directus_url: str, token: str) -> dict[str, str]:
        assert token == "valid-token"
        return {"id": "44444444-4444-4444-8444-444444444444"}

    def authorize(_database_url: str, _user_id: UUID, student_id: UUID) -> UUID:
        assert student_id == UUID(STUDENT_ID)
        return school_id

    def predict(
        _database_url: str,
        _model_path: str,
        student_id: UUID,
        authorized_school_id: UUID,
    ) -> StoredSupportPrediction:
        assert authorized_school_id == school_id
        now = datetime.now(UTC)
        return StoredSupportPrediction(
            id=UUID("55555555-5555-4555-8555-555555555555"),
            school_id=school_id,
            student_id=student_id,
            suggests_educational_support=False,
            status="no_support_signal",
            attention_index=0.5,
            applied_threshold=0.66,
            model_name="mathia_pu",
            model_version="schema-v4-test",
            model_route="con_tiempos",
            evidence_level="standard",
            total_responses=100,
            valid_response_times=95,
            warnings=["prediction_is_not_a_diagnosis"],
            generated_at=now,
            created_at=now,
        )

    monkeypatch.setattr(support_prediction_routes, "verify_auth_token", verify_token)
    monkeypatch.setattr(
        support_prediction_routes,
        "resolve_support_prediction_school",
        authorize,
    )
    monkeypatch.setattr(
        support_prediction_routes,
        "predict_and_store_student_support",
        predict,
    )

    response = request(
        "POST",
        f"/predict/student/{STUDENT_ID}/support",
        headers={"Authorization": "Bearer valid-token"},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "no_support_signal"
    assert response.json()["student_id"] == STUDENT_ID


def test_student_prediction_is_deterministic() -> None:
    response = request("POST", "/predict/student", json=student_payload())

    assert response.status_code == 200
    body = response.json()
    assert UUID(body["student_id"]) == UUID(STUDENT_ID)
    assert body["composite_score"] == 78.0
    assert body["risk_level"] == "low"
    assert body["confidence"] == 0.72
    assert body["signals"] == {
        "academic_average": 75.0,
        "attendance_rate": 0.9,
        "engagement_rate": 0.8,
        "sex": None,
    }
    assert body["model_version"] == "deterministic-baseline-v1"


def test_student_prediction_with_sex() -> None:
    payload = student_payload()
    payload["sex"] = "female"

    response = request("POST", "/predict/student", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["signals"]["sex"] == "female"


def test_student_prediction_rejects_invalid_sex() -> None:
    payload = student_payload()
    payload["sex"] = "invalid_sex"

    response = request("POST", "/predict/student", json=payload)

    assert response.status_code == 422
    error_locations = [error["loc"] for error in response.json()["detail"]]
    assert ["body", "sex"] in error_locations


def test_student_prediction_rejects_invalid_scores_and_unknown_fields() -> None:
    payload = student_payload(scores=[101])
    payload["unexpected"] = True

    response = request("POST", "/predict/student", json=payload)

    assert response.status_code == 422
    error_locations = [error["loc"] for error in response.json()["detail"]]
    assert ["body", "scores", 0] in error_locations
    assert ["body", "unexpected"] in error_locations


def test_class_prediction_aggregates_student_results() -> None:
    payload = {
        "class_id": CLASS_ID,
        "students": [
            student_payload(scores=[90], attendance_rate=1, engagement_rate=1),
            student_payload(
                student_id=SECOND_STUDENT_ID,
                scores=[30],
                attendance_rate=0.5,
                engagement_rate=0.5,
            ),
        ],
    }

    response = request("POST", "/predict/class", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["composite_score"] == 64.5
    assert body["risk_level"] == "moderate"
    assert body["risk_distribution"] == {
        "high": 1,
        "moderate": 0,
        "low": 0,
        "minimal": 1,
    }
    assert body["priority_student_ids"] == [SECOND_STUDENT_ID]


def test_class_prediction_rejects_duplicate_student_ids() -> None:
    response = request(
        "POST",
        "/predict/class",
        json={
            "class_id": CLASS_ID,
            "students": [student_payload(), student_payload()],
        },
    )

    assert response.status_code == 422
    assert "student IDs must be unique" in response.text


def test_student_report_uses_prediction_without_recalculating_it() -> None:
    prediction = request("POST", "/predict/student", json=student_payload()).json()

    response = request(
        "POST",
        "/report/student",
        json={"student_name": "Alex", "prediction": prediction, "locale": "en"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["student_id"] == STUDENT_ID
    assert "78.0/100" in body["summary"]
    assert body["strengths"]
    assert body["recommendations"]
    assert body["requires_professional_review"] is True


def test_class_report_summarizes_priority_students() -> None:
    prediction = request(
        "POST",
        "/predict/class",
        json={
            "class_id": CLASS_ID,
            "students": [
                student_payload(scores=[90], attendance_rate=1, engagement_rate=1),
                student_payload(
                    student_id=SECOND_STUDENT_ID,
                    scores=[30],
                    attendance_rate=0.5,
                    engagement_rate=0.5,
                ),
            ],
        },
    ).json()

    response = request(
        "POST",
        "/report/class",
        json={"class_name": "Class A", "prediction": prediction, "locale": "en"},
    )

    assert response.status_code == 200
    body = response.json()
    assert "2 assessed student(s)" in body["summary"]
    assert "1 currently require" in body["summary"]
    assert body["priorities"]
    assert body["requires_professional_review"] is True
