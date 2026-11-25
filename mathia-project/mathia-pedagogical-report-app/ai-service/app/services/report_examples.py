"""Local, fictional layout fixtures. Never exposed by the production API.

Run from ai-service: python -m app.services.report_examples
"""

import json
from copy import deepcopy
from pathlib import Path
from uuid import UUID

from app.schemas.report_generation import StudentReportGenerationResult
from app.schemas.report_presentation import ReportIdentity
from app.services.report_generation import generated_report_record
from app.services.report_pdf import render_student_report_pdf
from app.services.report_presentation import present_student_report

ROOT = Path(__file__).resolve().parents[3]
EXAMPLES = ROOT / "data" / "reports" / "examples"
REPORT_ID = UUID("00000000-0000-4000-8000-000000000010")
IDENTITY = ReportIdentity(
    student_name="Lucía Muñoz (fictitious / ficticia)",
    school_name="Centro de ejemplo / Example school",
    class_name="6.º A",
)


def example_record(language: str = "en", *, long: bool = False, empty: bool = False):
    source = "without-assessments" if empty else "without-prediction"
    value = json.loads((EXAMPLES / f"{source}.result.json").read_text(encoding="utf-8"))
    if language == "es":
        value["evidence"]["request"]["language"] = "es"
        document = value["document"]
        document["language"] = "es"
        document["title"] = "Informe pedagógico individual"
        document["summary"] = (
            "No hay evaluaciones suficientes para caracterizar el rendimiento."
            if empty
            else "El rendimiento varía entre los dos dominios evaluados."
        )
        document["limitations"] = [
            "No hay evaluaciones disponibles en el periodo solicitado."
            if empty
            else "No se dispone de una predicción de apoyo almacenada."
        ]
        value["evidence"]["limitations"] = document["limitations"]
        document["action_plan"][0]["description"] = (
            "Recoger una evaluación inicial antes de extraer conclusiones."
            if empty
            else "Practicar los números con actividades guiadas y comprobar la comprensión."
        )
        value["evidence"]["domains"][0]["domain_name"] = "Razones y proporciones"
        if not empty:
            value["evidence"]["domains"][1]["domain_name"] = "Números"
            value["evidence"]["resources"][0]["title"] = "Práctica de números"
            document["strengths"][0]["text"] = "Las tareas de proporciones muestran 12/15 puntos."
            document["areas_for_improvement"][0]["text"] = (
                "Las tareas numéricas requieren refuerzo."
            )
    if language == "it":
        value["evidence"]["request"]["language"] = "it"
        document = value["document"]
        document["language"] = "it"
        document["title"] = "Relazione pedagogica individuale"
        document["summary"] = (
            "Le valutazioni non sono sufficienti per descrivere i risultati."
            if empty
            else "I risultati variano tra i due ambiti valutati."
        )
        document["limitations"] = [
            "Nessuna valutazione disponibile nel periodo richiesto."
            if empty
            else "Non è disponibile una previsione di sostegno salvata."
        ]
        value["evidence"]["limitations"] = document["limitations"]
        document["action_plan"][0]["description"] = (
            "Raccogliere una valutazione iniziale prima di trarre conclusioni."
            if empty
            else "Esercitare il calcolo con attività guidate e verificare la comprensione."
        )
        value["evidence"]["domains"][0]["domain_name"] = "Rapporti e proporzioni"
        if not empty:
            value["evidence"]["domains"][1]["domain_name"] = "Numeri"
            value["evidence"]["resources"][0]["title"] = "Esercizi sui numeri"
            document["strengths"][0]["text"] = "Le attività sulle proporzioni mostrano 12/15 punti."
            document["areas_for_improvement"][0]["text"] = "Le attività numeriche richiedono rinforzo."
    if long:
        base = deepcopy(value["document"]["action_plan"][0])
        text = (
            "Observar la estrategia utilizada, ofrecer ejemplos graduados y registrar los avances. "
            "Conversar sobre la solución y adaptar el próximo ejercicio "
            "a la comprensión observada. "
            if language == "es"
            else (
                "Osservare la strategia, proporre esempi graduati e registrare i progressi. "
                "Discutere la soluzione e adattare l'esercizio successivo alla comprensione osservata. "
                if language == "it"
                else "Observe the strategy, offer graded examples and record progress. "
                "Discuss the solution and adapt the next exercise to the understanding observed. "
            )
        )
        value["document"]["action_plan"] = [
            {**base, "description": f"{base['description']}\n{text * 6}"}
            for _ in range(8)
        ]
    return generated_report_record(StudentReportGenerationResult.model_validate(value))


def example_presentation(language: str = "en", *, long: bool = False, empty: bool = False):
    record = example_record(language, long=long, empty=empty)
    urls = {
        resource.resource_id: "https://example.org/"
        + ("practice/" * 50 if long else "practice")
        + "?topic=numbers&language="
        + language
        for resource in record.structured_content.evidence.resources
    }
    return present_student_report(REPORT_ID, record, IDENTITY, urls)


def main():
    directory = ROOT / "output" / "pdf"
    directory.mkdir(parents=True, exist_ok=True)
    for language in ("en", "es", "it"):
        for variant in ("short", "long", "empty"):
            presentation = example_presentation(
                language, long=variant == "long", empty=variant == "empty"
            )
            name = f"{variant}-{language}"
            (directory / f"{name}.json").write_text(
                presentation.model_dump_json(indent=2), encoding="utf-8"
            )
            (directory / f"{name}.pdf").write_bytes(render_student_report_pdf(presentation))
            print(f"Created {name}.pdf and {name}.json")


if __name__ == "__main__":
    main()
