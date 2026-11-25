# Mathia FastAPI

Service for scoring, trusted-model inference and structured generation of questions, resources and reports. Directus owns authentication, permissions and CRUD.

The root [local setup](../README.md) uses the mock provider without external credentials. OpenAPI documentation is available at http://localhost:8000/docs.

For development outside Docker, use Python 3.14 in a virtual environment, install requirements-dev.txt, and configure connections using the environment settings in app/core/config.py. Run `python -m uvicorn app.main:app --reload` from this directory.

Checks:

```bash
python -m pytest
python -m ruff check app tests
python -m app.schemas.export_report_schemas --check
```

The live report test requires a local stack and explicit activation with MATHIA_REPORT_PDF_LIVE=1; it is skipped by default. Other tests do not require Google Cloud.

The Vertex AI adapter is retained for integrations with independently supplied credentials. The local Compose file fixes generation to mock and mounts no cloud credentials.
