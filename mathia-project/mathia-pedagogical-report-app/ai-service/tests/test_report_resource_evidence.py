"""Resource evidence regression tests; PostgreSQL cases use temporary tables only.

Set MATHIA_REPORT_RESOURCES_LIVE=1 to run SQL cases against configured PostgreSQL.
"""

import os
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.report_evidence import (
    _assign_report_resources,
    _get_db,
    collect_report_evidence,
)
from tests.test_report_flow import build_test_snapshot


@pytest.mark.parametrize("level", ["reinforcement", "practice", "enrichment"])
def test_resource_evidence_preserves_target_level(level):
    snapshot = build_test_snapshot()
    resource_id = uuid4()
    conn = MagicMock()
    cur = conn.__enter__.return_value.cursor.return_value.__enter__.return_value
    cur.fetchone.side_effect = [
        {"has_diagnosis": False}, None, {"total_completed": 2},
    ]
    cur.fetchall.side_effect = [
        [
            {
                **domain.model_dump(),
                "domain_name": {"es": domain.domain_name},
            }
            for domain in snapshot.domains
        ],
        [{
            "id": resource_id, "title": "Practice material", "domain_id": "6.NS",
            "target_level": level, "url": None,
        }],
    ]
    with patch("app.services.report_evidence._get_db", return_value=conn):
        evidence = collect_report_evidence(
            snapshot.request.student_id, None, snapshot.request.period, "es", snapshot.school_id,
        )
    assert evidence.resources[0].resource_id == resource_id
    assert evidence.resources[0].target_level == level


@pytest.mark.skipif(
    os.getenv("MATHIA_REPORT_RESOURCES_LIVE") != "1", reason="requires local PostgreSQL",
)
@pytest.mark.parametrize("alignment", ["primary", "additional", "both"])
def test_assignment_supports_primary_and_additional_domains(alignment):
    student_id, school_id, other_school, resource_id = [uuid4() for _ in range(4)]
    # Temporary tables shadow real tables, so no application rows are read or changed.
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TEMP TABLE resources (
                    id uuid PRIMARY KEY, school_id uuid, domain_id text,
                    status text, language text
                ) ON COMMIT DROP;
                CREATE TEMP TABLE resource_curriculum_alignments (
                    resource_id uuid, domain_id text
                ) ON COMMIT DROP;
                CREATE TEMP TABLE student_domain_evaluations (
                    student_id uuid, school_id uuid, domain_id text,
                    score numeric, evaluations_count integer
                ) ON COMMIT DROP;
                CREATE TEMP TABLE resource_assignments (
                    school_id uuid, resource_id uuid, student_id uuid, active boolean
                ) ON COMMIT DROP;
            """)
            cur.execute(
                "INSERT INTO student_domain_evaluations VALUES (%s, %s, '7.SP', 7, 1)",
                (student_id, school_id),
            )
            cur.execute(
                "INSERT INTO resources VALUES (%s, %s, %s, 'published', 'es')",
                (resource_id, school_id, "7.SP" if alignment != "additional" else "7.NS"),
            )
            if alignment != "primary":
                cur.execute(
                    "INSERT INTO resource_curriculum_alignments VALUES (%s, '7.SP')",
                    (resource_id,),
                )
            for scope, domain, status, language in [
                (other_school, "7.SP", "published", "es"),
                (school_id, "7.SP", "draft", "es"),
                (school_id, "7.SP", "published", "en"),
                (school_id, "7.G", "published", "es"),
            ]:
                cur.execute(
                    "INSERT INTO resources VALUES (%s, %s, %s, %s, %s)",
                    (uuid4(), scope, domain, status, language),
                )
            _assign_report_resources(cur, student_id, school_id, "es")
            _assign_report_resources(cur, student_id, school_id, "es")
            cur.execute("SELECT resource_id, student_id, active FROM resource_assignments")
            assert cur.fetchall() == [{
                "resource_id": resource_id, "student_id": student_id, "active": True,
            }]
