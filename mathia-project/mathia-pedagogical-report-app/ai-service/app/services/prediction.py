from statistics import fmean

from app.schemas.predictions import (
    ClassPredictionRequest,
    ClassPredictionResponse,
    RiskDistribution,
    RiskLevel,
    StudentPredictionRequest,
    StudentPredictionResponse,
    StudentSignals,
)

MODEL_VERSION = "deterministic-baseline-v1"


def _round(value: float) -> float:
    return round(value, 2)


def _risk_level(composite_score: float) -> RiskLevel:
    if composite_score < 50:
        return "high"
    if composite_score < 65:
        return "moderate"
    if composite_score < 80:
        return "low"
    return "minimal"


def predict_student(payload: StudentPredictionRequest) -> StudentPredictionResponse:
    academic_average = fmean(payload.scores)
    composite_score = (
        academic_average * 0.70
        + payload.attendance_rate * 100 * 0.15
        + payload.engagement_rate * 100 * 0.15
    )
    confidence = min(0.60 + len(payload.scores) * 0.06, 0.90)

    return StudentPredictionResponse(
        student_id=payload.student_id,
        composite_score=_round(composite_score),
        risk_level=_risk_level(composite_score),
        confidence=_round(confidence),
        signals=StudentSignals(
            academic_average=_round(academic_average),
            attendance_rate=payload.attendance_rate,
            engagement_rate=payload.engagement_rate,
            sex=payload.sex,
        ),
        model_version=MODEL_VERSION,
    )


def predict_class(payload: ClassPredictionRequest) -> ClassPredictionResponse:
    student_predictions = [predict_student(student) for student in payload.students]
    class_score = fmean(student.composite_score for student in student_predictions)
    counts = {level: 0 for level in ("high", "moderate", "low", "minimal")}
    for student in student_predictions:
        counts[student.risk_level] += 1

    priority_ids = [
        student.student_id
        for student in student_predictions
        if student.risk_level in {"high", "moderate"}
    ]

    return ClassPredictionResponse(
        class_id=payload.class_id,
        composite_score=_round(class_score),
        risk_level=_risk_level(class_score),
        risk_distribution=RiskDistribution(**counts),
        priority_student_ids=priority_ids,
        students=student_predictions,
        model_version=MODEL_VERSION,
    )
