"""Tests for student pedagogical report drafting, validation, concurrency, and status lifecycle."""

import datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.report_generation import (
    DiagnosticEvidence,
    DomainEvidence,
    ReportEvidenceSnapshot,
    ReportMetrics,
    ReportPeriod,
    StudentReportGenerationRequest,
)
from app.services.report_generator import generate_student_report_proposal
from app.services.report_storage import save_student_report_record, update_report_status


client = TestClient(app)


def build_test_snapshot():
    student_id = uuid4()
    school_id = uuid4()
    req = StudentReportGenerationRequest(
        schema_version="1.0",
        student_id=student_id,
        period=ReportPeriod(start=datetime.date(2026, 1, 1), end=datetime.date(2026, 6, 30)),
        language="es",
    )
    d1 = DomainEvidence(
        evidence_ref="dom-6rp",
        domain_id="6.RP",
        domain_name="Razones y Proporciones",
        category_id="A",
        is_baseline=False,
        evaluations_count=2,
        total_questions=10,
        correct_questions=8,
        total_score_awarded=12.0,
        total_max_score=15.0,
        score=12.0,
        accuracy_percent=80.0,
        classification="consolidated_strength",
    )
    d2 = DomainEvidence(
        evidence_ref="dom-6ns",
        domain_id="6.NS",
        domain_name="Sistema Numérico",
        category_id="N",
        is_baseline=False,
        evaluations_count=2,
        total_questions=10,
        correct_questions=4,
        total_score_awarded=6.0,
        total_max_score=15.0,
        score=6.0,
        accuracy_percent=40.0,
        classification="intervention",
    )
    metrics = ReportMetrics(
        evidence_ref="metr-summary",
        tests_completed=2,
        total_evaluated_domains=2,
        curriculum_average=9.0,
        curriculum_average_percent=60.0,
        total_questions_answered=20,
        overall_accuracy_percent=60.0,
    )
    diag = DiagnosticEvidence(
        evidence_ref="diag-profile",
        has_recorded_diagnosis=False,
    )
    return ReportEvidenceSnapshot(
        schema_version="1.0",
        evidence_snapshot_id=uuid4(),
        prepared_at=datetime.datetime.now(datetime.timezone.utc),
        school_id=school_id,
        request=req,
        calculation_version="student-report-metrics/1.0",
        source_scope="authorized_period_assessments",
        source_complete=True,
        metrics=metrics,
        domains=[d1, d2],
        diagnostic=diag,
        stored_prediction=None,
        resources=[],
        limitations=["No se dispone de una predicción de apoyo almacenada."],
    )


def test_proposal_generation_adheres_to_evidence():
    import asyncio

    async def _test():
        snapshot = build_test_snapshot()
        result = await generate_student_report_proposal(snapshot)
        assert result.metadata.requires_professional_review is True
        assert result.document.language == "es"
        assert len(result.document.strengths) == 1
        assert result.document.strengths[0].domain_id == "6.RP"
        assert len(result.document.areas_for_improvement) == 1
        assert result.document.areas_for_improvement[0].domain_id == "6.NS"
        assert len(result.document.limitations) > 0

    asyncio.run(_test())


def test_italian_proposal_generation_uses_italian_narrative():
    import asyncio

    snapshot = build_test_snapshot()
    italian_request = snapshot.request.model_copy(update={"language": "it"})
    italian_domains = [
        domain.model_copy(update={"domain_name": name})
        for domain, name in zip(
            snapshot.domains,
            ("Rapporti e proporzioni", "Il sistema numerico"),
            strict=True,
        )
    ]
    snapshot = snapshot.model_copy(update={
        "request": italian_request,
        "domains": italian_domains,
        "limitations": ["Non è disponibile una previsione di sostegno salvata."],
    })

    result = asyncio.run(generate_student_report_proposal(snapshot))
    assert result.document.language == "it"
    assert result.document.title == "Relazione pedagogica individuale"
    assert "Lo studente" in result.document.summary
    assert "sessioni guidate" in result.document.action_plan[0].description


def test_draft_and_save_unauthenticated():
    resp1 = client.post("/ai/reports/student/draft", json={
        "student_id": str(uuid4()),
        "period_start": "2026-01-01",
        "period_end": "2026-06-30",
        "language": "es"
    })
    assert resp1.status_code == 401

    resp2 = client.post("/ai/reports/student/save", json={
        "student_id": str(uuid4()),
        "document": {},
        "evidence_snapshot": {},
    })
    assert resp2.status_code == 401


def test_concurrency_conflict_on_mismatched_version():
    mock_db = MagicMock()
    mock_db.__enter__.return_value = mock_db
    mock_cur = MagicMock()
    mock_db.cursor.return_value.__enter__.return_value = mock_cur
    
    # Existing report in DB has version 2
    mock_cur.fetchone.return_value = {"id": uuid4(), "version": 2, "status": "generated"}

    snapshot = build_test_snapshot()
    import asyncio
    result = asyncio.run(generate_student_report_proposal(snapshot))

    with patch("app.services.report_storage._get_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            save_student_report_record(
                student_id=snapshot.request.student_id,
                school_id=snapshot.school_id,
                class_id=None,
                teacher_user_id=uuid4(),
                document=result.document,
                evidence_snapshot=snapshot.model_dump(mode="json"),
                expected_version=1,  # teacher viewed version 1, but db has version 2
                report_id=uuid4(),
            )
        assert exc_info.value.status_code == 409
        assert "concurrent_modification" in str(exc_info.value.detail)


def test_locked_status_prevents_silent_overwrite():
    mock_db = MagicMock()
    mock_db.__enter__.return_value = mock_db
    mock_cur = MagicMock()
    mock_db.cursor.return_value.__enter__.return_value = mock_cur
    
    # Existing report in DB is finalized
    mock_cur.fetchone.return_value = {"id": uuid4(), "version": 1, "status": "finalized"}

    snapshot = build_test_snapshot()
    import asyncio
    result = asyncio.run(generate_student_report_proposal(snapshot))

    with patch("app.services.report_storage._get_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            save_student_report_record(
                student_id=snapshot.request.student_id,
                school_id=snapshot.school_id,
                class_id=None,
                teacher_user_id=uuid4(),
                document=result.document,
                evidence_snapshot=snapshot.model_dump(mode="json"),
                expected_version=1,
                report_id=uuid4(),
                supersedes_report_id=None,  # Not superseding!
            )
        assert exc_info.value.status_code == 409
        assert "locked" in str(exc_info.value.detail)


def test_status_transitions():
    mock_db = MagicMock()
    mock_db.__enter__.return_value = mock_db
    mock_cur = MagicMock()
    mock_db.cursor.return_value.__enter__.return_value = mock_cur

    report_id = uuid4()

    # 1. generated -> reviewed
    mock_cur.fetchone.side_effect = [
        {"id": report_id, "status": "generated", "version": 1},
        {"id": report_id, "status": "reviewed", "version": 1, "reviewed_at": datetime.datetime.now(datetime.timezone.utc), "finalized_at": None},
    ]
    with patch("app.services.report_storage._get_db", return_value=mock_db):
        res = update_report_status(report_id, "reviewed")
        assert res["status"] == "reviewed"

    # 2. invalid transition: reviewed -> generated (not allowed)
    mock_cur.fetchone.side_effect = [
        {"id": report_id, "status": "reviewed", "version": 1},
    ]
    with patch("app.services.report_storage._get_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            update_report_status(report_id, "generated")
        assert exc_info.value.status_code == 400


def test_relational_authorization_scenarios():
    import asyncio
    from app.services.report_evidence import resolve_report_authorization

    async def _test():
        student_id = uuid4()
        school_a = uuid4()
        school_b = uuid4()

        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_cur = MagicMock()
        mock_db.cursor.return_value.__enter__.return_value = mock_cur

        # Mock directus HTTP responses
        def make_mock_client(user_data, student_data, user_status=200, student_status=200):
            mock_client = MagicMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None

            async def mock_get(url, params=None):
                resp = MagicMock()
                if "users/me" in url:
                    resp.status_code = user_status
                    resp.json.return_value = {"data": user_data}
                elif f"items/student_profiles/{student_id}" in url:
                    resp.status_code = student_status
                    resp.json.return_value = {"data": student_data}
                return resp

            mock_client.get = mock_get
            return mock_client

        # Case 1: Student role is rejected
        user_student = {"id": str(uuid4()), "role": "role-stud", "school_id": str(school_a)}
        stud_data = {"id": str(student_id), "school_id": str(school_a), "first_name": "Ana", "last_name": "G"}
        mock_cur.fetchone.side_effect = [{"name": "Student"}]

        with patch("app.services.report_evidence.httpx.AsyncClient", return_value=make_mock_client(user_student, stud_data)):
            with patch("app.services.report_evidence._get_db", return_value=mock_db):
                with pytest.raises(HTTPException) as exc:
                    await resolve_report_authorization(student_id, None, "dummy-token")
                assert exc.value.status_code == 403
                assert "student_role_cannot_generate_reports" in str(exc.value.detail)

        # Case 2: Director of different school is rejected
        user_director_diff = {"id": str(uuid4()), "role": "role-dir", "school_id": str(school_b)}
        mock_cur.fetchone.side_effect = [{"name": "Director"}]

        with patch("app.services.report_evidence.httpx.AsyncClient", return_value=make_mock_client(user_director_diff, stud_data)):
            with patch("app.services.report_evidence._get_db", return_value=mock_db):
                with pytest.raises(HTTPException) as exc:
                    await resolve_report_authorization(student_id, None, "dummy-token")
                assert exc.value.status_code == 403
                assert "director_different_school" in str(exc.value.detail)

        # Case 3: Teacher NOT assigned to student's class is rejected (knowledge of ID is not enough)
        user_teacher = {"id": str(uuid4()), "role": "role-teach", "school_id": str(school_a)}
        mock_cur.fetchone.side_effect = [
            {"name": "Teacher"},  # role check
            None,                 # class_teachers join yields None
        ]

        with patch("app.services.report_evidence.httpx.AsyncClient", return_value=make_mock_client(user_teacher, stud_data)):
            with patch("app.services.report_evidence._get_db", return_value=mock_db):
                with pytest.raises(HTTPException) as exc:
                    await resolve_report_authorization(student_id, None, "dummy-token")
                assert exc.value.status_code == 403
                assert "teacher_not_assigned_to_student" in str(exc.value.detail)

        # Case 4: Teacher assigned to student's class is authorized
        mock_cur.fetchone.side_effect = [
            {"name": "Teacher"},  # role check
            {"assigned": 1},      # class_teachers join yields record
            {"id": school_a, "name": "Colegio Central"}, # school
        ]

        with patch("app.services.report_evidence.httpx.AsyncClient", return_value=make_mock_client(user_teacher, stud_data)):
            with patch("app.services.report_evidence._get_db", return_value=mock_db):
                auth = await resolve_report_authorization(student_id, None, "dummy-token")
                assert auth["student"]["id"] == str(student_id)
                assert auth["school"]["name"] == "Colegio Central"

    asyncio.run(_test())


def test_proposal_handles_recorded_diagnosis_without_inventing_new():
    import asyncio
    snapshot = build_test_snapshot()
    # Mark existing diagnosis strictly without clinical text
    snapshot.diagnostic = DiagnosticEvidence(
        evidence_ref="diag-existing",
        has_recorded_diagnosis=True,
    )
    result = asyncio.run(generate_student_report_proposal(snapshot))
    assert result.metadata.requires_professional_review is True
    # Verify no diagnostic conclusions are invented in narrative
    assert "diagnóstico" not in result.document.summary.lower() or "registrado" in result.document.summary.lower()

