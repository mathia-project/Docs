"""Authoritative evidence extraction and relational authorization for student pedagogical reports."""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException
import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings
from app.schemas.report_generation import (
    DiagnosticEvidence,
    DomainEvidence,
    PredictionEvidence,
    ReportEvidenceSnapshot,
    ReportMetrics,
    ReportPeriod,
    ReportStoredPrediction,
    ResourceEvidence,
    StudentReportGenerationRequest,
    rounded,
)


ITALIAN_DOMAIN_NAMES = {
    "6.EE": "Espressioni ed equazioni",
    "6.G": "Geometria",
    "6.NS": "Il sistema numerico",
    "6.RP": "Rapporti e relazioni proporzionali",
    "6.SP": "Statistica e probabilità",
    "7.EE": "Espressioni ed equazioni",
    "7.G": "Geometria",
    "7.NS": "Il sistema numerico",
    "7.RP": "Rapporti e relazioni proporzionali",
    "7.SP": "Statistica e probabilità",
    "8.EE": "Espressioni ed equazioni",
    "8.F": "Funzioni",
    "8.G": "Geometria",
    "8.NS": "Il sistema numerico",
    "8.SP": "Statistica e probabilità",
    "HSA-APR": "Aritmetica con polinomi ed espressioni razionali",
    "HSA-CED": "Creazione di equazioni",
    "HSA-REI": "Ragionamento con equazioni e disequazioni",
    "HSA-SSE": "Struttura delle espressioni",
    "HSF-BF": "Costruzione di funzioni",
    "HSF-IF": "Interpretazione delle funzioni",
    "HSF-LE": "Modelli lineari, quadratici ed esponenziali",
    "HSF-TF": "Funzioni trigonometriche",
    "HSG-C": "Circonferenze",
    "HSG-CO": "Congruenza",
    "HSG-GMD": "Misura geometrica e dimensione",
    "HSG-GPE": "Proprietà geometriche espresse mediante equazioni",
    "HSG-SRT": "Similitudine, triangoli rettangoli e trigonometria",
    "HSN-CN": "Il sistema dei numeri complessi",
    "HSN-Q": "Quantità",
    "HSN-RN": "Il sistema dei numeri reali",
    "HSS-CP": "Probabilità condizionata e regole della probabilità",
    "HSS-ID": "Interpretazione di dati categorici e quantitativi",
    "HSS-MD": "Uso della probabilità per prendere decisioni",
}


def _localized_domain_name(name: object, domain_id: str, language: str) -> str:
    if not isinstance(name, dict):
        return str(name)
    return (
        name.get(language)
        or (ITALIAN_DOMAIN_NAMES.get(domain_id) if language == "it" else None)
        or name.get("es")
        or name.get("en")
        or domain_id
    )


def _localized_message(language: str, en: str, es: str, it: str) -> str:
    return {"en": en, "es": es, "it": it}[language]


def _get_db():
    settings = get_settings()
    return psycopg.connect(
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        row_factory=dict_row,
    )


def _report_stored_prediction(row: dict[str, Any]) -> ReportStoredPrediction:
    """Represent an absent stored reason as null in the stricter report contract."""
    prediction = dict(row)
    if isinstance(prediction.get("reason"), str) and not prediction["reason"].strip():
        prediction["reason"] = None
    return ReportStoredPrediction.model_validate(prediction)


async def resolve_report_authorization(
    student_id: UUID,
    class_id: Optional[UUID],
    token: str,
) -> Dict[str, Any]:
    """Verifies relational authorization via Directus session."""
    directus_url = get_settings().directus_url.rstrip("/") + "/"
    async with httpx.AsyncClient(
        base_url=directus_url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    ) as client:
        try:
            resp = await client.get("users/me", params={"fields": "id,email,role,school_id"})
        except httpx.RequestError as exc:
            raise HTTPException(503, "auth_service_unavailable") from exc
        
        if resp.status_code == 401:
            raise HTTPException(401, "authentication_required")
        if resp.status_code != 200:
            raise HTTPException(403, "access_denied")
        
        user = resp.json().get("data", {})
        user_id = user.get("id")
        user_school_id = user.get("school_id")

        # 1. Fetch student profile
        s_resp = await client.get(
            f"items/student_profiles/{student_id}",
            params={"fields": "id,first_name,last_name,school_id,has_diagnosis,needs_evaluation,diagnosis_notes"},
        )
        if s_resp.status_code != 200:
            raise HTTPException(404, "student_not_found")
        student = s_resp.json().get("data", {})
        student_school_id = student.get("school_id")

        # 2. Relational access check in PostgreSQL
        with _get_db() as conn:
            with conn.cursor() as cur:
                # Check user role name
                cur.execute(
                    "SELECT name FROM directus_roles WHERE id = %s;",
                    (user.get("role"),),
                )
                role_row = cur.fetchone()
                role_name = (role_row["name"] if role_row else "").lower()

                if "student" in role_name:
                    raise HTTPException(403, "student_role_cannot_generate_reports")

                if "director" in role_name:
                    if str(user_school_id) != str(student_school_id):
                        raise HTTPException(403, "director_different_school")

                elif "teacher" in role_name or "docente" in role_name:
                    # Teacher must be assigned to student's class
                    cur.execute(
                        """
                        SELECT 1
                        FROM class_teachers ct
                        JOIN teacher_profiles tp ON tp.id = ct.teacher_id
                        JOIN class_students cs ON cs.class_id = ct.class_id
                        WHERE tp.directus_user_id = %s
                          AND cs.student_id = %s
                          AND cs.active = true
                          AND ct.active = true
                          AND (%s::uuid IS NULL OR ct.class_id = %s::uuid);
                        """,
                        (user_id, student_id, class_id, class_id),
                    )
                    assignment = cur.fetchone()
                    if not assignment:
                        raise HTTPException(403, "teacher_not_assigned_to_student")

                # Fetch classroom info if class_id is present
                classroom = None
                if class_id:
                    cur.execute("SELECT id, name, school_id FROM classes WHERE id = %s;", (class_id,))
                    classroom = cur.fetchone()

                cur.execute("SELECT id, name FROM schools WHERE id = %s;", (student_school_id,))
                school = cur.fetchone()

        return {
            "user": user,
            "student": student,
            "school": dict(school) if school else {"id": student_school_id, "name": "School"},
            "classroom": dict(classroom) if classroom else None,
        }


def _assign_report_resources(cur, student_id: UUID, school_id: UUID, language: str) -> None:
    # Use both the primary domain and optional additional curriculum alignments.
    # Scores use the 0-15 scale; below 10 is classified as intervention.
    cur.execute(
        """
        INSERT INTO resource_assignments (school_id, resource_id, student_id, active)
        SELECT r.school_id, r.id, %s::uuid, true
        FROM resources r
        WHERE r.school_id = %s::uuid
          AND r.status = 'published'
          AND r.language = %s
          AND EXISTS (
              SELECT 1
              FROM student_domain_evaluations sde
              WHERE sde.student_id = %s::uuid
                AND sde.school_id = r.school_id
                AND sde.score < 10.0
                AND sde.evaluations_count > 0
                AND (
                    sde.domain_id = r.domain_id
                    OR EXISTS (
                        SELECT 1
                        FROM resource_curriculum_alignments rca
                        WHERE rca.resource_id = r.id
                          AND rca.domain_id = sde.domain_id
                    )
                )
          )
          AND NOT EXISTS (
              SELECT 1
              FROM resource_assignments existing
              WHERE existing.resource_id = r.id
                AND existing.school_id = r.school_id
                AND existing.student_id = %s::uuid
          )
        ON CONFLICT DO NOTHING;
        """,
        (student_id, school_id, language, student_id, student_id),
    )


def collect_report_evidence(
    student_id: UUID,
    class_id: Optional[UUID],
    period: ReportPeriod,
    language: str,
    school_id: UUID,
) -> ReportEvidenceSnapshot:
    """Collects authoritative metrics, domain breakdowns, stored predictions, and resources from PostgreSQL."""
    prepared_at = datetime.datetime.now(datetime.timezone.utc)
    snapshot_id = uuid4()
    req = StudentReportGenerationRequest(
        schema_version="1.0",
        student_id=student_id,
        class_id=class_id,
        period=period,
        language=language,
    )

    with _get_db() as conn:
        with conn.cursor() as cur:
            # 1. Diagnostic evidence
            cur.execute(
                "SELECT has_diagnosis, needs_evaluation, diagnosis_notes FROM student_profiles WHERE id = %s;",
                (student_id,),
            )
            diag_row = cur.fetchone() or {}
            diagnostic = DiagnosticEvidence(
                evidence_ref="diag-profile",
                has_recorded_diagnosis=bool(diag_row.get("has_diagnosis")),
            )

            # 2. Stored support prediction
            cur.execute(
                """
                SELECT id, school_id, student_id, suggests_educational_support, status,
                       attention_index, applied_threshold, model_name, model_version,
                       model_route, evidence_level, total_responses, valid_response_times,
                       volume_outside_fit_range, warnings, reason, generated_at, created_at
                FROM student_support_predictions
                WHERE student_id = %s AND school_id = %s
                ORDER BY generated_at DESC LIMIT 1;
                """,
                (student_id, school_id),
            )
            pred_row = cur.fetchone()
            stored_prediction = None
            if pred_row:
                pred_obj = _report_stored_prediction(pred_row)
                stored_prediction = PredictionEvidence(
                    evidence_ref=f"pred-{pred_obj.id}",
                    prediction=pred_obj,
                )

            # 3. Graded evaluations by domain in the period
            cur.execute(
                """
                SELECT cd.id AS domain_id,
                       cd.name AS domain_name,
                       cd.category_id,
                       COUNT(DISTINCT ta.id) AS evaluations_count,
                       COUNT(taq.id) AS total_questions,
                       COUNT(taq.id) FILTER (WHERE taa.is_correct IS TRUE) AS correct_questions,
                       COALESCE(SUM(taa.score_awarded), 0.0) AS total_score_awarded,
                       COALESCE(SUM(tvq.points), 0.0) AS total_max_score
                FROM test_attempts ta
                JOIN test_assignments tas ON tas.id = ta.test_assignment_id
                JOIN test_attempt_questions taq ON taq.attempt_id = ta.id
                JOIN test_version_questions tvq ON tvq.id = taq.test_version_question_id
                LEFT JOIN question_bank_items qbi ON qbi.id = tvq.question_id
                JOIN curriculum_domains cd ON cd.id = COALESCE(
                    NULLIF(tvq.question_snapshot->>'domain_id', ''),
                    qbi.domain_id
                )
                LEFT JOIN test_attempt_answers taa ON taa.attempt_question_id = taq.id
                WHERE ta.student_id = %s
                  AND ta.school_id = %s
                  AND ta.status = 'graded'
                  AND ta.graded_at::date >= %s
                  AND ta.graded_at::date <= %s
                  AND (%s::uuid IS NULL OR tas.class_id = %s::uuid)
                GROUP BY cd.id, cd.name, cd.category_id
                ORDER BY cd.id;
                """,
                (student_id, school_id, period.start, period.end, class_id, class_id),
            )
            domain_rows = cur.fetchall()

            # Count total distinct completed tests
            cur.execute(
                """
                SELECT COUNT(DISTINCT ta.id) AS total_completed
                FROM test_attempts ta
                JOIN test_assignments tas ON tas.id = ta.test_assignment_id
                WHERE ta.student_id = %s
                  AND ta.school_id = %s
                  AND ta.status = 'graded'
                  AND ta.graded_at::date >= %s
                  AND ta.graded_at::date <= %s
                  AND (%s::uuid IS NULL OR tas.class_id = %s::uuid);
                """,
                (student_id, school_id, period.start, period.end, class_id, class_id),
            )
            completed_row = cur.fetchone()
            tests_completed = int(completed_row["total_completed"]) if completed_row else 0

            _assign_report_resources(cur, student_id, school_id, language)

            # 5. Resources assigned to the student (including automatic assignments).
            cur.execute(
                """
                SELECT id, title, domain_id, url, target_level
                FROM resources
                WHERE school_id = %s
                  AND status = 'published'
                  AND language = %s
                  AND EXISTS (
                      SELECT 1
                      FROM resource_assignments ra
                      WHERE ra.resource_id = resources.id
                        AND ra.school_id = resources.school_id
                        AND ra.active = true
                        AND (ra.student_id = %s OR ra.class_id = %s::uuid)
                  )
                ORDER BY title LIMIT 15;
                """,
                (school_id, language, student_id, class_id),
            )
            res_rows = cur.fetchall()

    # Build domain evidence
    domain_evidences: List[DomainEvidence] = []
    limitations: List[str] = []

    # If no evaluated domains, fetch baseline standard domains for grade 6
    if not domain_rows:
        limitations.append(_localized_message(
            language,
            "No assessments available in the requested period.",
            "No hay evaluaciones disponibles en el periodo solicitado.",
            "Nessuna valutazione disponibile nel periodo richiesto.",
        ))
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, category_id FROM curriculum_domains WHERE code IN ('6.RP', '6.NS') LIMIT 2;")
                base_domains = cur.fetchall()
        for b in base_domains:
            d_name = _localized_domain_name(b["name"], b["id"], language)
            domain_evidences.append(
                DomainEvidence(
                    evidence_ref=f"dom-{b['id']}",
                    domain_id=b["id"],
                    domain_name=d_name,
                    category_id=b.get("category_id"),
                    is_baseline=True,
                    evaluations_count=0,
                    total_questions=0,
                    correct_questions=0,
                    total_score_awarded=0.0,
                    total_max_score=0.0,
                    score=None,
                    accuracy_percent=None,
                    classification="insufficient_evidence",
                )
            )
    else:
        for row in domain_rows:
            d_id = row["domain_id"]
            d_name_obj = row["domain_name"]
            d_name = _localized_domain_name(d_name_obj, d_id, language)
            t_evals = int(row["evaluations_count"])
            t_q = int(row["total_questions"])
            c_q = int(row["correct_questions"])
            awarded = float(row["total_score_awarded"])
            max_pts = float(row["total_max_score"])

            if t_evals > 0 and max_pts > 0:
                score = rounded(Decimal(str(awarded)) * 15 / Decimal(str(max_pts)))
                accuracy = rounded(Decimal(str(c_q)) * 100 / Decimal(str(t_q))) if t_q > 0 else 0.0
                classification = "consolidated_strength" if score >= 10.0 else "intervention"
            else:
                score = None
                accuracy = None
                classification = "insufficient_evidence"

            domain_evidences.append(
                DomainEvidence(
                    evidence_ref=f"dom-{d_id}",
                    domain_id=d_id,
                    domain_name=d_name,
                    category_id=row.get("category_id"),
                    is_baseline=False,
                    evaluations_count=t_evals,
                    total_questions=t_q,
                    correct_questions=c_q,
                    total_score_awarded=awarded,
                    total_max_score=max_pts,
                    score=score,
                    accuracy_percent=accuracy,
                    classification=classification,
                )
            )

    # The evidence contract requires an explicit limitation whenever the
    # snapshot cannot support a complete assessment. This can happen not only
    # when there are no rows at all, but also when rows exist without graded
    # questions (or when a stored prediction has limited evidence).
    measured = [d for d in domain_evidences if d.score is not None]
    if not measured or len(measured) < len(domain_evidences):
        limitation = _localized_message(
            language,
            "The available academic evidence does not support a complete assessment for the requested period.",
            "La evidencia académica disponible no permite una valoración completa en el periodo solicitado.",
            "Le evidenze scolastiche disponibili non consentono una valutazione completa nel periodo richiesto.",
        )
        if limitation not in limitations:
            limitations.append(limitation)
    if stored_prediction and stored_prediction.prediction.evidence_level != "standard":
        limitation = _localized_message(
            language,
            "The available support prediction has a limited evidence level.",
            "La predicción de apoyo disponible tiene un nivel de evidencia limitado.",
            "La previsione di sostegno disponibile si basa su evidenze limitate.",
        )
        if limitation not in limitations:
            limitations.append(limitation)

    # Compute metrics
    if measured:
        curriculum_avg = rounded(sum(Decimal(str(d.score)) for d in measured) / len(measured))
        curriculum_avg_pct = rounded(Decimal(str(curriculum_avg)) * 100 / 15)
        total_q = sum(d.total_questions for d in measured)
        total_c = sum(d.correct_questions for d in measured)
        overall_acc = rounded(Decimal(str(total_c)) * 100 / Decimal(str(total_q))) if total_q > 0 else 0.0
        metrics = ReportMetrics(
            evidence_ref="metr-summary",
            tests_completed=tests_completed or 1,
            total_evaluated_domains=len(measured),
            curriculum_average=curriculum_avg,
            curriculum_average_percent=curriculum_avg_pct,
            total_questions_answered=total_q,
            overall_accuracy_percent=overall_acc,
        )
    else:
        metrics = ReportMetrics(
            evidence_ref="metr-summary",
            tests_completed=0,
            total_evaluated_domains=0,
            curriculum_average=None,
            curriculum_average_percent=None,
            total_questions_answered=0,
            overall_accuracy_percent=None,
        )

    # Check limitations for stored predictions
    if not stored_prediction:
        limitations.append(_localized_message(
            language,
            "No stored support prediction available.",
            "No se dispone de una predicción de apoyo almacenada.",
            "Non è disponibile una previsione di sostegno salvata.",
        ))

    # Resources
    resource_evidences: List[ResourceEvidence] = []
    valid_domain_ids = {d.domain_id for d in domain_evidences}
    for r in res_rows:
        dom_id = r["domain_id"] if r["domain_id"] in valid_domain_ids else None
        resource_evidences.append(
            ResourceEvidence(
                resource_id=r["id"],
                title=r["title"],
                domain_id=dom_id,
                target_level=r["target_level"],
            )
        )

    return ReportEvidenceSnapshot(
        schema_version="1.0",
        evidence_snapshot_id=snapshot_id,
        prepared_at=prepared_at,
        school_id=school_id,
        request=req,
        calculation_version="student-report-metrics/1.0",
        source_scope="authorized_period_assessments",
        source_complete=True,
        metrics=metrics,
        domains=domain_evidences,
        diagnostic=diagnostic,
        stored_prediction=stored_prediction,
        resources=resource_evidences,
        limitations=limitations,
    )
