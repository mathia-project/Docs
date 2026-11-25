"""Evidence-volume policy for educational-support predictions."""

from dataclasses import dataclass
from typing import Literal, TypeAlias

EvidenceLevel: TypeAlias = Literal["insufficient", "limited", "standard"]

MINIMUM_RESPONSES = 30
STANDARD_EVIDENCE_RESPONSES = 90
MODEL_FIT_MAXIMUM_RESPONSES = 204


@dataclass(frozen=True)
class ResponseEvidence:
    total_responses: int
    level: EvidenceLevel
    can_predict: bool
    suggests_educational_support: None = None
    state: str | None = None
    model_used: str | None = None
    reason: str = ""
    volume_outside_fit_range: bool = False


def assess_response_evidence(total_responses: int) -> ResponseEvidence:
    """Classify response volume without treating it as model confidence."""

    if isinstance(total_responses, bool) or total_responses < 0:
        raise ValueError("El número de respuestas debe ser un entero no negativo.")

    if total_responses < MINIMUM_RESPONSES:
        return ResponseEvidence(
            total_responses=total_responses,
            level="insufficient",
            can_predict=False,
            state="Información insuficiente",
            model_used="sin_prediccion_respuestas_insuficientes",
            reason=(
                f"Se requieren al menos {MINIMUM_RESPONSES} respuestas realizadas; "
                f"solo hay {total_responses}."
            ),
        )

    if total_responses < STANDARD_EVIDENCE_RESPONSES:
        return ResponseEvidence(
            total_responses=total_responses,
            level="limited",
            can_predict=True,
            reason=(
                "Predicción permitida con evidencia limitada: el historial contiene "
                f"entre {MINIMUM_RESPONSES} y {STANDARD_EVIDENCE_RESPONSES - 1} respuestas."
            ),
        )

    outside_fit_range = total_responses > MODEL_FIT_MAXIMUM_RESPONSES
    return ResponseEvidence(
        total_responses=total_responses,
        level="standard",
        can_predict=True,
        reason=(
            f"El historial supera las {MODEL_FIT_MAXIMUM_RESPONSES} respuestas observadas "
            "como máximo durante el ajuste."
            if outside_fit_range
            else ""
        ),
        volume_outside_fit_range=outside_fit_range,
    )
