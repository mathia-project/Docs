"""Student pedagogical report generation using structured provider and strict contract validation."""

from __future__ import annotations

import datetime
import logging
from uuid import uuid4

from app.providers.base import StructuredGenerationRequest
from app.providers.factory import get_structured_provider
from app.schemas.report_generation import (
    DomainFinding,
    PedagogicalAction,
    ReportEvidenceSnapshot,
    ReportGenerationMetadata,
    StudentReportDocument,
    StudentReportGenerationResult,
    validate_document_evidence,
)

logger = logging.getLogger("ai_service.report_generator")


def _build_fallback_document(evidence: ReportEvidenceSnapshot) -> StudentReportDocument:
    """Builds a deterministic valid document adhering to all contract rules."""
    language = evidence.request.language

    def localized(en: str, es: str, it: str) -> str:
        return {"en": en, "es": es, "it": it}[language]

    strengths = []
    for d in evidence.domains:
        if d.classification == "consolidated_strength":
            txt = localized(
                f"Demonstrates solid mastery in {d.domain_name} with {d.score}/15 points.",
                f"Demuestra dominio sólido en {d.domain_name} con {d.score}/15 puntos.",
                f"Dimostra una solida padronanza in {d.domain_name} con {d.score}/15 punti.",
            )
            strengths.append(
                DomainFinding(
                    domain_id=d.domain_id,
                    text=txt,
                    evidence_refs=[d.evidence_ref],
                )
            )

    areas_for_improvement = []
    for d in evidence.domains:
        if d.classification == "intervention":
            txt = localized(
                f"Requires targeted support and conceptual reinforcement in {d.domain_name}.",
                f"Requiere apoyo específico y refuerzo conceptual en {d.domain_name}.",
                f"Richiede un sostegno mirato e un rinforzo dei concetti in {d.domain_name}.",
            )
            areas_for_improvement.append(
                DomainFinding(
                    domain_id=d.domain_id,
                    text=txt,
                    evidence_refs=[d.evidence_ref],
                )
            )

    action_plan = []
    available_resource_ids = [r.resource_id for r in evidence.resources[:3]]
    primary_ref = (
        areas_for_improvement[0].evidence_refs
        if areas_for_improvement
        else [evidence.metrics.evidence_ref]
    )

    if areas_for_improvement:
        desc = localized(
            "Implement guided review sessions and structured practice on priority topics.",
            "Implementar sesiones guiadas de refuerzo y práctica estructurada en los contenidos prioritarios.",
            "Organizzare sessioni guidate di recupero ed esercizi strutturati sui contenuti prioritari.",
        )
    elif strengths:
        desc = localized(
            "Provide enrichment activities and practical applications to deepen learning.",
            "Proponer actividades de enriquecimiento y aplicación práctica para profundizar en los aprendizajes.",
            "Proporre attività di approfondimento e applicazioni pratiche per consolidare l'apprendimento.",
        )
    else:
        desc = localized(
            "Conduct an initial formative assessment to identify learning strengths and needs.",
            "Realizar una evaluación formativa inicial para identificar fortalezas y necesidades de aprendizaje.",
            "Svolgere una valutazione formativa iniziale per individuare punti di forza e bisogni di apprendimento.",
        )

    action_plan.append(
        PedagogicalAction(
            description=desc,
            resource_ids=available_resource_ids,
            evidence_refs=primary_ref,
        )
    )

    if not evidence.domains or all(d.score is None for d in evidence.domains):
        summary = localized(
            "Insufficient assessments available in the period to make a conclusive evaluation.",
            "No se dispone de evaluaciones suficientes en el periodo para emitir un diagnóstico concluyente.",
            "Nel periodo non sono disponibili valutazioni sufficienti per formulare una conclusione attendibile.",
        )
    elif strengths and areas_for_improvement:
        summary = localized(
            "The student shows varied performance: consolidated strengths in some domains and need for reinforcement in others.",
            "El estudiante muestra un rendimiento dispar: fortalezas consolidadas en ciertos dominios y necesidad de refuerzo en otros.",
            "Lo studente mostra risultati diversificati: punti di forza consolidati in alcuni ambiti e necessità di rinforzo in altri.",
        )
    elif strengths:
        summary = localized(
            "The student is progressing well, meeting curriculum objectives across evaluated domains.",
            "El estudiante progresa favorablemente alcanzando los objetivos curriculares en los dominios evaluados.",
            "Lo studente progredisce positivamente e raggiunge gli obiettivi curricolari negli ambiti valutati.",
        )
    else:
        summary = localized(
            "The student experiences difficulties across evaluated domains requiring continuous pedagogical intervention.",
            "El estudiante presenta dificultades en las áreas evaluadas que requieren intervención pedagógica continua.",
            "Lo studente presenta difficoltà negli ambiti valutati che richiedono un intervento didattico continuativo.",
        )

    title = localized(
        "Individual Pedagogical Report",
        "Informe Pedagógico Individual",
        "Relazione pedagogica individuale",
    )

    return StudentReportDocument(
        schema_version="1.0",
        report_type="student",
        language=evidence.request.language,
        title=title,
        summary=summary,
        strengths=strengths,
        areas_for_improvement=areas_for_improvement,
        action_plan=action_plan,
        limitations=list(evidence.limitations),
    )


async def generate_student_report_proposal(
    evidence: ReportEvidenceSnapshot,
) -> StudentReportGenerationResult:
    """Generates a candidate pedagogical report proposal adhering strictly to evidence constraints."""
    provider = get_structured_provider()

    system_prompt = (
        "You are an expert pedagogical assistant drafting an individual student evaluation report.\n"
        "Strict rules:\n"
        "1. Never invent diagnoses, scores, or facts.\n"
        "2. All domain findings in strengths MUST reference domains with classification 'consolidated_strength'.\n"
        "3. All domain findings in areas_for_improvement MUST reference domains with classification 'intervention'.\n"
        "4. Action plan resources MUST only use resource IDs listed in the evidence snapshot.\n"
        "When resources are available, at least one action MUST reference an available resource.\n"
        "5. If evidence has limitations, you MUST explain them under limitations.\n"
        f"6. Output MUST be entirely in the requested language: {evidence.request.language}. "
        "Translate evidence labels from other languages while preserving facts and identifiers.\n"
        "7. The report_type field MUST be exactly 'student'. Do not use 'individual_evaluation' or any other value."
    )

    user_prompt = f"Evidence Snapshot:\n{evidence.model_dump_json(indent=2)}"

    document = None
    try:
        gen_result = await provider.generate_structured(
            StructuredGenerationRequest(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                output_schema=StudentReportDocument.model_json_schema(),
                temperature=0.2,
                max_output_tokens=5000,
            )
        )
        if isinstance(gen_result.data, dict) and "summary" in gen_result.data:
            # report_type is a fixed protocol field owned by this endpoint. A
            # model may return a semantically similar label despite the enum
            # in the JSON schema, so normalize that metadata before applying
            # the strict Pydantic/evidence validation below.
            candidate_data = dict(gen_result.data)
            candidate_data["report_type"] = "student"
            doc_candidate = StudentReportDocument.model_validate(candidate_data)
            validate_document_evidence(doc_candidate, evidence)
            if evidence.resources and not any(
                action.resource_ids for action in doc_candidate.action_plan
            ):
                # Empty lists pass referential validation. Complete this omission
                # without replacing the provider's narrative or masking invalid IDs.
                if doc_candidate.action_plan:
                    doc_candidate.action_plan[0].resource_ids = [
                        resource.resource_id for resource in evidence.resources[:3]
                    ]
                else:
                    doc_candidate.action_plan = _build_fallback_document(evidence).action_plan
                validate_document_evidence(doc_candidate, evidence)
            # Ensure action_plan is never empty - if provider returned no actions, use fallback
            if not doc_candidate.action_plan:
                doc_candidate.action_plan = _build_fallback_document(evidence).action_plan
                validate_document_evidence(doc_candidate, evidence)
            document = doc_candidate
            provider_name = gen_result.provider_name
            model_name = gen_result.model_name
            model_version = gen_result.model_version
    except Exception as exc:
        if provider.provider_name != "mock":
            logger.exception("Configured AI provider failed during report generation")
            raise
        logger.warning(
            "Mock provider produced an invalid candidate (%s); using rule-based proposal",
            type(exc).__name__,
        )

    if document is None:
        document = _build_fallback_document(evidence)
        validate_document_evidence(document, evidence)
        provider_name = provider.provider_name
        model_name = provider.model_name
        model_version = "1.0.0"

    generated_at = datetime.datetime.now(datetime.timezone.utc)
    if generated_at < evidence.prepared_at:
        generated_at = evidence.prepared_at

    metadata = ReportGenerationMetadata(
        schema_version="1.0",
        request_id=uuid4(),
        evidence_snapshot_id=evidence.evidence_snapshot_id,
        generated_at=generated_at,
        provider=provider_name,
        model_name=model_name,
        model_version=model_version,
        prompt_version="pedagogical-student-report/1.1",
        request_schema_version="1.0",
        evidence_schema_version="1.0",
        document_schema_version="1.0",
        requires_professional_review=True,
    )

    return StudentReportGenerationResult(
        schema_version="1.0",
        evidence=evidence,
        document=document,
        metadata=metadata,
    )

