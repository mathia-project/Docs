"""Extract authoritative graded-response history for the PU support model."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.services.support_course import (
    SupportedCourseDifficulty,
    UnsupportedCourse,
    resolve_course_difficulty,
)
from app.services.support_evidence import ResponseEvidence, assess_response_evidence

_CATEGORY_NAMES = {
    "A": "Algebra",
    "N": "Numeros",
    "G": "Geometria",
    "S": "Estadistica",
    "F": "Funciones",
}


@dataclass(frozen=True)
class StudentModelProfile:
    student_id: str
    educational_system: str
    sex: str | None
    has_diagnosis: bool

    @property
    def sex_numeric(self) -> int | None:
        if self.sex == "male":
            return 1
        if self.sex == "female":
            return 0
        return None


@dataclass(frozen=True)
class ExtractedSupportHistory:
    profile: StudentModelProfile
    model_rows: tuple[dict[str, object], ...]
    excluded_answered_questions: int

    @property
    def answered_questions(self) -> int:
        return sum(row["Realizado"] == "S" for row in self.model_rows)

    @property
    def evidence(self) -> ResponseEvidence:
        return assess_response_evidence(self.answered_questions)


def _record_was_performed(record: Mapping[str, Any]) -> bool:
    """Identify a real answer, including rows written before timing was synced.

    The grading flow creates an empty ``{}`` answer row for unanswered
    questions so every question can receive a score. The answer timestamp
    alone is therefore not enough evidence that the student answered.
    """

    if record.get("answered_at") is not None:
        return True
    answer_payload = record.get("answer_payload")
    return isinstance(answer_payload, Mapping) and bool(answer_payload)


def build_model_response_history(
    profile: StudentModelProfile,
    question_records: Sequence[Mapping[str, Any]],
) -> ExtractedSupportHistory:
    """Convert graded attempt questions into the model's raw response contract."""

    rows: list[dict[str, object]] = []
    excluded_answered = 0
    diagnosis = "S" if profile.has_diagnosis else "D0"

    for record in question_records:
        performed = _record_was_performed(record)
        course_id = str(record.get("course_id") or "")
        difficulty = str(record.get("difficulty") or "")

        if performed:
            resolution = resolve_course_difficulty(
                profile.educational_system,
                course_id,
                difficulty,
            )
            if isinstance(resolution, UnsupportedCourse):
                excluded_answered += 1
                continue
            if not isinstance(resolution, SupportedCourseDifficulty):
                raise TypeError("Resolución Curso × Dificultad inesperada.")

            category_id = str(record.get("category_id") or "").upper()
            category = _CATEGORY_NAMES.get(category_id)
            if category is None:
                raise ValueError(
                    f"La pregunta realizada tiene una categoría curricular desconocida: "
                    f"{category_id or '(vacía)'}.",
                )

            is_correct = record.get("is_correct")
            if not isinstance(is_correct, bool):
                raise ValueError("Una pregunta realizada y calificada debe indicar si es correcta.")

            model_course: int | None = resolution.model_course
            difficulty_code: str | None = resolution.difficulty_code
            correct: str | None = "S" if is_correct else "N"
            response_time = record.get("active_duration_ms")
        else:
            # Assigned but unanswered questions do not contribute to model
            # strata. Keeping the row preserves the raw Realizado=N history.
            model_course = None
            difficulty_code = None
            category = None
            correct = None
            response_time = None

        rows.append(
            {
                "Identificador": profile.student_id,
                "Sexo(M=1)": profile.sex_numeric,
                "Curso": model_course,
                "Realizado": "S" if performed else "N",
                "Correcto": correct,
                "Dificultad": difficulty_code,
                "TipoEjercicio": category,
                "TiempoRespuesta": response_time,
                "Diagnostico": diagnosis,
            }
        )

    return ExtractedSupportHistory(
        profile=profile,
        model_rows=tuple(rows),
        excluded_answered_questions=excluded_answered,
    )


def load_student_model_history(
    database_url: str,
    student_id: UUID,
    school_id: UUID,
) -> ExtractedSupportHistory:
    """Load all graded attempts for one student, scoped to their school."""

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sp.id AS student_id,
                       sp.sex,
                       sp.has_diagnosis,
                       s.educational_system
                FROM student_profiles sp
                JOIN schools s ON s.id = sp.school_id
                WHERE sp.id = %s AND sp.school_id = %s
                """,
                (student_id, school_id),
            )
            profile_record = cur.fetchone()
            if profile_record is None:
                raise ValueError("No existe el alumno en el centro indicado.")

            cur.execute(
                """
                SELECT ta.id AS attempt_id,
                       ta.attempt_number,
                       ta.graded_at,
                       taq.id AS attempt_question_id,
                       taq.display_position,
                       CASE
                           WHEN taq.answered_at IS NOT NULL THEN taq.answered_at
                           WHEN taa.answer_payload IS NOT NULL
                                AND taa.answer_payload <> '{}'::jsonb
                               THEN taa.answered_at
                           ELSE NULL
                       END AS answered_at,
                       taq.active_duration_ms,
                       COALESCE(
                           NULLIF(tvq.course_id, ''),
                           NULLIF(tvq.question_snapshot->>'course_id', ''),
                           assigned_class.grade_level
                       ) AS course_id,
                       COALESCE(
                           NULLIF(tvq.question_snapshot->>'difficulty', ''),
                           qbi.difficulty
                       ) AS difficulty,
                       cd.category_id,
                       taa.is_correct,
                       taa.answer_payload
                FROM test_attempts ta
                JOIN test_attempt_questions taq ON taq.attempt_id = ta.id
                JOIN test_version_questions tvq ON tvq.id = taq.test_version_question_id
                LEFT JOIN test_assignments assignment
                    ON assignment.id = ta.test_assignment_id
                LEFT JOIN classes assigned_class
                    ON assigned_class.id = assignment.class_id
                LEFT JOIN question_bank_items qbi ON qbi.id = tvq.question_id
                LEFT JOIN curriculum_domains cd ON cd.id = COALESCE(
                    NULLIF(tvq.question_snapshot->>'domain_id', ''),
                    qbi.domain_id
                )
                LEFT JOIN test_attempt_answers taa ON taa.attempt_question_id = taq.id
                WHERE ta.student_id = %s
                  AND ta.school_id = %s
                  AND ta.status = 'graded'
                ORDER BY ta.graded_at, ta.attempt_number, ta.id, taq.display_position
                """,
                (student_id, school_id),
            )
            question_records = cur.fetchall()

    profile = StudentModelProfile(
        student_id=str(profile_record["student_id"]),
        educational_system=str(profile_record["educational_system"]),
        sex=profile_record["sex"],
        has_diagnosis=bool(profile_record["has_diagnosis"]),
    )
    return build_model_response_history(profile, question_records)
