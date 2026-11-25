from app.schemas.reports import (
    ClassReportRequest,
    ClassReportResponse,
    StudentReportRequest,
    StudentReportResponse,
)

GENERATOR_VERSION = "deterministic-template-v1"

_RISK_DESCRIPTIONS = {
    "high": "a high level of support need",
    "moderate": "a moderate level of support need",
    "low": "a low level of support need",
    "minimal": "a minimal level of support need",
}


def generate_student_report(payload: StudentReportRequest) -> StudentReportResponse:
    prediction = payload.prediction
    signals = prediction.signals
    strengths: list[str] = []
    recommendations: list[str] = []

    if signals.academic_average >= 70:
        strengths.append("Academic results show a stable foundation for further learning.")
    if signals.attendance_rate >= 0.90:
        strengths.append("Attendance supports continuity in the learning process.")
    if signals.engagement_rate >= 0.75:
        strengths.append("Engagement is a positive contributor to current progress.")
    if not strengths:
        strengths.append("The available evidence provides a clear baseline for targeted support.")

    if signals.academic_average < 65:
        recommendations.append(
            "Plan short, targeted practice around the least secure learning objectives."
        )
    if signals.attendance_rate < 0.85:
        recommendations.append(
            "Review attendance barriers and agree on a realistic continuity plan."
        )
    if signals.engagement_rate < 0.70:
        recommendations.append(
            "Use frequent check-ins and achievable milestones to strengthen engagement."
        )
    if not recommendations:
        recommendations.append(
            "Maintain current supports and review progress at the next assessment point."
        )

    summary = (
        f"{payload.student_name} has a composite indicator of "
        f"{prediction.composite_score:.1f}/100, corresponding to "
        f"{_RISK_DESCRIPTIONS[prediction.risk_level]}."
    )

    return StudentReportResponse(
        student_id=prediction.student_id,
        title=f"Pedagogical report draft: {payload.student_name}",
        summary=summary,
        strengths=strengths,
        recommendations=recommendations,
        generator_version=GENERATOR_VERSION,
    )


def generate_class_report(payload: ClassReportRequest) -> ClassReportResponse:
    prediction = payload.prediction
    distribution = prediction.risk_distribution
    student_count = len(prediction.students)
    priority_count = distribution.high + distribution.moderate

    highlights = [
        f"The class composite indicator is {prediction.composite_score:.1f}/100.",
        (
            f"{distribution.minimal + distribution.low} of {student_count} students "
            "have low or minimal support needs."
        ),
    ]
    priorities: list[str] = []

    if distribution.high:
        priorities.append(
            f"Prioritize individual review for {distribution.high} student(s) "
            "with high support needs."
        )
    if distribution.moderate:
        priorities.append(
            f"Monitor and adapt support for {distribution.moderate} student(s) with moderate needs."
        )
    if not priorities:
        priorities.append(
            "Continue universal classroom support and monitor changes at the next review point."
        )

    summary = (
        f"{payload.class_name} includes {student_count} assessed student(s); "
        f"{priority_count} currently require prioritized monitoring or support."
    )

    return ClassReportResponse(
        class_id=prediction.class_id,
        title=f"Class pedagogical report draft: {payload.class_name}",
        summary=summary,
        highlights=highlights,
        priorities=priorities,
        generator_version=GENERATOR_VERSION,
    )
