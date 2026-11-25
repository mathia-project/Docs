# Mathia Pedagogical Report

**English** | [Español](README.es.md)

An educational application for managing schools, classes, students, resources, tests, and pedagogical reports. Built with SolidJS, Directus, PostgreSQL, and FastAPI.

## Local setup

Requirements: Docker with Compose v2 and Python 3.11 or later. Docker must be running. The first installation requires an Internet connection to download images and dependencies. You do not need Node.js or a separate Python installation for the service: the containers include their runtime environments.

From this directory, on Windows:

```powershell
py scripts/bootstrap.py
```

On Linux or macOS:

```bash
python3 scripts/bootstrap.py
```

The setup script creates `.env` with random passwords, builds the images, and waits for the services to start. PostgreSQL initializes the schema; the Directus bootstrap configures collections, relationships, roles, and permissions, then creates a school, a class, and fictional test accounts. It does not import data from an existing installation.

| Service | Default address |
| --- | --- |
| Application | http://localhost:5173 |
| Directus administration | http://localhost:8055 |
| FastAPI documentation | http://localhost:8000/docs |
| FastAPI health check | http://localhost:8000/health |

The accounts are `admin@example.com`, `director@example.com`, `teacher@example.com`, `student@example.com`, and `student2@example.com`. Their passwords are stored in the local `.env` file: `DIRECTUS_ADMIN_PASSWORD`, `SEED_DIRECTOR_PASSWORD`, `SEED_TEACHER_PASSWORD`, and the `password` fields in `SEED_STUDENTS_JSON`. Use the email sign-in tab for these demo accounts.

Accounts are created on the first startup. Changing a seed password in `.env` does not change the password in an initialized database; use Directus Admin to update it.

## Configuration

To review or customize the configuration before starting:

```bash
python scripts/bootstrap.py --configure-only
```

Edit `.env`, then run the setup script again. If you change `APP_PORT`, `DIRECTUS_PORT`, or `AI_SERVICE_PORT`, also update the corresponding URLs and CORS origins. On Linux/macOS, use `python3` if that is the name of your interpreter.

Generation uses the `mock` provider, and external search is disabled in Docker Compose. Generative results are simulated for testing workflows and do not represent Gemini responses. Local educational model inference uses the artifact included in `ai-service/modelo_integrado/`; only trusted artifacts should be loaded. This distribution includes no Google Cloud keys, credentials, project identifiers, or credential mounts. The Vertex AI adapter remains in the source code for a future integration using your own credentials.

## Local operation

```bash
docker compose ps -a
docker compose logs --tail=100
docker compose stop
```

To start again, run `scripts/bootstrap.py`. The setup script preserves `.env` and existing volumes. The `directus-bootstrap` container should exit with code `0`; the remaining services should be healthy.

To stop and remove the containers while preserving data:

```bash
docker compose down
```

To delete **all local data** for this installation and initialize it from scratch:

```bash
docker compose down --volumes
python scripts/bootstrap.py
```

Services are bound exclusively to `127.0.0.1`. This configuration uses HTTP for local testing. PostgreSQL data, uploads, and snapshots are stored in Docker volumes belonging to the `mathia-local` project.

## Structure

```text
app/                 SolidJS SPA, translations, and tests
ai-service/          FastAPI, providers, model, and tests
directus/bootstrap/  Relationships, roles, permissions, and seed data
directus/migrations/ Integrity between business tables and Directus
postgres/            Schema, migrations, and SQL checks
data/                Curriculum catalog and import examples
docs/                Contracts and import formats
scripts/bootstrap.py Local setup script
```

PostgreSQL is the source of truth. Directus manages authentication and CRUD, with relational permissions scoped by school and class. FastAPI handles calculations, inference, and reports; the SPA consumes the APIs. The curriculum catalog is bundled as files so this directory can be transferred without depending on a Git submodule.

## Development and validation

To develop outside the containers, install a Node.js version compatible with `app/package.json` and Python 3.14 for the service and its model.

```bash
cd app
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

From `ai-service`, create and activate a virtual environment, then install `requirements-dev.txt`:

```bash
python -m pip install -r requirements-dev.txt
python -m pytest
python -m ruff check app tests
python -m app.schemas.export_report_schemas --check
```

From `directus/bootstrap`:

```bash
npm test
npm run validate
```

## Publishing the code

Copy the contents of this directory into the destination repository, including `.gitignore`, `.env.example`, and the other hidden configuration files. Do not copy a generated `.env`, dependency directories, or test outputs. Git history, databases, uploads, and backups are not included.

The code retains the GPL-3.0 license provided in [LICENSE](LICENSE). Dependencies retain their own licenses. The curriculum catalog comes from [CCSS-Mapping](https://github.com/andrejfranulic/CCSS-Mapping); its records retain their source information.
