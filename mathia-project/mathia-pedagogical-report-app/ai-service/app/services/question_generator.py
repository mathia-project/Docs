"""Service for validating curriculum routes and generating structured questions with AI."""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings
from app.providers.base import StructuredGenerationRequest
from app.providers.factory import get_structured_provider
from app.schemas.question_generation import (
    CurriculumRoute,
    GeneratedAnswerConfig,
    GeneratedOption,
    GeneratedQuestionItem,
    QuestionBatchDocument,
    QuestionGenerationMetadata,
    QuestionGenerationRequest,
    QuestionGenerationResult,
)

logger = logging.getLogger("ai_service.question_generator")


def _load_reference_questions(
    *, standard_code: str, question_type: str, language: str, limit: int = 12
) -> list[dict[str, Any]]:
    """Load local examples used as style/context and duplicate-avoidance input."""
    root = Path(os.getenv("AI_REFERENCE_DATA_DIR", "/app/data"))
    path = root / "questions" / f"example-question-batch.{language}.json"
    if not path.exists():
        path = root / "questions" / "example-question-batch.es.json"
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    questions = document.get("questions", []) if isinstance(document, dict) else []
    return [
        {
            "prompt": item.get("prompt"),
            "options": item.get("options", []),
            "correct_options": item.get("correct_options", []),
            "explanation": item.get("explanation"),
        }
        for item in questions
        if isinstance(item, dict)
        and item.get("question_type") == question_type
        and item.get("curriculum", {}).get("standard_code") == standard_code
    ][:limit]


def _get_db_connection():
    settings = get_settings()
    return psycopg.connect(
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        row_factory=dict_row,
    )


def validate_curriculum_route(
    course_id: str,
    domain_id: str,
    cluster_id: str,
    standard_id: str,
    substandard_id: str | None = None,
) -> dict[str, Any]:
    """Validates relational hierarchy of course -> domain -> cluster -> standard -> substandard against PostgreSQL."""
    conn = _get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Course
            cur.execute("SELECT id, grade_level, name FROM curriculum_courses WHERE id = %s AND active = true;", (course_id,))
            course = cur.fetchone()
            if not course:
                raise ValueError(f"Course '{course_id}' not found or inactive")

            # 2. Domain & alignment to course
            cur.execute(
                """
                SELECT d.id, d.code, d.name
                FROM curriculum_domains d
                JOIN curriculum_course_domains cd ON cd.domain_id = d.id
                WHERE (d.id = %s OR d.code = %s) AND cd.course_id = %s AND d.active = true;
                """,
                (domain_id, domain_id, course_id),
            )
            domain = cur.fetchone()
            if not domain:
                raise ValueError(f"Domain '{domain_id}' does not belong to course '{course_id}' or is inactive")

            # 3. Cluster & parent domain
            cur.execute(
                """
                SELECT c.id, c.code, c.name, c.domain_id
                FROM curriculum_clusters c
                WHERE (c.id = %s OR c.code = %s) AND c.domain_id = %s AND c.active = true;
                """,
                (cluster_id, cluster_id, domain["id"]),
            )
            cluster = cur.fetchone()
            if not cluster:
                raise ValueError(f"Cluster '{cluster_id}' does not belong to domain '{domain['code']}'")

            # 4. Standard & parent cluster
            cur.execute(
                """
                SELECT s.id, s.code, s.ccss_id, s.description, s.cluster_id
                FROM curriculum_standards s
                WHERE (s.id = %s OR s.code = %s OR s.ccss_id = %s) AND s.cluster_id = %s AND s.active = true;
                """,
                (standard_id, standard_id, standard_id, cluster["id"]),
            )
            standard = cur.fetchone()
            if not standard:
                raise ValueError(f"Standard '{standard_id}' does not belong to cluster '{cluster['code']}'")

            substandard = None
            if substandard_id:
                cur.execute(
                    """
                    SELECT sub.id, sub.code, sub.ccss_id, sub.description, sub.standard_id
                    FROM curriculum_substandards sub
                    WHERE (sub.id = %s OR sub.code = %s OR sub.ccss_id = %s) AND sub.standard_id = %s AND sub.active = true;
                    """,
                    (substandard_id, substandard_id, substandard_id, standard["id"]),
                )
                substandard = cur.fetchone()
                if not substandard:
                    raise ValueError(f"Substandard '{substandard_id}' does not belong to standard '{standard['code']}'")

            return {
                "course": dict(course),
                "domain": dict(domain),
                "cluster": dict(cluster),
                "standard": dict(standard),
                "substandard": dict(substandard) if substandard else None,
            }
    finally:
        conn.close()


def _build_fallback_questions(
    req: QuestionGenerationRequest,
    curr_info: dict[str, Any],
) -> list[GeneratedQuestionItem]:
    """Generates deterministic questions adhering to the schema when mock provider or offline fallback is used."""
    domain_code = curr_info["domain"]["code"]
    cluster_code = curr_info["cluster"]["code"]
    std_code = curr_info["standard"]["code"] or curr_info["standard"]["ccss_id"]
    sub_code = (curr_info["substandard"]["code"] or curr_info["substandard"]["ccss_id"]) if curr_info.get("substandard") else None
    
    std_desc = curr_info["standard"]["description"]
    if isinstance(std_desc, dict):
        desc_text = std_desc.get(req.language) or std_desc.get("es") or std_desc.get("en") or ""
    else:
        desc_text = str(std_desc)

    questions: list[GeneratedQuestionItem] = []
    base_hash = hashlib.sha256(f"{std_code}-{req.difficulty}-{req.language}-{req.request_id or '0'}".encode()).hexdigest()[:6]

    for i in range(1, req.quantity + 1):
        ext_id = f"AI-{std_code.replace('.', '')}-{base_hash}-{i:02d}"
        curriculum_route = CurriculumRoute(
            domain_code=domain_code,
            cluster_code=cluster_code,
            standard_code=std_code,
            substandard_code=sub_code,
        )

        if req.question_type == "single_choice":
            if req.language == "es":
                prompt = f"Pregunta {i} sobre el estándar {std_code}: ¿Cuál de las siguientes afirmaciones describe correctamente el concepto de {desc_text[:60]}?"
                explanation = f"La opción A es la respuesta correcta conforme al estándar pedagógico {std_code}."
                options = [
                    GeneratedOption(key="A", content=f"Opción correcta representativa del estándar {std_code} (ejemplo {i})."),
                    GeneratedOption(key="B", content=f"Distractor común número 1 para el estándar {std_code}."),
                    GeneratedOption(key="C", content="Distractor de error procedimental número 2."),
                    GeneratedOption(key="D", content="Distractor de concepción errónea número 3."),
                ]
            elif req.language == "it":
                prompt = f"Domanda {i}: quale affermazione descrive correttamente il concetto matematico?"
                explanation = "La risposta A è corretta."
                options = [
                    GeneratedOption(key="A", content="L'affermazione che soddisfa le condizioni descritte."),
                    GeneratedOption(key="B", content="L'affermazione che non soddisfa le condizioni descritte."),
                    GeneratedOption(key="C", content="L'affermazione che applica erroneamente il procedimento."),
                    GeneratedOption(key="D", content="L'affermazione che confonde due concetti diversi."),
                ]
            else:
                prompt = f"Question {i} regarding standard {std_code}: Which of the following statements correctly represents {desc_text[:60]}?"
                explanation = f"Option A is the correct answer according to educational standard {std_code}."
                options = [
                    GeneratedOption(key="A", content=f"Correct answer aligned with standard {std_code} (item {i})."),
                    GeneratedOption(key="B", content="Plausible misconception distractor 1."),
                    GeneratedOption(key="C", content="Procedural calculation error distractor 2."),
                    GeneratedOption(key="D", content="Conceptual confusion distractor 3."),
                ]
            questions.append(
                GeneratedQuestionItem(
                    external_id=ext_id,
                    question_type="single_choice",
                    prompt=prompt,
                    options=options,
                    correct_options=["A"],
                    explanation=explanation,
                    difficulty=req.difficulty,
                    language=req.language,
                    curriculum=curriculum_route,
                    answer_config={},
                )
            )

        elif req.question_type == "multiple_choice":
            if req.language == "es":
                prompt = f"Pregunta {i} sobre {std_code}: Selecciona todas las opciones que sean equivalentes o verdaderas para {desc_text[:60]}."
                explanation = "Las opciones A y C son correctas tras aplicar las propiedades del estándar."
                options = [
                    GeneratedOption(key="A", content=f"Primera propiedad válida para {std_code}."),
                    GeneratedOption(key="B", content="Propiedad incorrecta con error de signo."),
                    GeneratedOption(key="C", content="Segunda propiedad válida que verifica la igualdad."),
                    GeneratedOption(key="D", content="Afirmación incorrecta basada en falsa analogía."),
                ]
            elif req.language == "it":
                prompt = f"Domanda {i}: seleziona tutte le affermazioni corrette."
                explanation = "Le risposte A e C sono corrette."
                options = [
                    GeneratedOption(key="A", content="La prima proprietà valida."),
                    GeneratedOption(key="B", content="Una proprietà errata a causa di un errore di segno."),
                    GeneratedOption(key="C", content="La seconda proprietà valida."),
                    GeneratedOption(key="D", content="Un'affermazione errata basata su un'analogia impropria."),
                ]
            else:
                prompt = f"Question {i} on {std_code}: Select all statements that are true regarding {desc_text[:60]}."
                explanation = "Options A and C are correct following standard properties."
                options = [
                    GeneratedOption(key="A", content=f"First valid property for {std_code}."),
                    GeneratedOption(key="B", content="Invalid statement with sign error."),
                    GeneratedOption(key="C", content="Second valid property verifying the condition."),
                    GeneratedOption(key="D", content="False statement based on common analogy error."),
                ]
            questions.append(
                GeneratedQuestionItem(
                    external_id=ext_id,
                    question_type="multiple_choice",
                    prompt=prompt,
                    options=options,
                    correct_options=["A", "C"],
                    explanation=explanation,
                    difficulty=req.difficulty,
                    language=req.language,
                    curriculum=curriculum_route,
                    answer_config={},
                )
            )

        elif req.question_type == "true_false":
            is_true = (i % 2 == 1)
            if req.language == "es":
                prompt = f"Pregunta {i} ({std_code}): Indique si la siguiente proposición es verdadera o falsa: En el contexto de {desc_text[:50]}, la relación es siempre proporcional."
                explanation = f"La afirmación es {'verdadera' if is_true else 'falsa'} según los fundamentos del estándar {std_code}."
                options = [
                    GeneratedOption(key="A", content="Verdadero"),
                    GeneratedOption(key="B", content="Falso"),
                ]
            elif req.language == "it":
                prompt = f"Domanda {i}: indica se l'affermazione è vera o falsa."
                explanation = f"L'affermazione è {'vera' if is_true else 'falsa'}."
                options = [
                    GeneratedOption(key="A", content="Vero"),
                    GeneratedOption(key="B", content="Falso"),
                ]
            else:
                prompt = f"Question {i} ({std_code}): State whether the following proposition is true or false: Under {desc_text[:50]}, the relation is always proportional."
                explanation = f"The statement is {'true' if is_true else 'false'} according to standard {std_code}."
                options = [
                    GeneratedOption(key="A", content="True"),
                    GeneratedOption(key="B", content="False"),
                ]
            questions.append(
                GeneratedQuestionItem(
                    external_id=ext_id,
                    question_type="true_false",
                    prompt=prompt,
                    options=options,
                    correct_options=["A" if is_true else "B"],
                    explanation=explanation,
                    difficulty=req.difficulty,
                    language=req.language,
                    curriculum=curriculum_route,
                    answer_config={},
                )
            )

        elif req.question_type == "numeric":
            target_val = float(10 + i * 5)
            if req.language == "es":
                prompt = f"Pregunta numérica {i} ({std_code}): Calcula el valor exacto para la siguiente situación de {desc_text[:50]} con factor k = {i + 2}."
                explanation = f"El cálculo directo conduce a {target_val}."
            elif req.language == "it":
                prompt = f"Domanda numerica {i}: calcola il valore richiesto."
                explanation = f"Il calcolo diretto dà {target_val}."
            else:
                prompt = f"Numeric question {i} ({std_code}): Compute the exact value for the scenario of {desc_text[:50]} with factor k = {i + 2}."
                explanation = f"Direct evaluation yields {target_val}."
            questions.append(
                GeneratedQuestionItem(
                    external_id=ext_id,
                    question_type="numeric",
                    prompt=prompt,
                    options=[],
                    correct_options=[],
                    explanation=explanation,
                    difficulty=req.difficulty,
                    language=req.language,
                    curriculum=curriculum_route,
                    answer_config=GeneratedAnswerConfig(correct_value=target_val, tolerance=0.0),
                )
            )

    # Fallback content must never expose internal curriculum identifiers or
    # implementation labels to students/teachers.
    for question in questions:
        clean_description = desc_text.strip().rstrip(".!?")
        if req.language == "es":
            if req.question_type == "single_choice":
                question.prompt = f"¿Cuál de las siguientes afirmaciones describe correctamente {clean_description}?"
            elif req.question_type == "multiple_choice":
                question.prompt = f"Selecciona todas las afirmaciones correctas sobre {clean_description}."
            elif req.question_type == "true_false":
                question.prompt = f"Indica si la siguiente afirmación es verdadera o falsa: {clean_description}."
            else:
                question.prompt = f"Resuelve el siguiente problema relacionado con {clean_description}."
        elif req.language == "it":
            # Curriculum seed descriptions are currently English/Spanish.
            # Keep the deterministic mock content Italian until an Italian
            # curriculum translation is available.
            if req.question_type == "single_choice":
                question.prompt = "Quale affermazione descrive correttamente il concetto matematico?"
            elif req.question_type == "multiple_choice":
                question.prompt = "Seleziona tutte le affermazioni matematiche corrette."
            elif req.question_type == "true_false":
                question.prompt = "Indica se l'affermazione matematica è vera o falsa."
            else:
                question.prompt = "Risolvi il seguente problema matematico."
        else:
            if req.question_type == "single_choice":
                question.prompt = f"Which statement correctly describes {clean_description}?"
            elif req.question_type == "multiple_choice":
                question.prompt = f"Select all statements that are correct about {clean_description}."
            elif req.question_type == "true_false":
                question.prompt = f"State whether the following statement is true or false: {clean_description}."
            else:
                question.prompt = f"Solve the following problem related to {clean_description}."
        if question.explanation:
            question.explanation = {
                "es": "La opción seleccionada es correcta.",
                "en": "The selected option is correct.",
                "it": "La risposta selezionata è corretta.",
            }[req.language]
        if req.question_type == "single_choice" and question.options:
            if req.language == "es":
                clean_options = {
                    "A": "La afirmación que cumple correctamente las condiciones descritas.",
                    "B": "La afirmación que no cumple las condiciones descritas.",
                    "C": "La afirmación que aplica incorrectamente el procedimiento.",
                    "D": "La afirmación que confunde el concepto con otro diferente.",
                }
            elif req.language == "it":
                clean_options = {
                    "A": "L'affermazione che soddisfa correttamente le condizioni descritte.",
                    "B": "L'affermazione che non soddisfa le condizioni descritte.",
                    "C": "L'affermazione che applica erroneamente il procedimento.",
                    "D": "L'affermazione che confonde il concetto con un altro.",
                }
            else:
                clean_options = {
                    "A": "The statement that correctly satisfies the described conditions.",
                    "B": "The statement that does not satisfy the described conditions.",
                    "C": "The statement that applies the procedure incorrectly.",
                    "D": "The statement that confuses the concept with a different one.",
                }
            for option in question.options:
                if option.key in clean_options:
                    option.content = clean_options[option.key]

    return questions


async def generate_questions_proposal(
    request: QuestionGenerationRequest,
) -> QuestionGenerationResult:
    """Validates the curriculum route, calls the provider, and returns validated questions."""
    # 1. Validate relational curriculum route in PostgreSQL
    curr_info = validate_curriculum_route(
        course_id=request.course_id,
        domain_id=request.domain_id,
        cluster_id=request.cluster_id,
        standard_id=request.standard_id,
        substandard_id=request.substandard_id,
    )

    domain_code = curr_info["domain"]["code"]
    cluster_code = curr_info["cluster"]["code"]
    std_code = curr_info["standard"]["code"] or curr_info["standard"]["ccss_id"]
    sub_code = (curr_info["substandard"]["code"] or curr_info["substandard"]["ccss_id"]) if curr_info.get("substandard") else None

    # 2. Get Structured Generation Provider
    provider = get_structured_provider()

    system_prompt = (
        "You are an expert pedagogical mathematics assessment creator. "
        "Generate assessment questions strictly conforming to the requested CCSS standard, difficulty, and language. "
        "Write every student-facing prompt, option, explanation, and feedback entirely in the requested language. "
        "If curriculum descriptions or reference examples are in another language, translate their meaning; do not copy their wording. "
        "Return valid JSON matching the question import schema. Never invent nonexistent curriculum codes."
    )

    std_desc = curr_info["standard"]["description"]
    desc_str = (
        std_desc.get(request.language) or std_desc.get("en") or std_desc.get("es") or ""
        if isinstance(std_desc, dict)
        else str(std_desc)
    )
    reference_questions = _load_reference_questions(
        standard_code=std_code,
        question_type=request.question_type,
        language=request.language,
    )
    reference_json = json.dumps(reference_questions, ensure_ascii=False)
    language_name = {"en": "English", "es": "Spanish", "it": "Italian"}[request.language]
    course_names = curr_info["course"].get("name") or {}
    course_label = (
        course_names.get(request.language)
        or course_names.get("en")
        or request.course_id
        if isinstance(course_names, dict)
        else request.course_id
    )

    user_prompt = (
        f"Generate {request.quantity} assessment questions for:\n"
        f"- Grade/Course: {request.course_id} ({course_label})\n"
        f"- Domain: {domain_code}\n"
        f"- Cluster: {cluster_code}\n"
        f"- Standard: {std_code} ({desc_str})\n"
        f"- Substandard: {sub_code or 'None'}\n"
        f"- Question Type: {request.question_type}\n"
        f"- Difficulty: {request.difficulty}\n"
        f"- Language: {request.language} ({language_name})\n\n"
        f"Reference examples from the question bank (use only for style; do not copy or repeat them):\n{reference_json}\n\n"
        f"Rules:\n"
        f"1. Produce exactly {request.quantity} questions in the 'questions' array.\n"
        f"2. Each question's curriculum must have domain_code='{domain_code}', cluster_code='{cluster_code}', standard_code='{std_code}', substandard_code={json.dumps(sub_code)}.\n"
        f"3. For '{request.question_type}', adhere strictly to options and answer_config rules.\n"
        "4. Every question must be autonomous and understandable without seeing this prompt, the curriculum route, or any other question. "
        "Never mention standard codes, curriculum identifiers, item numbers, examples, distractors, or internal metadata in prompts, options, or explanations. "
        "Write natural, complete pedagogical questions with enough context to solve them. "
        "Every generated question must use a different scenario, values, wording, and correct answer from the other generated questions and from the reference examples."
    )

    gen_request = StructuredGenerationRequest(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        output_schema=QuestionBatchDocument.model_json_schema(),
        temperature=0.3,
        # Question batches can take longer than the provider's default deadline.
        timeout_seconds=120.0,
        # A batch can contain up to 25 questions with options and explanations.
        # 3000 tokens is not enough for even a small batch and makes Gemini
        # return MAX_TOKENS, which used to be silently replaced by the generic
        # deterministic fallback below. Keep a bounded per-question budget so
        # small requests remain economical while larger batches can complete.
        max_output_tokens=min(32768, max(6000, request.quantity * 1500)),
    )

    questions: list[GeneratedQuestionItem] = []
    generated_at = datetime.datetime.now(datetime.UTC).isoformat()
    req_id = request.request_id or hashlib.sha256(f"{std_code}-{generated_at}".encode()).hexdigest()[:12]

    try:
        response = await provider.generate_structured(gen_request)
        if isinstance(response.data, dict) and "questions" in response.data:
            doc = QuestionBatchDocument.model_validate(response.data)
            questions = doc.questions
        else:
            questions = _build_fallback_questions(request, curr_info)
    except Exception as exc:
        if provider.provider_name != "mock":
            # Never present deterministic placeholder questions as if they had
            # been generated by the configured external provider. The API
            # route will expose the failure so the UI can report it honestly.
            logger.exception("Configured AI provider failed during question generation")
            raise
        logger.warning(
            "Mock provider failed or returned unparseable content (%s); using deterministic curriculum fallback",
            exc,
        )
        questions = _build_fallback_questions(request, curr_info)

    # 3. Post-validation: ensure each question's curriculum codes and IDs are canonical and unique
    validated_questions: list[GeneratedQuestionItem] = []
    seen_ids = set()
    for idx, q in enumerate(questions, start=1):
        # Force curriculum codes to match server validation
        q.curriculum.domain_code = domain_code
        q.curriculum.cluster_code = cluster_code
        q.curriculum.standard_code = std_code
        q.curriculum.substandard_code = sub_code
        q.difficulty = request.difficulty
        if provider.provider_name != "mock" and q.language != request.language:
            raise ValueError("Generated question language does not match the request")
        q.language = request.language
        q.question_type = request.question_type

        # Ensure unique, stable external_id
        if not q.external_id or q.external_id in seen_ids:
            q.external_id = f"AI-{std_code.replace('.', '')}-{req_id[:6]}-{idx:02d}"
        seen_ids.add(q.external_id)

        # Validate with Pydantic
        item = GeneratedQuestionItem.model_validate(q.model_dump())
        validated_questions.append(item)

    return QuestionGenerationResult(
        schema_version="1.0",
        questions=validated_questions,
        metadata=QuestionGenerationMetadata(
            provider=provider.provider_name,
            model_name=provider.model_name,
            request_id=req_id,
            generated_at=generated_at,
            total_generated=len(validated_questions),
            curriculum_summary={
                "course_id": request.course_id,
                "domain_code": domain_code,
                "cluster_code": cluster_code,
                "standard_code": std_code,
                "substandard_code": sub_code,
            },
        ),
    )
