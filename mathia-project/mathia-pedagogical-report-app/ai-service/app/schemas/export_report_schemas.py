"""Run from ai-service: python -m app.schemas.export_report_schemas [--check]."""

import argparse
import json
from pathlib import Path

from app.schemas.report_generation import (
    ReportEvidenceSnapshot,
    ReportGenerationMetadata,
    StudentReportDocument,
    StudentReportGenerationRequest,
    StudentReportGenerationResult,
    StudentReportRecord,
)

SCHEMA_DIRECTORY = Path(__file__).resolve().parents[3] / "data" / "reports"
SCHEMA_MODELS = {
    "request": StudentReportGenerationRequest,
    "evidence": ReportEvidenceSnapshot,
    "document": StudentReportDocument,
    "metadata": ReportGenerationMetadata,
    "result": StudentReportGenerationResult,
    "record": StudentReportRecord,
}


def schema_text(name: str) -> str:
    schema = SCHEMA_MODELS[name].model_json_schema(mode="validation")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    return json.dumps(schema, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name in SCHEMA_MODELS:
        path = SCHEMA_DIRECTORY / f"report-generation-{name}.schema.json"
        expected = schema_text(name)
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != expected:
                raise SystemExit(f"Schema out of date: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
