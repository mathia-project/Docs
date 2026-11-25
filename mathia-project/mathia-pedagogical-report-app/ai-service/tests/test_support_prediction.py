from datetime import UTC, datetime
from uuid import uuid4

from app.services.support_history import (
    StudentModelProfile,
    build_model_response_history,
)
from app.services.support_prediction import (
    build_support_prediction,
    load_support_artifact,
)


def answered_rows(count: int, *, sex: str | None = "male", diagnosis: bool = False):
    profile = StudentModelProfile(str(uuid4()), "ES", sex, diagnosis)
    records = [
        {
            "course_id": "grade-7",
            "difficulty": "medium",
            "category_id": "A",
            "answered_at": datetime.now(UTC),
            "is_correct": index % 3 != 0,
            "active_duration_ms": 20_000 + index,
        }
        for index in range(count)
    ]
    return build_model_response_history(profile, records)


def artifact_metadata() -> dict[str, object]:
    return {"schema_version": 4, "input_hash": "abcdef1234567890"}


def test_existing_diagnosis_is_preserved_without_prediction() -> None:
    history = answered_rows(100, diagnosis=True)

    prediction = build_support_prediction(history, artifact_metadata(), uuid4())

    assert prediction.suggests_educational_support is None
    assert prediction.status == "diagnosis_recorded"
    assert prediction.model_route == "sin_prediccion_diagnostico"
    assert "prediction_skipped_existing_diagnosis" in prediction.warnings


def test_less_than_30_supported_responses_is_not_predicted() -> None:
    history = answered_rows(29)

    prediction = build_support_prediction(history, artifact_metadata(), uuid4())

    assert prediction.suggests_educational_support is None
    assert prediction.status == "insufficient_information"
    assert prediction.total_responses == 29
    assert prediction.attention_index is None


def test_missing_binary_sex_is_not_inferred() -> None:
    history = answered_rows(90, sex="other")

    prediction = build_support_prediction(history, artifact_metadata(), uuid4())

    assert prediction.suggests_educational_support is None
    assert prediction.model_route == "sin_prediccion_sexo_no_disponible"
    assert "required_sex_not_available" in prediction.warnings


def test_trusted_artifact_produces_auditable_prediction() -> None:
    history = answered_rows(30)
    artifact = load_support_artifact("modelo_integrado/modelo_pu.joblib")

    prediction = build_support_prediction(history, artifact, uuid4())

    assert prediction.suggests_educational_support in {True, False}
    assert prediction.status in {"support_suggested", "no_support_signal"}
    assert prediction.attention_index is not None
    assert prediction.applied_threshold is not None
    assert prediction.model_route in {"con_tiempos", "sin_tiempos"}
    assert prediction.model_version.startswith("schema-v4-")
    assert prediction.total_responses == 30
    assert prediction.valid_response_times == 30
    assert "threshold_is_provisional" in prediction.warnings
