import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
import psycopg
from fastapi import HTTPException, status
from psycopg.rows import dict_row

from app.schemas.evaluations import (
    AnswerSubmission,
    AttemptSubmitResponse,
    DifficultyBreakdownItem,
    DomainBreakdownItem,
)


def evaluate_single_answer(
    question_type: str,
    scoring_key: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
    answer_payload: dict[str, Any] | None,
    points: float = 1.0,
) -> tuple[bool, float]:
    if not answer_payload:
        return False, 0.0

    key = scoring_key or {}
    snap = snapshot or {}

    q_type = str(question_type or snap.get("question_type") or "single_choice")

    if q_type in ("single_choice", "true_false"):
        correct_key = key.get("correct_option_key")
        if not correct_key:
            options = key.get("options") or snap.get("options") or []
            for opt in options:
                if isinstance(opt, dict) and opt.get("is_correct"):
                    correct_key = opt.get("option_key")
                    break

        if not correct_key:
            return False, 0.0

        student_key = str(answer_payload.get("selected_option_key") or "").strip()
        is_correct = student_key == str(correct_key).strip()
        return is_correct, points if is_correct else 0.0

    elif q_type == "multiple_choice":
        correct_keys = key.get("correct_option_keys")
        if correct_keys is None:
            options = key.get("options") or snap.get("options") or []
            correct_keys = [
                opt.get("option_key")
                for opt in options
                if isinstance(opt, dict) and opt.get("is_correct")
            ]

        correct_set = {str(k).strip() for k in correct_keys if k is not None}
        raw_student_keys = answer_payload.get("selected_option_keys") or []
        if isinstance(raw_student_keys, (list, tuple)):
            student_set = {str(k).strip() for k in raw_student_keys if k is not None}
        else:
            student_set = set()

        is_correct = bool(correct_set) and (student_set == correct_set)
        return is_correct, points if is_correct else 0.0

    elif q_type == "numeric":
        config = key.get("answer_config") or snap.get("answer_config") or key or {}
        expected = config.get("correct_value")
        if expected is None:
            expected = config.get("expected_value")

        tolerance = config.get("tolerance", 0.0)
        student_val = answer_payload.get("numeric_value")

        if student_val is None or expected is None:
            return False, 0.0

        try:
            expected_f = float(expected)
            tol_f = float(tolerance or 0.0)
            student_f = float(student_val)
            is_correct = abs(student_f - expected_f) <= tol_f
            return is_correct, points if is_correct else 0.0
        except (ValueError, TypeError):
            return False, 0.0

    return False, 0.0


async def verify_auth_token(directus_url: str, token: str) -> dict[str, Any]:
    url = f"{directus_url.rstrip('/')}/users/me"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token",
                )
            data = resp.json().get("data", {})
            return data
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Directus authentication service: {exc}",
        ) from exc


async def grade_attempt(
    attempt_id: UUID,
    auth_token: str | None,
    client_answers: list[AnswerSubmission],
    db_url: str,
    directus_url: str,
) -> AttemptSubmitResponse:
    caller_user_id: str | None = None
    if auth_token:
        user_data = await verify_auth_token(directus_url, auth_token)
        caller_user_id = str(user_data.get("id"))

    now_utc = datetime.now(timezone.utc)

    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # 1. Fetch attempt and lock row
            cur.execute(
                """
                SELECT a.id, a.school_id, a.student_id, a.test_assignment_id,
                       a.test_version_id, a.attempt_number, a.status, a.expires_at,
                       sp.directus_user_id AS student_user_id
                FROM test_attempts a
                JOIN student_profiles sp ON sp.id = a.student_id
                WHERE a.id = %s
                FOR UPDATE
                """,
                (attempt_id,),
            )
            attempt = cur.fetchone()
            if not attempt:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Attempt {attempt_id} not found",
                )

            # Check status
            if attempt["status"] == "graded":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Attempt has already been graded",
                )
            if attempt["status"] != "in_progress":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Attempt cannot be submitted: status is '{attempt['status']}'",
                )

            # Check expiration
            if attempt["expires_at"] and attempt["expires_at"] < now_utc:
                cur.execute(
                    """
                    UPDATE test_attempts
                    SET status = 'expired', updated_at = NOW()
                    WHERE id = %s
                    """,
                    (attempt_id,),
                )
                conn.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Test duration has expired",
                )

            # Verify caller authorization if token present
            if caller_user_id and str(attempt["student_user_id"]) != caller_user_id:
                # Check if caller is teacher/director in the same school
                cur.execute(
                    """
                    SELECT id FROM directus_users
                    WHERE id = %s AND school_id = %s
                    """,
                    (caller_user_id, attempt["school_id"]),
                )
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not authorized to submit this attempt",
                    )

            # 2. Persist any answers submitted in request body
            for sub in client_answers:
                if sub.attempt_question_id:
                    answered_at = sub.answered_at or now_utc
                    cur.execute(
                        """
                        INSERT INTO test_attempt_answers (school_id, attempt_question_id, answer_payload, answered_at, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, NOW(), NOW())
                        ON CONFLICT (attempt_question_id)
                        DO UPDATE SET answer_payload = EXCLUDED.answer_payload, answered_at = EXCLUDED.answered_at, updated_at = NOW()
                        """,
                        (
                            attempt["school_id"],
                            sub.attempt_question_id,
                            json.dumps(sub.answer_payload),
                            answered_at,
                        ),
                    )
                    if sub.answer_payload:
                        if sub.active_duration_ms is not None and sub.active_duration_ms >= 0:
                            cur.execute(
                                """
                                UPDATE test_attempt_questions
                                SET active_duration_ms = %s, answered_at = %s, updated_at = NOW()
                                WHERE id = %s
                                """,
                                (sub.active_duration_ms, answered_at, sub.attempt_question_id),
                            )
                        else:
                            cur.execute(
                                """
                                UPDATE test_attempt_questions
                                SET answered_at = %s, updated_at = NOW()
                                WHERE id = %s
                                """,
                                (answered_at, sub.attempt_question_id),
                            )

            # 3. Load all questions and authoritative scoring materials
            cur.execute(
                """
                SELECT taq.id AS attempt_question_id,
                       taq.active_duration_ms,
                       tvq.id AS test_version_question_id,
                       tvq.points,
                       tvq.course_id,
                       tvq.scoring_key,
                       tvq.question_snapshot,
                       qbi.question_type,
                       qbi.answer_config,
                       qbi.domain_id,
                       qbi.cluster_id,
                       qbi.standard_id,
                       qbi.substandard_id,
                       ans.id AS answer_id,
                       ans.answer_payload
                FROM test_attempt_questions taq
                JOIN test_version_questions tvq ON tvq.id = taq.test_version_question_id
                LEFT JOIN question_bank_items qbi ON qbi.id = tvq.question_id
                LEFT JOIN test_attempt_answers ans ON ans.attempt_question_id = taq.id
                WHERE taq.attempt_id = %s
                ORDER BY taq.display_position ASC
                """,
                (attempt_id,),
            )
            rows = cur.fetchall()

            total_score = 0.0
            total_max_score = 0.0
            total_duration_ms = 0

            domain_stats: dict[str, DomainBreakdownItem] = {}
            difficulty_stats: dict[str, DifficultyBreakdownItem] = {}

            # 4. Evaluate each question
            for r in rows:
                points = float(r["points"] or 1.0)
                total_max_score += points

                q_duration = int(r["active_duration_ms"] or 0)
                total_duration_ms += q_duration

                snapshot = r["question_snapshot"] or {}
                domain = str(r["domain_id"] or snapshot.get("domain_id") or "general")
                difficulty = str(snapshot.get("difficulty") or "medium")
                q_type = str(r["question_type"] or snapshot.get("question_type") or "single_choice")

                scoring_key = r["scoring_key"]
                if not scoring_key or scoring_key == {}:
                    # Build from question_options if scoring_key wasn't populated
                    cur.execute(
                        """
                        SELECT option_key, is_correct, content FROM question_options
                        WHERE question_id = (SELECT question_id FROM test_version_questions WHERE id = %s)
                        """,
                        (r["test_version_question_id"],),
                    )
                    opts = cur.fetchall()
                    if opts:
                        scoring_key = {
                            "options": [
                                {
                                    "option_key": o["option_key"],
                                    "is_correct": o["is_correct"],
                                }
                                for o in opts
                            ]
                        }

                ans_payload = r["answer_payload"]
                if isinstance(ans_payload, str):
                    ans_payload = json.loads(ans_payload)

                is_correct, score_awarded = evaluate_single_answer(
                    question_type=q_type,
                    scoring_key=scoring_key,
                    snapshot=snapshot,
                    answer_payload=ans_payload,
                    points=points,
                )

                total_score += score_awarded

                # Update or insert answer with score
                if r["answer_id"]:
                    cur.execute(
                        """
                        UPDATE test_attempt_answers
                        SET is_correct = %s, score_awarded = %s, updated_at = NOW()
                        WHERE id = %s
                        """,
                        (is_correct, score_awarded, r["answer_id"]),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO test_attempt_answers (school_id, attempt_question_id, answer_payload, is_correct, score_awarded, answered_at, created_at, updated_at)
                        VALUES (%s, %s, '{}'::jsonb, %s, %s, NOW(), NOW(), NOW())
                        """,
                        (attempt["school_id"], r["attempt_question_id"], is_correct, score_awarded),
                    )

                # Aggregate domain stats
                if domain not in domain_stats:
                    domain_stats[domain] = DomainBreakdownItem(
                        domain_id=domain,
                        total_questions=0,
                        correct_questions=0,
                        score=0.0,
                        max_score=0.0,
                        accuracy_percent=0.0,
                    )
                d_item = domain_stats[domain]
                d_item.total_questions += 1
                d_item.max_score += points
                d_item.score += score_awarded
                if is_correct:
                    d_item.correct_questions += 1

                # Aggregate difficulty stats
                if difficulty not in difficulty_stats:
                    difficulty_stats[difficulty] = DifficultyBreakdownItem(
                        total=0,
                        correct=0,
                        accuracy_percent=0.0,
                    )
                diff_item = difficulty_stats[difficulty]
                diff_item.total += 1
                if is_correct:
                    diff_item.correct += 1

            for d_item in domain_stats.values():
                d_item.accuracy_percent = (
                    round((d_item.score / d_item.max_score) * 100, 2)
                    if d_item.max_score > 0
                    else 0.0
                )

            for diff_item in difficulty_stats.values():
                diff_item.accuracy_percent = (
                    round((diff_item.correct / diff_item.total) * 100, 2)
                    if diff_item.total > 0
                    else 0.0
                )

            score_percent = (
                round((total_score / total_max_score) * 100, 2)
                if total_max_score > 0
                else 0.0
            )

            # 5. Update attempt to graded
            cur.execute(
                """
                UPDATE test_attempts
                SET status = 'graded',
                    score = %s,
                    max_score = %s,
                    submitted_at = %s,
                    graded_at = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (total_score, total_max_score, now_utc, now_utc, attempt_id),
            )

            # 6. Update test_results if exists
            cur.execute(
                """
                UPDATE test_results
                SET status = 'graded',
                    score = %s,
                    max_score = %s,
                    submitted_at = %s,
                    graded_at = %s,
                    updated_at = NOW()
                WHERE test_assignment_id = %s AND student_id = %s AND attempt_number = %s
                """,
                (
                    total_score,
                    total_max_score,
                    now_utc,
                    now_utc,
                    attempt["test_assignment_id"],
                    attempt["student_id"],
                    attempt["attempt_number"],
                ),
            )

        conn.commit()

    return AttemptSubmitResponse(
        attempt_id=attempt_id,
        status="graded",
        total_score=total_score,
        max_score=total_max_score,
        score_percent=score_percent,
        total_active_duration_ms=total_duration_ms,
        graded_at=now_utc,
        by_domain=domain_stats,
        by_difficulty=difficulty_stats,
    )

