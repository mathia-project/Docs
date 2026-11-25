from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.main import create_app
from app.schemas.report_generation import StudentReportRecord
from app.services import report_reader
from app.services.report_examples import IDENTITY, REPORT_ID, example_presentation, example_record
from app.services.report_generation import render_report_text
from app.services.report_pdf import render_student_report_pdf
from app.services.report_presentation import present_student_report, safe_resource_url


@pytest.mark.parametrize("language", ["en", "es", "it"])
@pytest.mark.parametrize("variant", ["short", "long", "empty"])
def test_pdf_matches_every_preview_block_and_is_repeatable(language, variant):
    report = example_presentation(language, long=variant == "long", empty=variant == "empty")
    content = render_student_report_pdf(report)
    assert content == render_student_report_pdf(report)
    pdf = PdfReader(BytesIO(content))
    text = " ".join(" ".join(page.extract_text().split()) for page in pdf.pages)
    assert report.title in text
    assert "Lucía Muñoz" in text
    for detail in report.details:
        assert detail.value in text
    for section in report.sections:
        assert section.title in text
        for block in section.blocks:
            assert " ".join(block.text.split()) in text
            for link in block.links:
                assert link.title in text
    for index, page in enumerate(pdf.pages, 1):
        assert f"{report.page_label} {index}" in page.extract_text()
        assert report.status_label in page.extract_text()
    links = [
        annotation.get_object()["/A"]["/URI"]
        for page in pdf.pages
        for annotation in page.get("/Annots", [])
        if annotation.get_object().get("/A", {}).get("/S") == "/URI"
    ]
    if variant == "long":
        assert len(pdf.pages) >= 3
        assert any(len(url) > 400 for url in links)
    elif variant == "empty":
        assert not links
    else:
        assert len(pdf.pages) <= 2
        assert links


def test_markup_is_literal_and_cannot_load_images_or_create_links():
    report = example_presentation()
    payload = '<img src="https://example.org/secret"/> <b>Literal & safe</b>'
    report.sections[0].blocks[0].text = payload
    pdf = PdfReader(BytesIO(render_student_report_pdf(report)))
    assert payload in pdf.pages[0].extract_text()
    assert not any(page.images for page in pdf.pages)


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "file:///secret",
        "data:text/html,hello",
        "//example.org",
        "https://user:secret@example.org",
        "https://example.org/\npath",
        "https://[bad",
        None,
    ],
)
def test_unsafe_links_are_rejected(url):
    assert safe_resource_url(url) is None


@pytest.mark.parametrize("status", ["generated", "reviewed", "finalized", "archived"])
def test_review_status_is_derived_from_saved_record(status):
    values = example_record().model_dump(mode="json")
    values["status"] = status
    if status in {"reviewed", "finalized"}:
        values["reviewed_at"] = "2026-09-28T09:00:00Z"
    if status == "finalized":
        values["finalized_at"] = "2026-09-28T10:00:00Z"
    report = present_student_report(REPORT_ID, StudentReportRecord.model_validate(values), IDENTITY)
    assert report.status == status
    assert report.is_draft == (status in {"generated", "archived"})


@pytest.fixture
def directus_stub(monkeypatch):
    """Exercise real routes/reader/renderer; replace only Directus HTTP transport."""
    state = {"record": example_record().model_dump(mode="json"), "requests": [], "deny": None}

    def handle(request):
        state["requests"].append(request)
        assert request.method == "GET"
        token = request.headers["authorization"]
        if token in {"Bearer unrelated-teacher", "Bearer foreign-director", "Bearer student"}:
            return httpx.Response(403, json={"errors": [{"message": "Forbidden"}]})
        if token == "Bearer expired":
            return httpx.Response(401)
        assert token == "Bearer assigned-teacher"
        collection = request.url.path.split("/")[2]
        if collection == state["deny"]:
            return httpx.Response(403)
        record = state["record"]
        values = {
            "pedagogical_reports": record,
            "student_profiles": {
                "first_name": "Lucía",
                "last_name": "Muñoz",
                "school_id": record["school_id"],
            },
            "schools": {"name": "Example school"},
            "classes": {"name": "6 A", "school_id": record["school_id"]},
            "resources": [
                {
                    "id": "00000000-0000-4000-8000-000000000005",
                    "url": "https://example.org/practice?a=1&b=2",
                }
            ],
        }
        return httpx.Response(200, json={"data": values[collection]})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        report_reader.httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handle)),
    )
    return state


PATH = f"/ai/reports/student/{REPORT_ID}"
AUTH = {"Authorization": "Bearer assigned-teacher"}


def test_preview_and_download_use_same_saved_version(directus_stub):
    with TestClient(create_app()) as client:
        preview = client.get(PATH, headers=AUTH)
        assert preview.status_code == 200
        assert preview.headers["cache-control"] == "private, no-store"
        response = client.get(f"{PATH}/pdf?revision={preview.json()['revision']}", headers=AUTH)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"].endswith('-v1.pdf"')
        assert response.headers["cache-control"] == "private, no-store"
        assert (
            preview.json()["title"] in PdfReader(BytesIO(response.content)).pages[0].extract_text()
        )
        # Every request, including the download, re-reads Directus using the user's token.
        assert len(directus_stub["requests"]) == 10


@pytest.mark.parametrize(
    "token,code",
    [
        (None, 401),
        ("", 401),
        ("expired", 401),
        ("unrelated-teacher", 404),
        ("foreign-director", 404),
        ("student", 404),
    ],
)
def test_identity_without_directus_access_cannot_preview_or_download(directus_stub, token, code):
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    with TestClient(create_app()) as client:
        assert client.get(PATH, headers=headers).status_code == code
        assert client.get(f"{PATH}/pdf?revision={'a' * 64}", headers=headers).status_code == code
    if not token:
        assert not directus_stub["requests"]
    else:
        assert all("pedagogical_reports" in str(r.url) for r in directus_stub["requests"])


def test_concurrent_edit_requires_refresh_even_when_version_number_is_unchanged(directus_stub):
    with TestClient(create_app()) as client:
        preview = client.get(PATH, headers=AUTH).json()
        record = StudentReportRecord.model_validate(directus_stub["record"])
        record.structured_content.document.summary = "A human edited this saved summary."
        record.narrative = render_report_text(record.structured_content.document)
        directus_stub["record"] = record.model_dump(mode="json")
        response = client.get(f"{PATH}/pdf?revision={preview['revision']}", headers=AUTH)
        assert response.status_code == 409
        assert response.json()["detail"] == "report_revision_changed"


def test_revoked_access_is_checked_again_on_download(directus_stub):
    with TestClient(create_app()) as client:
        preview = client.get(PATH, headers=AUTH).json()
        directus_stub["deny"] = "pedagogical_reports"
        response = client.get(f"{PATH}/pdf?revision={preview['revision']}", headers=AUTH)
        assert response.status_code == 404


def test_legacy_drafts_are_not_rendered(directus_stub):
    directus_stub["record"]["structured_content"] = {"student": {"full_name": "Legacy"}}
    with TestClient(create_app()) as client:
        assert client.get(PATH, headers=AUTH).status_code == 409


def test_resource_access_can_be_revoked_without_exposing_links(directus_stub):
    directus_stub["deny"] = "resources"
    with TestClient(create_app()) as client:
        response = client.get(PATH, headers=AUTH)
        assert response.status_code == 200
        assert "https://example.org" not in response.text
        assert "Number practice" in response.text


def test_identity_access_is_required(directus_stub):
    directus_stub["deny"] = "student_profiles"
    with TestClient(create_app()) as client:
        assert client.get(PATH, headers=AUTH).status_code == 404
