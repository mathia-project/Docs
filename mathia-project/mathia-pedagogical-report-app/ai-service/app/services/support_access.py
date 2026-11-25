"""Authorization checks for school-scoped educational-support predictions."""

from uuid import UUID

import psycopg


def resolve_support_prediction_school(
    database_url: str,
    directus_user_id: UUID,
    student_id: UUID,
) -> UUID:
    """Return the student's school when an active teacher or director may access it."""

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT target.school_id
                FROM directus_users user_account
                JOIN directus_roles role_record ON role_record.id = user_account.role
                JOIN student_profiles target
                  ON target.id = %s
                 AND target.school_id = user_account.school_id
                WHERE user_account.id = %s
                  AND user_account.status = 'active'
                  AND (
                      role_record.name = 'Director'
                      OR (
                          role_record.name = 'Teacher'
                          AND EXISTS (
                              SELECT 1
                              FROM teacher_profiles teacher
                              JOIN class_teachers assignment
                                ON assignment.teacher_id = teacher.id
                               AND assignment.school_id = teacher.school_id
                               AND assignment.active = true
                              JOIN class_students enrollment
                                ON enrollment.class_id = assignment.class_id
                               AND enrollment.school_id = assignment.school_id
                               AND enrollment.active = true
                              WHERE teacher.directus_user_id = user_account.id
                                AND teacher.school_id = user_account.school_id
                                AND teacher.active = true
                                AND enrollment.student_id = target.id
                          )
                      )
                  )
                """,
                (student_id, directus_user_id),
            )
            row = cur.fetchone()

    if row is None:
        raise PermissionError("No tiene acceso a este alumno.")
    return UUID(str(row[0]))
