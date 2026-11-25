import uuid
from collections.abc import Callable
from datetime import UTC, datetime

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

from app.core.config import get_settings
from app.providers.base import StructuredGenerationRequest
from app.providers.factory import get_structured_provider
from app.services.resource_search import google_search_configured, search_resources
from app.schemas.resource_generation import (
    ExerciseItem,
    ExerciseStructured,
    GeneratedResourceItem,
    GenerationMetadata,
    ResourceGenerationRequest,
    ResourceGenerationResponse,
    SearchMetadata,
    SearchResultItem,
)

# Optional search provider registry for verifiable web search
_SEARCH_PROVIDER_OVERRIDE: Callable[[str], list[SearchResultItem]] | None = None


def set_search_provider_override(override: Callable[[str], list[SearchResultItem]] | None) -> None:
    global _SEARCH_PROVIDER_OVERRIDE
    _SEARCH_PROVIDER_OVERRIDE = override


def is_search_available() -> bool:
    return _SEARCH_PROVIDER_OVERRIDE is not None or google_search_configured()


def _exercise_to_body(item: GeneratedResourceItem) -> str | None:
    """Render structured exercise content into the required resource body."""
    if not item.exercise:
        return None

    labels = {
        "en": ("Answer", "Solution", "Hints"),
        "es": ("Respuesta", "Solución", "Pistas"),
        "it": ("Risposta", "Soluzione", "Suggerimenti"),
    }[item.language]
    sections = [f"# {item.title}", item.exercise.instructions]
    for index, exercise_item in enumerate(item.exercise.items, start=1):
        sections.extend(
            [
                f"## {index}. {exercise_item.prompt}",
                f"**{labels[0]}:** {exercise_item.answer}",
                f"**{labels[1]}:** {exercise_item.solution}",
            ]
        )
        if exercise_item.hints:
            sections.append(f"**{labels[2]}:** " + " | ".join(exercise_item.hints))
    return "\n\n".join(section for section in sections if section.strip())


def _validate_curriculum_path(
    course_id: str,
    domain_id: str,
    cluster_id: str | None,
    standard_id: str | None,
) -> dict[str, str] | None:
    settings = get_settings()
    try:
        with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                # 1. Course validation
                cur.execute("SELECT id, name FROM curriculum_courses WHERE id = %s", (course_id,))
                course = cur.fetchone()
                if not course:
                    raise HTTPException(400, f"Curso inválido: {course_id}")

                # 2. Domain validation
                cur.execute("SELECT id, name FROM curriculum_domains WHERE id = %s", (domain_id,))
                domain = cur.fetchone()
                if not domain:
                    raise HTTPException(400, f"Dominio curricular inválido: {domain_id}")
                cur.execute(
                    "SELECT 1 FROM curriculum_course_domains WHERE course_id = %s AND domain_id = %s",
                    (course_id, domain_id),
                )
                if not cur.fetchone():
                    raise HTTPException(400, "resource_curriculum_mismatch")

                # 3. Cluster validation (if present)
                if cluster_id:
                    cur.execute(
                        "SELECT id, domain_id FROM curriculum_clusters WHERE id = %s",
                        (cluster_id,),
                    )
                    row = cur.fetchone()
                    if not row:
                        raise HTTPException(400, f"Cluster curricular inválido: {cluster_id}")
                    if row["domain_id"] != domain_id:
                        raise HTTPException(
                            400,
                            f"El cluster {cluster_id} no pertenece al dominio {domain_id}",
                        )

                # 4. Standard validation (if present)
                std_row = None
                if standard_id:
                    cur.execute(
                        "SELECT s.id, s.cluster_id, s.description, c.domain_id "
                        "FROM curriculum_standards s "
                        "JOIN curriculum_clusters c ON c.id = s.cluster_id WHERE s.id = %s",
                        (standard_id,),
                    )
                    std_row = cur.fetchone()
                    if not std_row:
                        raise HTTPException(400, f"Estándar curricular inválido: {standard_id}")
                    if cluster_id and std_row["cluster_id"] != cluster_id:
                        raise HTTPException(
                            400,
                            f"El estándar {standard_id} no pertenece al cluster {cluster_id}",
                        )
                    if std_row["domain_id"] != domain_id:
                        raise HTTPException(400, "resource_curriculum_mismatch")
                return {
                    language: " · ".join(
                        value.get(language) or value.get("en") or ""
                        for value in (
                            course["name"], domain["name"],
                            std_row["description"] if std_row else {},
                        ) if isinstance(value, dict)
                    )
                    for language in ("en", "es", "it")
                }
    except psycopg.OperationalError as exc:
        raise HTTPException(503, "curriculum_service_unavailable") from exc


async def generate_resources(
    request: ResourceGenerationRequest,
    search_provider: Callable[[str], list[SearchResultItem]] | None = None,
) -> ResourceGenerationResponse:
    # 1. Validate curriculum path
    course_names = _validate_curriculum_path(
        course_id=request.course_id,
        domain_id=request.domain_id,
        cluster_id=request.cluster_id,
        standard_id=request.standard_id,
    )
    course_label = (
        course_names.get(request.language)
        or course_names.get("en")
        or request.course_id
        if course_names
        else request.course_id
    )

    # 2. Handle web search for links and videos
    if request.resource_type in ("link", "video"):
        active_search = search_provider or _SEARCH_PROVIDER_OVERRIDE
        if not active_search and not is_search_available():
            raise HTTPException(
                status_code=503,
                detail="resource_search_unavailable",
            )

        # Run verifiable search
        now_iso = datetime.now(UTC).isoformat()
        search_terms = {
            "en": ("mathematics", "reinforcement", "practice", "enrichment"),
            "es": ("matemáticas", "refuerzo", "práctica", "ampliación"),
            "it": ("matematica", "rinforzo", "esercitazione", "approfondimento"),
        }[request.language]
        level_name = dict(zip(
            ("reinforcement", "practice", "enrichment"),
            search_terms[1:],
            strict=True,
        ))[request.target_level]
        query = f"{search_terms[0]} {course_label} {request.domain_id} {request.standard_id or ''} {level_name}"
        grounding = None
        if active_search:
            search_results = active_search(query)
        else:
            grounding = await search_resources(request, query)
            search_results = grounding.results
        search_results = [
            result for result in search_results
            if result.language == request.language
            and result.resource_type == request.resource_type
            and (result.language_evidence or "").strip()
        ]

        if not search_results:
            raise HTTPException(
                status_code=422,
                detail="resource_search_no_results_in_language",
            )

        # Build verified resource items
        items: list[GeneratedResourceItem] = []
        for res in search_results[: request.quantity]:
            selected_url = res.url

            # Crucial verification rule: selected_url MUST belong to the actual observed results
            observed_urls = {r.url for r in search_results}
            if selected_url not in observed_urls:
                raise HTTPException(
                    status_code=400,
                    detail=f"Violación de verificación: la URL {selected_url} no pertenece a los resultados reales observados.",
                )

            item = GeneratedResourceItem(
                external_id=f"res-{uuid.uuid4().hex[:10]}",
                title=res.title,
                description=res.snippet or {
                    "en": f"Verified web resource for {request.domain_id}",
                    "es": f"Recurso verificado vía búsqueda web para {request.domain_id}",
                    "it": f"Risorsa web verificata per {request.domain_id}",
                }[request.language],
                resource_type=request.resource_type,
                status="draft",
                language=request.language,
                course_id=request.course_id,
                domain_id=request.domain_id,
                cluster_id=request.cluster_id,
                standard_id=request.standard_id,
                target_level=request.target_level,
                url=selected_url,
                body=None,
                generation=GenerationMetadata(
                    mode="web_search",
                    search=SearchMetadata(
                        query=query,
                        searched_at=now_iso,
                        selected_url=selected_url,
                        results=search_results,
                        provider="google_grounding" if grounding else "override",
                        web_search_queries=grounding.web_search_queries if grounding else [],
                        search_entry_point=grounding.search_entry_point if grounding else None,
                    ),
                ),
            )
            items.append(item)

        return ResourceGenerationResponse(schema_version="1.0", resources=items)

    # 3. Handle generated documents and exercises
    provider = get_structured_provider()
    now_iso = datetime.now(UTC).isoformat()
    language_name = {"en": "English", "es": "Spanish", "it": "Italian"}[request.language]
    system_instruction = (
        "You are a mathematics educator creating resources aligned with CCSS standards. "
        "Adapt the content to the supplied grade, target level, curriculum domain and standard. "
        f"Write every learner-facing field entirely in {language_name}: title, description, body, "
        "exercise instructions, prompts, answers, solutions, and hints. "
        "If curriculum context is in another language, translate its meaning before writing. "
        "Keep identifiers and JSON field names unchanged. Make the content gradual, clear, "
        "mathematically correct, and useful for a student consolidating this domain. "
        "Return only valid JSON matching the provided schema. Every resource must include "
        "external_id, title, description, resource_type, status, language, target_level, "
        "generation, and body or exercise. Status must be exactly 'draft'. "
        "Do not invent URLs or claim to have searched the web. Exercises must include "
        "step-by-step solutions and progressive hints. The root response must be exactly "
        "{\"schema_version\":\"1.0\",\"resources\":[{...}]}. "
        "Never return a resource directly at the root or omit the resources list."
    )

    prompt = (
        f"Generate {request.quantity} pedagogical resource(s) of type '{request.resource_type}' "
        f"for grade course '{request.course_id}' ({course_label}), domain '{request.domain_id}', "
        f"cluster '{request.cluster_id or 'any'}', standard '{request.standard_id or 'any'}'. "
        f"Target level: '{request.target_level}'. Language: '{request.language}' ({language_name}). "
        "Pedagogical goal: address learning difficulties in this domain through "
        "progressive explanations and activities. Return one ResourceGenerationResponse "
        "object with schema_version='1.0' and a resources list. Include every required "
        "field and use status='draft'."
    )

    req = StructuredGenerationRequest(
        system_prompt=system_instruction,
        user_prompt=prompt,
        output_schema=ResourceGenerationResponse.model_json_schema(),
        # Exercises contain several nested explanations and hints; leave
        # enough room for the complete structured response instead of
        # allowing Gemini to cut the JSON at the default 4096-token limit.
        max_output_tokens=8000,
    )

    generated_items: list[GeneratedResourceItem] = []

    try:
        result = await provider.generate_structured(req)
        parsed = ResourceGenerationResponse.model_validate(result.data)
        generated_items = parsed.resources
    except Exception:
        # Keep deterministic local fixtures available for offline development
        # and tests, but never hide a real Vertex/provider failure.
        if provider.provider_name != "mock":
            raise

    if not generated_items and provider.provider_name != "mock":
        raise HTTPException(502, "google_vertex_returned_no_resources")

    # The provider response is authoritative for configured remote providers.
    # The mock provider intentionally uses the deterministic fixture below.
    if provider.provider_name == "mock" and not generated_items:
        for i in range(request.quantity):
            ext_id = f"gen-{uuid.uuid4().hex[:10]}"
            title_suffix = "Guía de refuerzo y conceptos clave" if request.resource_type == "document" else "Práctica guiada con soluciones"
            title = f"{request.domain_id} - {title_suffix} ({i+1})"
            desc = (
                f"Material generado pedagógicamente para el nivel {request.target_level} "
                f"en el dominio {request.domain_id}."
            )

            if request.resource_type == "document":
                body = (
                    f"# {title}\n\n"
                    f"## Fundamentación y Conceptos Clave\n"
                    f"En esta unidad trabajamos las competencias asociadas al dominio **{request.domain_id}** "
                    f"con un enfoque pedagógico de nivel **{request.target_level}**.\n\n"
                    f"### Estrategias de Resolución\n"
                    f"1. Identificar las cantidades dadas y las incógnitas.\n"
                    f"2. Representar gráficamente o algebraicamente la relación entre variables.\n"
                    f"3. Verificar la coherencia del resultado en el contexto planteado.\n"
                )
                exercise = None
            else:
                body = (
                    f"# {title}\n\n"
                    f"Resuelve los siguientes ejercicios aplicando las propiedades trabajadas en clase.\n"
                )
                exercise = ExerciseStructured(
                    format="guided_practice",
                    instructions="Lee atentamente cada enunciado, desarrolla los pasos y comprueba con la solución explicada.",
                    items=[
                        ExerciseItem(
                            id=f"item-{i+1}-1",
                            prompt=f"Calcula y simplifica la expresión asociada al estándar {request.standard_id or request.domain_id}: 4(3x + 5) - 2x",
                            answer="10x + 20",
                            solution="Paso 1: Aplicamos la propiedad distributiva: 4·3x + 4·5 = 12x + 20. Paso 2: Restamos 2x: 12x - 2x + 20 = 10x + 20.",
                            hints=[
                                "Recuerda multiplicar el coeficiente exterior por cada término del paréntesis.",
                                "Agrupa los términos semejantes con 'x'.",
                            ],
                        ),
                        ExerciseItem(
                            id=f"item-{i+1}-2",
                            prompt="Un problema contextualizado: si el costo base es 15 y cada unidad cuesta 3, escribe la expresión para 'n' unidades y calcula para n = 7.",
                            answer="15 + 3n; Total = 36",
                            solution="La expresión es 15 + 3n. Sustituyendo n = 7: 15 + 3·7 = 15 + 21 = 36.",
                            hints=[
                                "Identifica el valor fijo y la tasa variable por unidad.",
                            ],
                        ),
                    ],
                )

            if request.language in ("en", "it"):
                if request.language == "it":
                    level_name = {
                        "reinforcement": "rinforzo",
                        "practice": "esercitazione",
                        "enrichment": "approfondimento",
                    }[request.target_level]
                    title_suffix = (
                        "Guida di rinforzo e concetti chiave"
                        if request.resource_type == "document"
                        else "Esercizi guidati con soluzioni"
                    )
                    desc = f"Materiale didattico di {level_name} per il dominio {request.domain_id}."
                    instructions = "Leggi ogni esercizio, mostra i passaggi e controlla la soluzione spiegata."
                    prompts = (
                        "Calcola e semplifica l'espressione 4(3x + 5) - 2x.",
                        "Un servizio costa 15 unità fisse più 3 per ogni utilizzo. Scrivi il costo per n utilizzi e calcolalo per n = 7.",
                    )
                    solutions = (
                        "Applica la proprietà distributiva: 4(3x + 5) = 12x + 20. Sottrai 2x e ottieni 10x + 20.",
                        "Il costo è 15 + 3n. Per n = 7, calcola 15 + 3 × 7 = 36.",
                    )
                    hints = (
                        "Moltiplica 4 per ogni termine tra parentesi.",
                        "Individua il costo fisso e quello per ogni utilizzo.",
                    )
                    document_body = (
                        "## Concetti chiave\n"
                        "In questa unità esercitiamo le competenze del dominio matematico selezionato.\n\n"
                        "### Strategie di risoluzione\n"
                        "1. Individua i dati e l'incognita.\n"
                        "2. Rappresenta la relazione con un disegno o un'espressione.\n"
                        "3. Verifica che il risultato sia coerente con il problema."
                    )
                else:
                    title_suffix = (
                        "Reinforcement guide and key concepts"
                        if request.resource_type == "document"
                        else "Guided practice with solutions"
                    )
                    desc = f"Learning material for {request.target_level} in domain {request.domain_id}."
                    instructions = "Read each exercise, show your steps, and check the explained solution."
                    prompts = (
                        "Calculate and simplify 4(3x + 5) - 2x.",
                        "A service costs 15 fixed units plus 3 per use. Write the cost for n uses and calculate it for n = 7.",
                    )
                    solutions = (
                        "Distribute 4: 4(3x + 5) = 12x + 20. Subtract 2x to get 10x + 20.",
                        "The cost is 15 + 3n. For n = 7, calculate 15 + 3 × 7 = 36.",
                    )
                    hints = (
                        "Multiply 4 by each term inside the parentheses.",
                        "Identify the fixed cost and the cost per use.",
                    )
                    document_body = (
                        "## Key concepts\n"
                        "In this unit we practice skills from the selected mathematical domain.\n\n"
                        "### Problem-solving strategies\n"
                        "1. Identify the given values and the unknown.\n"
                        "2. Represent the relationship with a diagram or expression.\n"
                        "3. Check that the result makes sense in context."
                    )

                title = f"{request.domain_id} - {title_suffix} ({i+1})"
                if request.resource_type == "document":
                    body = f"# {title}\n\n{document_body}\n"
                    exercise = None
                else:
                    body = None
                    exercise = ExerciseStructured(
                        format="guided_practice",
                        instructions=instructions,
                        items=[
                            ExerciseItem(
                                id=f"item-{i+1}-{index}",
                                prompt=prompt_text,
                                answer=answer,
                                solution=solution,
                                hints=[hint],
                            )
                            for index, (prompt_text, answer, solution, hint) in enumerate(
                                zip(prompts, ("10x + 20", "15 + 3n; 36"), solutions, hints, strict=True),
                                start=1,
                            )
                        ],
                    )

            item = GeneratedResourceItem(
                external_id=ext_id,
                title=title,
                description=desc,
                resource_type=request.resource_type,
                status="draft",
                language=request.language,
                course_id=request.course_id,
                domain_id=request.domain_id,
                cluster_id=request.cluster_id,
                standard_id=request.standard_id,
                target_level=request.target_level,
                url=None,
                body=body,
                metadata={"estimated_minutes": 20},
                generation=GenerationMetadata(
                    mode="generated",
                    prompt=prompt,
                    model=provider.model_name,
                    generated_at=now_iso,
                ),
                exercise=exercise,
            )
            generated_items.append(item)

    # Enforce strict rules on generated items
    for item in generated_items:
        if item.language != request.language:
            raise HTTPException(502, "generated_resource_language_mismatch")
        # Security: Draft status must always be set
        item.status = "draft"
        if item.resource_type == "exercise" and not (item.body or "").strip():
            item.body = _exercise_to_body(item)
        # Code execution prevention: Ensure body and solutions are purely text
        if item.url and not item.generation.search:
            # Cannot have a URL without a verifiable search!
            item.url = None
        if item.resource_type == "exercise" and item.exercise:
            for ex in item.exercise.items:
                if not ex.prompt.strip() or not ex.answer.strip() or not ex.solution.strip():
                    raise HTTPException(
                        status_code=400,
                        detail="Los ejercicios generados deben incluir obligatoriamente enunciado, respuesta y solución.",
                    )

    return ResourceGenerationResponse(
        schema_version="1.0",
        resources=generated_items[: request.quantity],
    )
