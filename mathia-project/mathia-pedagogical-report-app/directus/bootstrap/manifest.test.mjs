import assert from "node:assert/strict";
import test from "node:test";

import { PERMISSION_DEFINITIONS, POLICY_DEFINITIONS } from "./manifest.mjs";
import { validateManifest } from "./validate.mjs";

test("the manifest passes all deny-by-default invariants", () => {
  assert.doesNotThrow(() => validateManifest());
});

test("SPA policies never grant Directus administration or Data Studio", () => {
  for (const policy of POLICY_DEFINITIONS) {
    assert.equal(policy.admin_access, false);
    assert.equal(policy.app_access, false);
  }
});

test("student and teacher roles never have delete permissions", () => {
  assert.equal(
    PERMISSION_DEFINITIONS.some(
      ({ role, action }) => (role === "student" || role === "teacher") && action === "delete",
    ),
    false,
  );
});

test("create permissions validate payloads instead of relying on item filters", () => {
  const createPermissions = PERMISSION_DEFINITIONS.filter(({ action }) => action === "create");

  assert.ok(createPermissions.length > 0);
  for (const permission of createPermissions) {
    assert.equal(permission.permissions, null);
    assert.ok(permission.validation);
    assert.ok(Object.keys(permission.validation).length > 0);
    assert.doesNotMatch(
      JSON.stringify(permission.validation),
      /\$FOLLOW/,
      `create permission on ${permission.collection} contains forbidden $FOLLOW in validation`,
    );
  }
});

test("directors cannot create school tenants", () => {
  assert.equal(
    PERMISSION_DEFINITIONS.some(
      ({ role, collection, action }) =>
        role === "director" && collection === "schools" && action === "create",
    ),
    false,
  );
});

test("director-created records are validated against the current director's school", () => {
  const tenantCreates = PERMISSION_DEFINITIONS.filter(
    ({ role, collection, action }) =>
      role === "director" && action === "create" && collection !== "directus_users",
  );

  assert.ok(tenantCreates.length > 0);
  for (const permission of tenantCreates) {
    const validation = JSON.stringify(permission.validation);
    assert.match(validation, /school_id/);
    assert.match(validation, /\$CURRENT_USER\.school_id/);
    assert.doesNotMatch(validation, /\$FOLLOW/);
    assert.equal(permission.presets?.school_id, "$CURRENT_USER.school_id");
  }
});

test("directors only read users linked to their school, plus their own account", () => {
  const permission = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "director" && collection === "directus_users" && action === "read",
  );

  assert.ok(permission);
  const filter = JSON.stringify(permission.permissions);
  assert.match(filter, /\$CURRENT_USER/);
  assert.match(filter, /\$CURRENT_USER\.school_id/);
  assert.doesNotMatch(filter, /_null/);
});

test("teacher profile identities cannot be reassigned after creation", () => {
  const teacherProfileUpdates = PERMISSION_DEFINITIONS.filter(
    ({ role, collection, action }) =>
      role === "director" &&
      action === "update" &&
      collection === "teacher_profiles",
  );

  assert.equal(teacherProfileUpdates.length, 1);
  for (const permission of teacherProfileUpdates) {
    assert.equal(permission.fields.includes("directus_user_id"), false);
  }
});

test("student test payloads do not expose the unsanitized definition", () => {
  const permission = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "student" && collection === "tests" && action === "read",
  );

  assert.ok(permission);
  assert.equal(permission.fields.includes("definition"), false);
});

test("students never receive question-bank scoring material", () => {
  assert.equal(
    PERMISSION_DEFINITIONS.some(
      ({ role, collection }) =>
        role === "student" &&
        (collection === "question_bank_items" || collection === "question_options"),
    ),
    false,
  );
});

test("teachers can write only questions they own", () => {
  const updatePermission = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "teacher" && collection === "question_bank_items" && action === "update",
  );

  assert.ok(updatePermission);
  assert.match(JSON.stringify(updatePermission.permissions), /created_by_user_id/);
  assert.match(JSON.stringify(updatePermission.permissions), /\$CURRENT_USER/);
  assert.equal(updatePermission.fields.includes("school_id"), false);
  assert.equal(updatePermission.fields.includes("created_by_teacher_id"), false);
  assert.equal(updatePermission.fields.includes("created_by_user_id"), false);
});

test("all application roles can read active curriculum references", () => {
  for (const role of ["student", "teacher", "director"]) {
    const domainPermission = PERMISSION_DEFINITIONS.find(
      ({ role: itemRole, collection, action }) =>
        itemRole === role && collection === "curriculum_domains" && action === "read",
    );
    assert.ok(domainPermission);
    assert.deepEqual(domainPermission.permissions, { active: { _eq: true } });

    const courseDomainPermission = PERMISSION_DEFINITIONS.find(
      ({ role: itemRole, collection, action }) =>
        itemRole === role && collection === "curriculum_course_domains" && action === "read",
    );
    assert.ok(courseDomainPermission);
    assert.deepEqual(courseDomainPermission.permissions, { course_id: { active: { _eq: true } } });
    assert.deepEqual(courseDomainPermission.fields, ["id", "course_id", "domain_id"]);
  }
});

test("students cannot write authoritative scores or grading timestamps", () => {
  const attemptUpdate = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "student" && collection === "test_attempts" && action === "update",
  );
  assert.ok(attemptUpdate);
  assert.equal(attemptUpdate.fields.includes("score"), false);
  assert.equal(attemptUpdate.fields.includes("max_score"), false);
  assert.equal(attemptUpdate.fields.includes("graded_at"), false);

  const answerCreate = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "student" && collection === "test_attempt_answers" && action === "create",
  );
  assert.ok(answerCreate);
  assert.equal(answerCreate.fields.includes("score_awarded"), false);
  assert.equal(answerCreate.fields.includes("is_correct"), false);

  const answerUpdate = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "student" && collection === "test_attempt_answers" && action === "update",
  );
  assert.ok(answerUpdate);
  assert.equal(answerUpdate.fields.includes("score_awarded"), false);
  assert.equal(answerUpdate.fields.includes("is_correct"), false);
});

test("all application roles can read standard and substandard evaluations", () => {
  for (const role of ["student", "teacher", "director"]) {
    const standardPerm = PERMISSION_DEFINITIONS.find(
      ({ role: r, collection, action }) =>
        r === role && collection === "student_standard_evaluations" && action === "read",
    );
    assert.ok(standardPerm, `${role} should have read on student_standard_evaluations`);

    const substandardPerm = PERMISSION_DEFINITIONS.find(
      ({ role: r, collection, action }) =>
        r === role && collection === "student_substandard_evaluations" && action === "read",
    );
    assert.ok(substandardPerm, `${role} should have read on student_substandard_evaluations`);
  }
});

test("educational_system and student sex permissions are properly exposed across roles", () => {
  for (const role of ["student", "teacher", "director"]) {
    const schoolRead = PERMISSION_DEFINITIONS.find(
      ({ role: r, collection, action }) =>
        r === role && collection === "schools" && action === "read",
    );
    assert.ok(schoolRead, `${role} should read schools`);
    assert.ok(
      schoolRead.fields.includes("educational_system"),
      `${role} should read educational_system on schools`,
    );

    const studentRead = PERMISSION_DEFINITIONS.find(
      ({ role: r, collection, action }) =>
        r === role && collection === "student_profiles" && action === "read",
    );
    assert.ok(studentRead, `${role} should read student_profiles`);
    assert.ok(
      studentRead.fields.includes("sex"),
      `${role} should read sex on student_profiles`,
    );
  }

  // Director can update educational_system on schools
  const directorSchoolUpdate = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "director" && collection === "schools" && action === "update",
  );
  assert.ok(directorSchoolUpdate);
  assert.ok(directorSchoolUpdate.fields.includes("educational_system"));

  // Director can create and update sex on student_profiles
  const directorStudentCreate = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "director" && collection === "student_profiles" && action === "create",
  );
  assert.ok(directorStudentCreate);
  assert.ok(directorStudentCreate.fields.includes("sex"));

  const directorStudentUpdate = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "director" && collection === "student_profiles" && action === "update",
  );
  assert.ok(directorStudentUpdate);
  assert.ok(directorStudentUpdate.fields.includes("sex"));

  const diagnosisFields = ["has_diagnosis", "needs_evaluation", "diagnosis_notes"];
  for (const action of ["read", "create", "update"]) {
    const permission = PERMISSION_DEFINITIONS.find(
      ({ role, collection, action: permissionAction }) =>
        role === "director" &&
        collection === "student_profiles" &&
        permissionAction === action,
    );
    assert.ok(permission, `director should have ${action} permission on student_profiles`);
    for (const field of diagnosisFields) {
      assert.ok(
        permission.fields.includes(field),
        `director ${action} permission should include ${field}`,
      );
    }
  }
});

test("support prediction history is read-only and relationally scoped", () => {
  const teacherRead = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "teacher" && collection === "student_support_predictions" && action === "read",
  );
  assert.ok(teacherRead);
  assert.match(JSON.stringify(teacherRead.permissions), /class_students/);
  assert.match(JSON.stringify(teacherRead.permissions), /class_teachers/);
  assert.match(JSON.stringify(teacherRead.permissions), /directus_user_id/);

  const directorRead = PERMISSION_DEFINITIONS.find(
    ({ role, collection, action }) =>
      role === "director" && collection === "student_support_predictions" && action === "read",
  );
  assert.ok(directorRead);
  assert.deepEqual(directorRead.permissions, {
    school_id: { _eq: "$CURRENT_USER.school_id" },
  });

  assert.equal(
    PERMISSION_DEFINITIONS.some(
      ({ role, collection }) =>
        role === "student" && collection === "student_support_predictions",
    ),
    false,
  );
  assert.equal(
    PERMISSION_DEFINITIONS.some(
      ({ collection, action }) =>
        collection === "student_support_predictions" && action !== "read",
    ),
    false,
  );
});
