from datetime import UTC, datetime

import pytest

from app.services.support_history import (
    StudentModelProfile,
    build_model_response_history,
)


def record(
    *,
    course_id: str = "grade-7",
    difficulty: str = "medium",
    category_id: str = "A",
    answered: bool = True,
    correct: bool | None = True,
    duration: int = 25_000,
    answer_payload: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "course_id": course_id,
        "difficulty": difficulty,
        "category_id": category_id,
        "answered_at": datetime.now(UTC) if answered else None,
        "is_correct": correct,
        "active_duration_ms": duration,
        "answer_payload": answer_payload,
    }


def test_builds_model_rows_from_every_graded_attempt_question() -> None:
    profile = StudentModelProfile("student-1", "ES", "male", False)

    history = build_model_response_history(
        profile,
        [
            record(correct=False),
            record(course_id="grade-8", difficulty="easy", category_id="N"),
            record(correct=True),  # Repeated attempts are deliberately retained.
        ],
    )

    assert len(history.model_rows) == 3
    assert history.answered_questions == 3
    assert history.model_rows[0] == {
        "Identificador": "student-1",
        "Sexo(M=1)": 1,
        "Curso": 1,
        "Realizado": "S",
        "Correcto": "N",
        "Dificultad": "D2",
        "TipoEjercicio": "Algebra",
        "TiempoRespuesta": 25_000,
        "Diagnostico": "D0",
    }
    assert history.model_rows[1]["Curso"] == 2
    assert history.model_rows[1]["Dificultad"] == "D1"
    assert history.model_rows[1]["TipoEjercicio"] == "Numeros"


def test_unanswered_question_is_preserved_as_not_performed() -> None:
    profile = StudentModelProfile("student-1", "ES", "female", False)

    history = build_model_response_history(profile, [record(answered=False, correct=False)])

    assert history.answered_questions == 0
    assert history.model_rows[0] == {
        "Identificador": "student-1",
        "Sexo(M=1)": 0,
        "Curso": None,
        "Realizado": "N",
        "Correcto": None,
        "Dificultad": None,
        "TipoEjercicio": None,
        "TiempoRespuesta": None,
        "Diagnostico": "D0",
    }


def test_non_empty_answer_payload_counts_when_question_timestamp_was_not_synced() -> None:
    profile = StudentModelProfile("student-1", "ES", "female", False)

    history = build_model_response_history(
        profile,
        [record(answered=False, answer_payload={"selected_option_key": "A"})],
    )

    assert history.answered_questions == 1
    assert history.model_rows[0]["Realizado"] == "S"


def test_italian_course_mapping_and_registered_diagnosis_are_preserved() -> None:
    profile = StudentModelProfile("student-2", "IT", "female", True)

    history = build_model_response_history(
        profile,
        [record(course_id="grade-7", difficulty="hard", category_id="G")],
    )

    assert history.model_rows[0]["Curso"] == 2
    assert history.model_rows[0]["Dificultad"] == "D3"
    assert history.model_rows[0]["TipoEjercicio"] == "Geometria"
    assert history.model_rows[0]["Diagnostico"] == "S"


def test_answered_questions_from_unsupported_courses_are_excluded() -> None:
    profile = StudentModelProfile("student-1", "IT", "male", False)

    history = build_model_response_history(
        profile,
        [
            record(course_id="grade-9"),
            record(course_id="grade-8"),
        ],
    )

    assert history.excluded_answered_questions == 1
    assert history.answered_questions == 1
    assert history.model_rows[0]["Curso"] == 3


@pytest.mark.parametrize("category_id", ["", "X", "general"])
def test_answered_question_requires_a_known_curriculum_category(category_id: str) -> None:
    profile = StudentModelProfile("student-1", "ES", "male", False)

    with pytest.raises(ValueError, match="categoría curricular desconocida"):
        build_model_response_history(profile, [record(category_id=category_id)])


def test_answered_question_requires_authoritative_grading() -> None:
    profile = StudentModelProfile("student-1", "ES", "male", False)

    with pytest.raises(ValueError, match="debe indicar si es correcta"):
        build_model_response_history(profile, [record(correct=None)])


@pytest.mark.parametrize(
    ("sex", "expected"),
    [("male", 1), ("female", 0), ("other", None), (None, None)],
)
def test_sex_is_mapped_without_inference(sex: str | None, expected: int | None) -> None:
    profile = StudentModelProfile("student-1", "ES", sex, False)

    history = build_model_response_history(profile, [record()])

    assert history.model_rows[0]["Sexo(M=1)"] == expected


def test_history_exposes_evidence_for_supported_answer_count() -> None:
    profile = StudentModelProfile("student-1", "ES", "male", False)

    history = build_model_response_history(profile, [record()] * 30)

    assert history.answered_questions == 30
    assert history.evidence.level == "limited"
    assert history.evidence.can_predict is True
