"""Resolve application grade levels to the course codes used by the PU model."""

from dataclasses import dataclass
from typing import Literal, TypeAlias, cast

EducationalSystem: TypeAlias = Literal["ES", "IT"]
GradeLevel: TypeAlias = Literal["grade-6", "grade-7", "grade-8", "grade-9", "grade-10"]
QuestionDifficulty: TypeAlias = Literal["easy", "medium", "hard"]
DifficultyCode: TypeAlias = Literal["D1", "D2", "D3"]

INFORMATION_INSUFFICIENT = "Información insuficiente"
UNSUPPORTED_COURSE_MODEL = "sin_prediccion_curso_no_cubierto"

_MODEL_COURSES: dict[tuple[EducationalSystem, GradeLevel], int] = {
    ("ES", "grade-7"): 1,
    ("ES", "grade-8"): 2,
    ("ES", "grade-9"): 3,
    ("ES", "grade-10"): 4,
    ("IT", "grade-7"): 2,
    ("IT", "grade-8"): 3,
}

_MODEL_DIFFICULTIES: dict[QuestionDifficulty, DifficultyCode] = {
    "easy": "D1",
    "medium": "D2",
    "hard": "D3",
}


@dataclass(frozen=True)
class SupportedCourse:
    """A school system and grade combination represented in model training."""

    educational_system: EducationalSystem
    grade_level: GradeLevel
    model_course: int
    supported: Literal[True] = True


@dataclass(frozen=True)
class UnsupportedCourse:
    """A valid non-prediction result for a course outside model coverage."""

    educational_system: str
    grade_level: str
    model_course: None = None
    supported: Literal[False] = False
    suggests_educational_support: None = None
    state: str = INFORMATION_INSUFFICIENT
    model_used: str = UNSUPPORTED_COURSE_MODEL
    reason: str = ""


CourseResolution: TypeAlias = SupportedCourse | UnsupportedCourse


@dataclass(frozen=True)
class SupportedCourseDifficulty:
    """The model stratum for one question, retaining course and difficulty."""

    educational_system: EducationalSystem
    grade_level: GradeLevel
    model_course: int
    question_difficulty: QuestionDifficulty
    difficulty_code: DifficultyCode
    stratum: str
    supported: Literal[True] = True


CourseDifficultyResolution: TypeAlias = SupportedCourseDifficulty | UnsupportedCourse


def resolve_support_course(educational_system: str, grade_level: str) -> CourseResolution:
    """Map a supported grade or return a non-prediction outcome.

    Unsupported combinations are a domain result rather than a transport error:
    callers must preserve the null suggestion and must not invoke the PU model.
    """

    system = educational_system.strip().upper()
    grade = grade_level.strip().lower()
    normalized_system = cast(EducationalSystem, system)
    normalized_grade = cast(GradeLevel, grade)
    model_course = _MODEL_COURSES.get((normalized_system, normalized_grade))
    if model_course is None:
        return UnsupportedCourse(
            educational_system=system,
            grade_level=grade,
            reason=(
                "El modelo no cubre la combinación de sistema educativo "
                f"{system or '(vacío)'} y curso {grade or '(vacío)'}."
            ),
        )

    return SupportedCourse(
        educational_system=normalized_system,
        grade_level=normalized_grade,
        model_course=model_course,
    )


def resolve_course_difficulty(
    educational_system: str,
    grade_level: str,
    question_difficulty: str,
) -> CourseDifficultyResolution:
    """Resolve the independent ``Curso x Dificultad`` stratum for a question.

    D1-D3 are relative bands within the mapped course. They must never be
    collapsed with the course number or treated as one global difficulty scale.
    """

    course = resolve_support_course(educational_system, grade_level)
    if isinstance(course, UnsupportedCourse):
        return course

    normalized_difficulty = question_difficulty.strip().lower()
    difficulty_code = _MODEL_DIFFICULTIES.get(
        cast(QuestionDifficulty, normalized_difficulty)
    )
    if difficulty_code is None:
        raise ValueError("La dificultad debe ser easy, medium o hard.")

    return SupportedCourseDifficulty(
        educational_system=course.educational_system,
        grade_level=course.grade_level,
        model_course=course.model_course,
        question_difficulty=cast(QuestionDifficulty, normalized_difficulty),
        difficulty_code=difficulty_code,
        stratum=f"Curso{course.model_course}_{difficulty_code}",
    )
