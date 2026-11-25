"""Persistence for append-only educational-support prediction history."""

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.schemas.support_predictions import (
    StoredSupportPrediction,
    SupportPredictionToStore,
)


def save_support_prediction(
    database_url: str,
    prediction: SupportPredictionToStore,
) -> StoredSupportPrediction:
    """Insert one result after confirming that the student belongs to the school."""

    values = prediction.model_dump()
    values["warnings"] = Jsonb(values["warnings"])

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO student_support_predictions (
                    school_id,
                    student_id,
                    suggests_educational_support,
                    status,
                    attention_index,
                    applied_threshold,
                    model_name,
                    model_version,
                    model_route,
                    evidence_level,
                    total_responses,
                    valid_response_times,
                    volume_outside_fit_range,
                    warnings,
                    reason,
                    generated_at
                )
                SELECT
                    %(school_id)s,
                    %(student_id)s,
                    %(suggests_educational_support)s,
                    %(status)s,
                    %(attention_index)s,
                    %(applied_threshold)s,
                    %(model_name)s,
                    %(model_version)s,
                    %(model_route)s,
                    %(evidence_level)s,
                    %(total_responses)s,
                    %(valid_response_times)s,
                    %(volume_outside_fit_range)s,
                    %(warnings)s,
                    %(reason)s,
                    %(generated_at)s
                FROM student_profiles sp
                WHERE sp.id = %(student_id)s
                  AND sp.school_id = %(school_id)s
                RETURNING *
                """,
                values,
            )
            stored = cur.fetchone()

    if stored is None:
        raise ValueError("No existe el alumno en el centro indicado.")
    return StoredSupportPrediction.model_validate(stored)
