"""Execute the trusted PU artifact against authoritative student history."""

import importlib
import math
import sys
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

import pandas as pd

from app.schemas.support_predictions import (
    StoredSupportPrediction,
    SupportPredictionStatus,
    SupportPredictionToStore,
)
from app.services.support_history import ExtractedSupportHistory, load_student_model_history
from app.services.support_prediction_store import save_support_prediction

MODEL_NAME = "mathia_pu"
MODEL_PACKAGE_DIRECTORY = Path(__file__).resolve().parents[2] / "modelo_integrado"


@lru_cache(maxsize=1)
def load_support_artifact(model_path: str) -> dict[str, Any]:
    """Load the configured trusted artifact once per service process."""

    package_directory = str(MODEL_PACKAGE_DIRECTORY)
    if package_directory not in sys.path:
        sys.path.insert(0, package_directory)
    workflow = importlib.import_module("mathia_pu.workflow")
    artifact = workflow.load_artifact(Path(model_path))
    return dict(artifact)


def _artifact_version(artifact: dict[str, Any]) -> str:
    schema_version = artifact.get("schema_version", "unknown")
    fingerprint = str(artifact.get("input_hash") or "unknown")[:12]
    return f"schema-v{schema_version}-{fingerprint}"


def _valid_response_times(history: ExtractedSupportHistory) -> int:
    count = 0
    for row in history.model_rows:
        value = row.get("TiempoRespuesta")
        if (
            row.get("Realizado") == "S"
            and isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
            and value > 0
        ):
            count += 1
    return count


def _base_warnings(history: ExtractedSupportHistory) -> list[str]:
    warnings = [
        "prediction_is_not_a_diagnosis",
        "unlabeled_students_are_not_confirmed_negatives",
    ]
    if history.evidence.level == "limited":
        warnings.append("limited_response_evidence_30_to_89")
    if history.evidence.volume_outside_fit_range:
        warnings.append("response_volume_above_model_fit_range")
    if history.excluded_answered_questions:
        warnings.append("unsupported_course_responses_excluded")
    return warnings


def _not_predicted_result(
    history: ExtractedSupportHistory,
    artifact: dict[str, Any],
    school_id: UUID,
    *,
    status: SupportPredictionStatus,
    route: str,
    reason: str,
    warning: str,
) -> SupportPredictionToStore:
    return SupportPredictionToStore(
        school_id=school_id,
        student_id=UUID(history.profile.student_id),
        suggests_educational_support=None,
        status=status,
        model_name=MODEL_NAME,
        model_version=_artifact_version(artifact),
        model_route=route,
        evidence_level=history.evidence.level,
        total_responses=history.answered_questions,
        valid_response_times=_valid_response_times(history),
        volume_outside_fit_range=history.evidence.volume_outside_fit_range,
        warnings=[*_base_warnings(history), warning],
        reason=reason,
        generated_at=datetime.now(UTC),
    )


def build_support_prediction(
    history: ExtractedSupportHistory,
    artifact: dict[str, Any],
    school_id: UUID,
) -> SupportPredictionToStore:
    """Apply product evidence policy and then execute the trusted PU model."""

    if history.profile.has_diagnosis:
        return _not_predicted_result(
            history,
            artifact,
            school_id,
            status="diagnosis_recorded",
            route="sin_prediccion_diagnostico",
            reason="Se conserva el diagnóstico existente; no se ejecuta el modelo.",
            warning="prediction_skipped_existing_diagnosis",
        )

    if history.profile.sex_numeric is None:
        return _not_predicted_result(
            history,
            artifact,
            school_id,
            status="insufficient_information",
            route="sin_prediccion_sexo_no_disponible",
            reason="El modelo requiere Sexo(M=1) con valor 0 o 1 y no se infiere.",
            warning="required_sex_not_available",
        )

    evidence = history.evidence
    if not evidence.can_predict:
        return _not_predicted_result(
            history,
            artifact,
            school_id,
            status="insufficient_information",
            route=evidence.model_used or "sin_prediccion_respuestas_insuficientes",
            reason=evidence.reason,
            warning="fewer_than_30_supported_responses",
        )

    workflow = importlib.import_module("mathia_pu.workflow")
    output = workflow.predict_responses(pd.DataFrame(history.model_rows), artifact)
    if len(output.index) != 1:
        raise ValueError("El modelo debe devolver exactamente un resultado para el alumno.")
    row = output.iloc[0]
    raw_decision = row["SugiereAtencionEducativa"]
    decision = None if pd.isna(raw_decision) else bool(raw_decision)
    if decision is True:
        status: SupportPredictionStatus = "support_suggested"
    elif decision is False:
        status = "no_support_signal"
    else:
        status = "insufficient_information"

    index_value = row["IndiceAtencion"]
    threshold_value = row["UmbralAplicado"]
    reason_value = row["Motivo"]
    warnings = [*_base_warnings(history), "threshold_is_provisional"]
    route = str(row["ModeloUtilizado"])
    if route == "sin_tiempos":
        warnings.append("prediction_used_route_without_response_times")

    return SupportPredictionToStore(
        school_id=school_id,
        student_id=UUID(history.profile.student_id),
        suggests_educational_support=decision,
        status=status,
        attention_index=None if pd.isna(index_value) else float(index_value),
        applied_threshold=None if pd.isna(threshold_value) else float(threshold_value),
        model_name=MODEL_NAME,
        model_version=_artifact_version(artifact),
        model_route=route,
        evidence_level=evidence.level,
        total_responses=int(row["TotalRealizados"]),
        valid_response_times=int(row["TiemposValidos"]),
        volume_outside_fit_range=bool(row["VolumenFueraRangoAjuste"]),
        warnings=warnings,
        reason=(
            None
            if pd.isna(reason_value) or not str(reason_value).strip()
            else str(reason_value)
        ),
        generated_at=datetime.now(UTC),
    )


def predict_and_store_student_support(
    database_url: str,
    model_path: str,
    student_id: UUID,
    school_id: UUID,
) -> StoredSupportPrediction:
    """Run one complete prediction transaction and append its auditable result."""

    history = load_student_model_history(database_url, student_id, school_id)
    artifact = load_support_artifact(model_path)
    prediction = build_support_prediction(history, artifact, school_id)
    return save_support_prediction(database_url, prediction)
