from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.schemas.support_predictions import SupportPredictionToStore
from app.services import support_prediction_store


def result(**overrides: object) -> SupportPredictionToStore:
    values: dict[str, object] = {
        "school_id": uuid4(),
        "student_id": uuid4(),
        "suggests_educational_support": True,
        "status": "support_suggested",
        "attention_index": 0.75,
        "applied_threshold": 0.66,
        "model_name": "mathia_pu",
        "model_version": "schema-v4",
        "model_route": "con_tiempos",
        "evidence_level": "standard",
        "total_responses": 100,
        "valid_response_times": 96,
        "warnings": ["attention_index_is_not_a_diagnostic_probability"],
        "generated_at": datetime.now(UTC),
    }
    values.update(overrides)
    return SupportPredictionToStore.model_validate(values)


@pytest.mark.parametrize(
    ("decision", "status"),
    [
        (True, "support_suggested"),
        (False, "no_support_signal"),
        (None, "insufficient_information"),
        (None, "diagnosis_recorded"),
    ],
)
def test_decision_has_an_unambiguous_status(decision: bool | None, status: str) -> None:
    score_fields: dict[str, object]
    if decision is None:
        score_fields = {
            "attention_index": None,
            "applied_threshold": None,
        }
        if status == "insufficient_information":
            score_fields["evidence_level"] = "insufficient"
    else:
        score_fields = {}

    stored = result(suggests_educational_support=decision, status=status, **score_fields)

    assert stored.suggests_educational_support is decision


def test_diagnosis_can_stop_prediction_with_standard_response_evidence() -> None:
    stored = result(
        suggests_educational_support=None,
        status="diagnosis_recorded",
        attention_index=None,
        applied_threshold=None,
    )

    assert stored.evidence_level == "standard"


def test_index_and_threshold_are_required_together() -> None:
    with pytest.raises(ValidationError, match="must be provided together"):
        result(applied_threshold=None)


def test_no_decision_cannot_keep_model_scores() -> None:
    with pytest.raises(ValidationError, match="required only"):
        result(
            suggests_educational_support=None,
            status="insufficient_information",
            evidence_level="insufficient",
        )


def test_insufficient_evidence_cannot_produce_a_decision() -> None:
    with pytest.raises(ValidationError, match="insufficient evidence"):
        result(evidence_level="insufficient")


def test_valid_times_cannot_exceed_responses() -> None:
    with pytest.raises(ValidationError, match="cannot exceed"):
        result(total_responses=40, valid_response_times=41)


@pytest.mark.parametrize("value", [-0.01, 1.01, float("nan"), float("inf")])
def test_scores_must_be_finite_unit_interval(value: float) -> None:
    with pytest.raises(ValidationError):
        result(attention_index=value)


def test_identifiers_remain_uuid_values() -> None:
    prediction = result()

    assert isinstance(prediction.school_id, UUID)
    assert isinstance(prediction.student_id, UUID)


class FakeCursor:
    def __init__(self, stored: dict[str, object] | None) -> None:
        self.stored = stored
        self.query = ""
        self.parameters: dict[str, object] = {}

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, parameters: dict[str, object]) -> None:
        self.query = query
        self.parameters = parameters

    def fetchone(self) -> dict[str, object] | None:
        return self.stored


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self.fake_cursor = cursor

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self.fake_cursor


def test_store_inserts_an_append_only_student_scoped_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prediction = result()
    stored_values = prediction.model_dump()
    stored_values.update({"id": uuid4(), "created_at": datetime.now(UTC)})
    cursor = FakeCursor(stored_values)
    connection = FakeConnection(cursor)
    monkeypatch.setattr(
        support_prediction_store.psycopg,
        "connect",
        lambda *_args, **_kwargs: connection,
    )

    stored = support_prediction_store.save_support_prediction("postgresql://test", prediction)

    assert stored.student_id == prediction.student_id
    assert "INSERT INTO student_support_predictions" in cursor.query
    assert "FROM student_profiles" in cursor.query
    assert "UPDATE" not in cursor.query


def test_store_rejects_a_student_outside_the_school(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor(None)
    connection = FakeConnection(cursor)
    monkeypatch.setattr(
        support_prediction_store.psycopg,
        "connect",
        lambda *_args, **_kwargs: connection,
    )

    with pytest.raises(ValueError, match="No existe el alumno"):
        support_prediction_store.save_support_prediction("postgresql://test", result())
