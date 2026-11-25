import pytest

from app.services.support_course import (
    INFORMATION_INSUFFICIENT,
    UNSUPPORTED_COURSE_MODEL,
    SupportedCourse,
    SupportedCourseDifficulty,
    UnsupportedCourse,
    resolve_course_difficulty,
    resolve_support_course,
)


@pytest.mark.parametrize(
    ("educational_system", "grade_level", "expected_course"),
    [
        ("ES", "grade-7", 1),
        ("ES", "grade-8", 2),
        ("ES", "grade-9", 3),
        ("ES", "grade-10", 4),
        ("IT", "grade-7", 2),
        ("IT", "grade-8", 3),
    ],
)
def test_supported_course_mapping(
    educational_system: str, grade_level: str, expected_course: int
) -> None:
    result = resolve_support_course(educational_system, grade_level)

    assert isinstance(result, SupportedCourse)
    assert result.supported is True
    assert result.model_course == expected_course


@pytest.mark.parametrize(
    ("educational_system", "grade_level"),
    [
        ("ES", "grade-6"),
        ("IT", "grade-6"),
        ("IT", "grade-9"),
        ("IT", "grade-10"),
        ("FR", "grade-7"),
        ("", "grade-7"),
        ("ES", ""),
        ("ES", "grade-11"),
    ],
)
def test_unsupported_course_returns_information_insufficient(
    educational_system: str, grade_level: str
) -> None:
    result = resolve_support_course(educational_system, grade_level)

    assert isinstance(result, UnsupportedCourse)
    assert result.supported is False
    assert result.model_course is None
    assert result.suggests_educational_support is None
    assert result.state == INFORMATION_INSUFFICIENT
    assert result.model_used == UNSUPPORTED_COURSE_MODEL
    assert (educational_system.strip().upper() or "(vacío)") in result.reason
    assert (grade_level.strip().lower() or "(vacío)") in result.reason


def test_course_mapping_normalizes_case_and_whitespace() -> None:
    result = resolve_support_course(" es ", " GRADE-10 ")

    assert result == SupportedCourse(
        educational_system="ES",
        grade_level="grade-10",
        model_course=4,
    )


@pytest.mark.parametrize(
    ("educational_system", "grade_level", "difficulty", "expected_stratum"),
    [
        ("ES", "grade-7", "easy", "Curso1_D1"),
        ("ES", "grade-7", "medium", "Curso1_D2"),
        ("ES", "grade-8", "easy", "Curso2_D1"),
        ("ES", "grade-10", "hard", "Curso4_D3"),
        ("IT", "grade-7", "medium", "Curso2_D2"),
        ("IT", "grade-8", "hard", "Curso3_D3"),
    ],
)
def test_course_and_difficulty_are_resolved_as_one_stratum(
    educational_system: str,
    grade_level: str,
    difficulty: str,
    expected_stratum: str,
) -> None:
    result = resolve_course_difficulty(educational_system, grade_level, difficulty)

    assert isinstance(result, SupportedCourseDifficulty)
    assert result.stratum == expected_stratum


def test_course_difficulty_preserves_both_axes_instead_of_combining_scores() -> None:
    first_year_medium = resolve_course_difficulty("ES", "grade-7", "medium")
    second_year_easy = resolve_course_difficulty("ES", "grade-8", "easy")

    assert isinstance(first_year_medium, SupportedCourseDifficulty)
    assert isinstance(second_year_easy, SupportedCourseDifficulty)
    assert first_year_medium.stratum == "Curso1_D2"
    assert second_year_easy.stratum == "Curso2_D1"
    assert first_year_medium.model_course < second_year_easy.model_course
    assert first_year_medium.difficulty_code > second_year_easy.difficulty_code


def test_course_difficulty_returns_non_prediction_for_unsupported_course() -> None:
    result = resolve_course_difficulty("IT", "grade-9", "easy")

    assert isinstance(result, UnsupportedCourse)
    assert result.suggests_educational_support is None
    assert result.model_used == UNSUPPORTED_COURSE_MODEL


@pytest.mark.parametrize("difficulty", ["", "D1", "very-hard", "unknown"])
def test_course_difficulty_rejects_unknown_difficulty(difficulty: str) -> None:
    with pytest.raises(ValueError, match="easy, medium o hard"):
        resolve_course_difficulty("ES", "grade-7", difficulty)
