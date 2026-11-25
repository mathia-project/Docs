"""Opt-in local-stack smoke test; creates and removes only its own fictional rows.

Set MATHIA_REPORT_PDF_LIVE=1 and DIRECTUS_ADMIN_EMAIL/PASSWORD,
SEED_TEACHER_EMAIL/PASSWORD, SEED_DIRECTOR_EMAIL/PASSWORD,
SEED_STUDENTS_JSON using the local seed configuration before running this test.
"""

import json
import os
from uuid import uuid4

import httpx
import pytest

from app.schemas.report_generation import StudentReportRecord
from app.services.report_examples import example_record
from app.services.report_generation import render_report_text

pytestmark = pytest.mark.skipif(
    os.getenv("MATHIA_REPORT_PDF_LIVE") != "1", reason="requires opt-in local Directus stack"
)


def test_real_directus_relational_access_and_pdf():
    directus_url = os.getenv("REPORT_TEST_DIRECTUS_URL", "http://localhost:8055")
    api_url = os.getenv("REPORT_TEST_API_URL", "http://localhost:8000")
    created = []
    with httpx.Client(base_url=directus_url, timeout=20) as directus:

        def login(email, password):
            response = directus.post("/auth/login", json={"email": email, "password": password})
            assert response.status_code == 200, "Local test identity could not authenticate"
            return {"Authorization": "Bearer " + response.json()["data"]["access_token"]}

        admin = login(os.environ["DIRECTUS_ADMIN_EMAIL"], os.environ["DIRECTUS_ADMIN_PASSWORD"])
        teacher = login(os.environ["SEED_TEACHER_EMAIL"], os.environ["SEED_TEACHER_PASSWORD"])
        director = login(os.environ["SEED_DIRECTOR_EMAIL"], os.environ["SEED_DIRECTOR_PASSWORD"])
        student_config = json.loads(os.environ["SEED_STUDENTS_JSON"])[0]
        student = login(student_config["email"], student_config["password"])

        def create(collection, values):
            # Supply a unique ID so cleanup never targets pre-existing data.
            identifier = str(uuid4())
            response = directus.post(
                f"/items/{collection}", json={**values, "id": identifier}, headers=admin
            )
            assert response.status_code == 200, (
                f"Could not create {collection}: {response.status_code}"
            )
            created.append((collection, identifier))
            return response.json()["data"]

        def create_report(school_id, student_id, class_id):
            record = example_record("es").model_dump(mode="json")
            record.update(school_id=school_id, student_id=student_id, class_id=class_id)
            evidence = record["structured_content"]["evidence"]
            evidence["school_id"] = school_id
            evidence["request"].update(student_id=student_id, class_id=class_id)
            record["title"] = "PDF smoke test - fictional temporary report"
            record["structured_content"]["document"]["title"] = record["title"]
            document = example_record("es").structured_content.document
            document.title = record["title"]
            record["narrative"] = render_report_text(document)
            StudentReportRecord.model_validate(record)
            return create("pedagogical_reports", record)

        try:
            response = directus.get(
                "/items/classes",
                headers=teacher,
                params={
                    "fields": "id,school_id",
                    "limit": 1,
                },
            )
            assert response.status_code == 200 and response.json()["data"], "No assigned test class"
            classroom = response.json()["data"][0]
            assigned_student = create(
                "student_profiles",
                {
                    "school_id": classroom["school_id"],
                    "first_name": "PDF fixture",
                    "last_name": "Temporary fictional student",
                    "active": True,
                },
            )
            create(
                "class_students",
                {
                    "school_id": classroom["school_id"],
                    "class_id": classroom["id"],
                    "student_id": assigned_student["id"],
                    "active": True,
                },
            )
            assigned_report = create_report(
                classroom["school_id"], assigned_student["id"], classroom["id"]
            )
            foreign_school = create(
                "schools",
                {
                    "name": "PDF fixture temporary school",
                    "code": "PDF-TEST",
                    "slug": f"pdf-test-{uuid4()}",
                },
            )
            foreign_student = create(
                "student_profiles",
                {
                    "school_id": foreign_school["id"],
                    "first_name": "PDF fixture",
                    "last_name": "Foreign fictional student",
                },
            )
            foreign_report = create_report(foreign_school["id"], foreign_student["id"], None)
            with httpx.Client(base_url=api_url, timeout=30) as api:
                own_path = f"/ai/reports/student/{assigned_report['id']}"
                preview = api.get(own_path, headers=teacher)
                assert preview.status_code == 200, preview.text
                revision = preview.json()["revision"]
                downloaded = api.get(
                    own_path + "/pdf", params={"revision": revision}, headers=teacher
                )
                assert downloaded.status_code == 200, downloaded.text[:100]
                assert downloaded.content.startswith(b"%PDF")
                assert downloaded.headers["cache-control"] == "private, no-store"
                assert api.get(own_path, headers=director).status_code == 200
                assert (
                    api.get(
                        own_path + "/pdf", params={"revision": revision}, headers=student
                    ).status_code
                    == 404
                )
                for denied_identity in (teacher, director, student):
                    path = f"/ai/reports/student/{foreign_report['id']}"
                    assert api.get(path, headers=denied_identity).status_code == 404
                    assert (
                        api.get(
                            path + "/pdf", params={"revision": revision}, headers=denied_identity
                        ).status_code
                        == 404
                    )
                assert (
                    api.get(
                        own_path + "/pdf", params={"revision": "0" * 64}, headers=teacher
                    ).status_code
                    == 409
                )
        finally:
            errors = []
            for collection, identifier in reversed(created):
                response = directus.delete(f"/items/{collection}/{identifier}", headers=admin)
                if response.status_code not in {200, 204}:
                    errors.append(f"{collection}/{identifier}: {response.status_code}")
            assert not errors, "Temporary fixture cleanup failed: " + ", ".join(errors)
