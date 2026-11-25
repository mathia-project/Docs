const CURRENT_USER = "$CURRENT_USER";
const CURRENT_USER_SCHOOL = "$CURRENT_USER.school_id";
const NOW = "$NOW";

const follow = (collection, field) => `$FOLLOW(${collection},${field})`;
const eq = (value) => ({ _eq: value });
const and = (...filters) => ({ _and: filters });
const or = (...filters) => ({ _or: filters });

const currentStudent = { directus_user_id: eq(CURRENT_USER) };
const activeCurrentStudent = and(currentStudent, { active: eq(true) });
const currentTeacher = { directus_user_id: eq(CURRENT_USER) };
const activeCurrentTeacher = and(currentTeacher, { active: eq(true) });

const ownUser = { id: eq(CURRENT_USER) };
const ownRole = { id: eq("$CURRENT_ROLE") };

const studentSchool = {
  [follow("student_profiles", "school_id")]: activeCurrentStudent,
};

const studentEnrollment = and(
  { active: eq(true) },
  { student_id: activeCurrentStudent },
);

const studentClass = {
  [follow("class_students", "class_id")]: studentEnrollment,
};

const availableNow = or(
  { available_from: { _null: true } },
  { available_from: { _lte: NOW } },
);

const studentAssignmentTarget = or(
  { student_id: activeCurrentStudent },
  { class_id: studentClass },
);

const studentResourceAssignment = and(
  { active: eq(true) },
  availableNow,
  studentAssignmentTarget,
);

const studentTestAssignment = and(
  { enabled: eq(true) },
  availableNow,
  studentAssignmentTarget,
);

const studentResource = and(
  { status: eq("published") },
  or(
    { school_id: eq(CURRENT_USER_SCHOOL) },
    {
      [follow("resource_assignments", "resource_id")]: studentResourceAssignment,
    },
  ),
);

const studentTest = and(
  { status: eq("published") },
  { [follow("test_assignments", "test_id")]: studentTestAssignment },
);

const studentResult = { student_id: activeCurrentStudent };

const assignedTeacher = and(
  { active: eq(true) },
  { teacher_id: activeCurrentTeacher },
);

const teacherClass = {
  [follow("class_teachers", "class_id")]: assignedTeacher,
};

const teacherEnrollment = and({ active: eq(true) }, { class_id: teacherClass });

const teacherStudent = {
  [follow("class_students", "student_id")]: teacherEnrollment,
};

const teacherAssignmentTarget = or(
  { class_id: teacherClass },
  { student_id: teacherStudent },
);

const teacherResource = or(
  { school_id: eq(CURRENT_USER_SCHOOL) },
  { created_by_teacher_id: activeCurrentTeacher },
  {
    [follow("resource_assignments", "resource_id")]: and(
      { active: eq(true) },
      teacherAssignmentTarget,
    ),
  },
);

const teacherTest = or(
  { created_by_teacher_id: activeCurrentTeacher },
  {
    [follow("test_assignments", "test_id")]: teacherAssignmentTarget,
  },
);

const teacherStudentReport = or(
  { class_id: teacherClass },
  { student_id: teacherStudent },
);

const teacherClassReport = { class_id: teacherClass };

const directorSchool = { id: eq(CURRENT_USER_SCHOOL) };

const directorItem = { school_id: eq(CURRENT_USER_SCHOOL) };

const directorUser = or(
  ownUser,
  and({ school_id: { _nnull: true } }, directorItem),
);

const directorSchoolPreset = { school_id: CURRENT_USER_SCHOOL };

const globalPublishedQuestion = and(
  { visibility: eq("global") },
  { status: eq("published") },
);

const teacherOwnedQuestion = { created_by_user_id: eq(CURRENT_USER) };
const teacherQuestion = or(
  teacherOwnedQuestion,
  and(
    { school_id: eq(CURRENT_USER_SCHOOL) },
    { visibility: eq("school") },
    { status: eq("published") },
  ),
  globalPublishedQuestion,
);
const teacherQuestionOption = { question_id: teacherQuestion };
const teacherOwnedQuestionOption = { created_by_user_id: eq(CURRENT_USER) };

const directorQuestion = or(directorItem, globalPublishedQuestion);
const directorQuestionOption = { question_id: directorQuestion };

const studentTestVersion = and(
  { status: eq("published") },
  { [follow("test_assignments", "test_version_id")]: studentTestAssignment },
);
const studentSection = { test_version_id: studentTestVersion };
const studentAttempt = and({ student_id: activeCurrentStudent });
const studentAttemptQuestion = { attempt_id: studentAttempt };
const studentAttemptAnswer = { attempt_question_id: studentAttemptQuestion };

const teacherTestVersion = or(
  { created_by_teacher_id: activeCurrentTeacher },
  { test_id: teacherTest },
);
const teacherSection = { test_version_id: teacherTestVersion };
const teacherBlueprintRule = { test_id: teacherTest };
const teacherVersionQuestion = { test_version_id: teacherTestVersion };
const teacherAttempt = { test_assignment_id: { class_id: teacherClass } };
const teacherAttemptQuestion = { attempt_id: teacherAttempt };
const teacherAttemptAnswer = { attempt_question_id: teacherAttemptQuestion };

const questionCreatorPreset = {
  school_id: CURRENT_USER_SCHOOL,
  created_by_user_id: CURRENT_USER,
};

const DIRECTUS_USER_READ_FIELDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "role",
  "status",
  "language",
];

const DIRECTUS_ROLE_READ_FIELDS = ["id", "name"];

const DIRECTUS_FILE_READ_FIELDS = [
  "id",
  "storage",
  "filename_disk",
  "filename_download",
  "title",
  "type",
  "folder",
  "uploaded_by",
  "uploaded_on",
  "modified_by",
  "modified_on",
  "charset",
  "filesize",
  "width",
  "height",
  "duration",
  "embed",
  "description",
  "location",
  "tags",
  "metadata",
  "focal_point_x",
  "focal_point_y",
  "tus_id",
  "tus_data",
];

const SCHOOL_FIELDS = [
  "id",
  "name",
  "code",
  "slug",
  "default_language",
  "time_zone",
  "educational_system",
  "active",
  "created_at",
  "updated_at",
];

const STUDENT_PROFILE_FIELDS = [
  "id",
  "school_id",
  "directus_user_id",
  "external_id",
  "first_name",
  "last_name",
  "preferred_name",
  "email",
  "date_of_birth",
  "preferred_language",
  "sex",
  "has_diagnosis",
  "needs_evaluation",
  "diagnosis_notes",
  "active",
  "created_at",
  "updated_at",
];

const STUDENT_PROFILE_CREATE_FIELDS = [
  "school_id",
  "directus_user_id",
  "external_id",
  "first_name",
  "last_name",
  "preferred_name",
  "email",
  "date_of_birth",
  "preferred_language",
  "sex",
  "has_diagnosis",
  "needs_evaluation",
  "diagnosis_notes",
  "active",
];

const TEACHER_PROFILE_FIELDS = [
  "id",
  "school_id",
  "directus_user_id",
  "employee_id",
  "first_name",
  "last_name",
  "email",
  "preferred_language",
  "active",
  "created_at",
  "updated_at",
];

const TEACHER_PROFILE_CREATE_FIELDS = [
  "school_id",
  "directus_user_id",
  "employee_id",
  "first_name",
  "last_name",
  "email",
  "preferred_language",
  "active",
];

const CLASS_FIELDS = [
  "id",
  "school_id",
  "name",
  "code",
  "academic_year",
  "grade_level",
  "starts_on",
  "ends_on",
  "active",
  "created_at",
  "updated_at",
];

const CLASS_CREATE_FIELDS = [
  "school_id",
  "name",
  "code",
  "academic_year",
  "grade_level",
  "starts_on",
  "ends_on",
  "active",
];

const CLASS_STUDENT_FIELDS = [
  "id",
  "school_id",
  "class_id",
  "student_id",
  "enrolled_on",
  "left_on",
  "active",
  "created_at",
  "updated_at",
];

const CLASS_STUDENT_CREATE_FIELDS = [
  "school_id",
  "class_id",
  "student_id",
  "enrolled_on",
  "left_on",
  "active",
];

const CLASS_TEACHER_FIELDS = [
  "id",
  "school_id",
  "class_id",
  "teacher_id",
  "assigned_on",
  "unassigned_on",
  "active",
  "created_at",
  "updated_at",
];

const CLASS_TEACHER_CREATE_FIELDS = [
  "school_id",
  "class_id",
  "teacher_id",
  "assigned_on",
  "unassigned_on",
  "active",
];

const RESOURCE_FIELDS = [
  "id",
  "school_id",
  "created_by_teacher_id",
  "title",
  "description",
  "resource_type",
  "status",
  "language",
  "course_id",
  "category_id",
  "domain_id",
  "cluster_id",
  "standard_id",
  "target_level",
  "url",
  "directus_file_id",
  "body",
  "metadata",
  "published_at",
  "created_at",
  "updated_at",
];

const RESOURCE_CREATE_FIELDS = [
  "school_id",
  "created_by_teacher_id",
  "title",
  "description",
  "resource_type",
  "status",
  "language",
  "course_id",
  "category_id",
  "domain_id",
  "cluster_id",
  "standard_id",
  "target_level",
  "url",
  "directus_file_id",
  "body",
  "metadata",
  "published_at",
];

const STUDENT_DOMAIN_EVALUATION_FIELDS = [
  "id",
  "school_id",
  "student_id",
  "domain_id",
  "category_id",
  "score",
  "is_baseline",
  "evaluations_count",
  "correct_questions_count",
  "total_questions_count",
  "total_score_awarded",
  "total_max_score",
  "last_attempt_id",
  "last_evaluated_at",
  "created_at",
  "updated_at",
];

const STUDENT_STANDARD_EVALUATION_FIELDS = [
  "id",
  "school_id",
  "student_id",
  "course_id",
  "standard_id",
  "score",
  "evaluations_count",
  "correct_questions_count",
  "total_questions_count",
  "total_score_awarded",
  "total_max_score",
  "last_attempt_id",
  "last_evaluated_at",
  "created_at",
  "updated_at",
];

const STUDENT_SUBSTANDARD_EVALUATION_FIELDS = [
  "id",
  "school_id",
  "student_id",
  "course_id",
  "substandard_id",
  "standard_id",
  "score",
  "evaluations_count",
  "correct_questions_count",
  "total_questions_count",
  "total_score_awarded",
  "total_max_score",
  "last_attempt_id",
  "last_evaluated_at",
  "created_at",
  "updated_at",
];

const STUDENT_SUPPORT_PREDICTION_FIELDS = [
  "id",
  "school_id",
  "student_id",
  "suggests_educational_support",
  "status",
  "attention_index",
  "applied_threshold",
  "model_name",
  "model_version",
  "model_route",
  "evidence_level",
  "total_responses",
  "valid_response_times",
  "volume_outside_fit_range",
  "warnings",
  "reason",
  "generated_at",
  "created_at",
];

const QUESTION_COURSE_ALIGNMENT_FIELDS = [
  "id",
  "school_id",
  "question_id",
  "course_id",
  "created_at",
  "updated_at",
];

const QUESTION_COURSE_ALIGNMENT_WRITE_FIELDS = [
  "question_id",
  "course_id",
];

const RESOURCE_CURRICULUM_ALIGNMENT_FIELDS = [
  "id",
  "school_id",
  "resource_id",
  "course_id",
  "domain_id",
  "standard_id",
  "substandard_id",
  "created_at",
  "updated_at",
];

const RESOURCE_CURRICULUM_ALIGNMENT_WRITE_FIELDS = [
  "resource_id",
  "course_id",
  "domain_id",
  "standard_id",
  "substandard_id",
];

const RESOURCE_ASSIGNMENT_FIELDS = [
  "id",
  "school_id",
  "resource_id",
  "class_id",
  "student_id",
  "assigned_by_teacher_id",
  "available_from",
  "due_at",
  "active",
  "created_at",
  "updated_at",
];

const TEST_FIELDS = [
  "id",
  "school_id",
  "created_by_user_id",
  "created_by_teacher_id",
  "title",
  "description",
  "instructions",
  "status",
  "language",
  "duration_minutes",
  "max_attempts",
  "max_score",
  "definition",
  "published_at",
  "created_at",
  "updated_at",
];

const STUDENT_TEST_FIELDS = TEST_FIELDS.filter((field) => field !== "definition");

const TEST_CREATE_FIELDS = [
  "created_by_user_id",
  "title",
  "description",
  "instructions",
  "status",
  "language",
  "duration_minutes",
  "max_attempts",
  "max_score",
  "definition",
  "published_at",
];

const TEST_ASSIGNMENT_FIELDS = [
  "id",
  "school_id",
  "test_id",
  "test_version_id",
  "class_id",
  "student_id",
  "assigned_by_teacher_id",
  "available_from",
  "due_at",
  "max_attempts_override",
  "enabled",
  "created_at",
  "updated_at",
];

const TEST_ASSIGNMENT_CREATE_FIELDS = [
  "test_id",
  "test_version_id",
  "class_id",
  "student_id",
  "assigned_by_teacher_id",
  "available_from",
  "due_at",
  "max_attempts_override",
  "enabled",
];

const TEST_VERSION_FIELDS = [
  "id",
  "school_id",
  "test_id",
  "version_number",
  "instructions",
  "language",
  "duration_minutes",
  "max_attempts",
  "shuffle_questions",
  "shuffle_options",
  "status",
  "max_score",
  "published_at",
  "created_by_user_id",
  "created_by_teacher_id",
  "created_at",
  "updated_at",
];

const TEST_VERSION_WRITE_FIELDS = [
  "test_id",
  "version_number",
  "instructions",
  "language",
  "duration_minutes",
  "max_attempts",
  "shuffle_questions",
  "shuffle_options",
  "status",
  "max_score",
  "published_at",
];

const STUDENT_TEST_VERSION_FIELDS = [
  "id",
  "school_id",
  "test_id",
  "version_number",
  "instructions",
  "language",
  "duration_minutes",
  "max_attempts",
  "shuffle_questions",
  "shuffle_options",
  "status",
  "max_score",
  "published_at",
];

const TEST_SECTION_FIELDS = [
  "id",
  "school_id",
  "test_version_id",
  "title",
  "position",
  "created_at",
  "updated_at",
];

const TEST_SECTION_WRITE_FIELDS = ["test_version_id", "title", "position"];
const STUDENT_TEST_SECTION_FIELDS = ["id", "school_id", "test_version_id", "title", "position"];

const TEST_BLUEPRINT_RULE_FIELDS = [
  "id",
  "school_id",
  "test_id",
  "section_title",
  "category_id",
  "domain_id",
  "cluster_id",
  "standard_id",
  "substandard_id",
  "difficulty",
  "question_type",
  "question_count",
  "manual_question_ids",
  "position",
  "created_at",
  "updated_at",
];

const TEST_BLUEPRINT_RULE_WRITE_FIELDS = [
  "test_id",
  "section_title",
  "category_id",
  "domain_id",
  "cluster_id",
  "standard_id",
  "substandard_id",
  "difficulty",
  "question_type",
  "question_count",
  "manual_question_ids",
  "position",
];

const TEST_VERSION_QUESTION_FIELDS = [
  "id",
  "school_id",
  "test_version_id",
  "question_id",
  "section_id",
  "canonical_position",
  "points",
  "course_id",
  "question_snapshot",
  "created_at",
];

const STUDENT_TEST_VERSION_QUESTION_FIELDS = [
  "id",
  "school_id",
  "test_version_id",
  "question_id",
  "section_id",
  "canonical_position",
  "points",
  "course_id",
  "question_snapshot",
  "created_at",
];

const TEST_VERSION_QUESTION_WRITE_FIELDS = [
  "test_version_id",
  "question_id",
  "section_id",
  "canonical_position",
  "points",
  "course_id",
  "question_snapshot",
];

const TEST_ATTEMPT_FIELDS = [
  "id",
  "school_id",
  "test_assignment_id",
  "test_version_id",
  "student_id",
  "attempt_number",
  "random_seed",
  "status",
  "started_at",
  "submitted_at",
  "expires_at",
  "score",
  "max_score",
  "graded_at",
  "graded_by_teacher_id",
  "teacher_feedback",
  "created_at",
  "updated_at",
];

const STUDENT_TEST_ATTEMPT_FIELDS = [
  "id",
  "school_id",
  "test_assignment_id",
  "test_version_id",
  "student_id",
  "attempt_number",
  "random_seed",
  "status",
  "started_at",
  "submitted_at",
  "expires_at",
  "score",
  "max_score",
  "graded_at",
  "teacher_feedback",
  "created_at",
  "updated_at",
];

const TEST_ATTEMPT_QUESTION_FIELDS = [
  "id",
  "school_id",
  "attempt_id",
  "test_version_question_id",
  "display_position",
  "option_order",
  "first_presented_at",
  "last_presented_at",
  "answered_at",
  "active_duration_ms",
  "visit_count",
  "created_at",
  "updated_at",
];

const TEST_ATTEMPT_ANSWER_FIELDS = [
  "id",
  "school_id",
  "attempt_question_id",
  "answer_payload",
  "is_correct",
  "score_awarded",
  "answered_at",
  "created_at",
  "updated_at",
];

const STUDENT_TEST_ATTEMPT_ANSWER_FIELDS = [
  "id",
  "school_id",
  "attempt_question_id",
  "answer_payload",
  "is_correct",
  "score_awarded",
  "answered_at",
  "created_at",
  "updated_at",
];

const QUESTION_IMPORT_BATCH_FIELDS = [
  "id",
  "school_id",
  "created_by_user_id",
  "created_by_teacher_id",
  "source",
  "filename",
  "schema_version",
  "status",
  "total_rows",
  "valid_rows",
  "invalid_rows",
  "result_summary",
  "created_at",
  "completed_at",
];

const QUESTION_IMPORT_BATCH_WRITE_FIELDS = [
  "source",
  "filename",
  "schema_version",
  "status",
  "total_rows",
  "valid_rows",
  "invalid_rows",
  "result_summary",
  "completed_at",
];

const TEST_RESULT_FIELDS = [
  "id",
  "school_id",
  "test_assignment_id",
  "student_id",
  "attempt_number",
  "status",
  "score",
  "max_score",
  "answers",
  "scoring_details",
  "teacher_feedback",
  "graded_by_teacher_id",
  "started_at",
  "submitted_at",
  "graded_at",
  "created_at",
  "updated_at",
];

const CURRICULUM_CATEGORY_FIELDS = ["id", "code", "name", "active"];
const CURRICULUM_COURSE_FIELDS = [
  "id",
  "grade_level",
  "name",
  "spanish_equivalent",
  "italian_equivalent",
  "pathway",
  "source",
  "active",
];
const CURRICULUM_DOMAIN_FIELDS = [
  "id",
  "category_id",
  "code",
  "name",
  "category_assignment",
  "source",
  "active",
];
const CURRICULUM_CLUSTER_FIELDS = [
  "id",
  "domain_id",
  "code",
  "name",
  "source",
  "active",
];
const CURRICULUM_STANDARD_FIELDS = [
  "id",
  "cluster_id",
  "code",
  "ccss_id",
  "description",
  "markers",
  "source",
  "notes",
  "active",
];
const CURRICULUM_SUBSTANDARD_FIELDS = [
  "id",
  "standard_id",
  "code",
  "ccss_id",
  "description",
  "markers",
  "source",
  "active",
];
const CURRICULUM_COURSE_DOMAIN_FIELDS = ["id", "course_id", "domain_id"];
const CURRICULUM_COURSE_STANDARD_FIELDS = [
  "id",
  "course_id",
  "standard_id",
  "inclusion",
  "coverage",
];
const CURRICULUM_COURSE_SUBSTANDARD_FIELDS = [
  "id",
  "course_id",
  "substandard_id",
  "inclusion",
  "coverage",
];
const CURRICULUM_LOOKUP_FIELDS = ["alias", "item_kind", "standard_id", "substandard_id"];

const QUESTION_FIELDS = [
  "id",
  "school_id",
  "created_by_user_id",
  "created_by_teacher_id",
  "external_id",
  "question_type",
  "prompt",
  "explanation",
  "difficulty",
  "language",
  "domain_id",
  "cluster_id",
  "standard_id",
  "substandard_id",
  "visibility",
  "status",
  "source",
  "source_reference",
  "answer_config",
  "metadata",
  "published_at",
  "created_at",
  "updated_at",
];

const QUESTION_WRITE_FIELDS = QUESTION_FIELDS.filter(
  (field) =>
    ![
      "id",
      "school_id",
      "created_by_user_id",
      "created_by_teacher_id",
      "created_at",
      "updated_at",
    ].includes(field),
);

const QUESTION_OPTION_FIELDS = [
  "id",
  "school_id",
  "created_by_user_id",
  "question_id",
  "option_key",
  "content",
  "is_correct",
  "position",
  "feedback",
  "created_at",
  "updated_at",
];

const QUESTION_OPTION_WRITE_FIELDS = [
  "question_id",
  "option_key",
  "content",
  "is_correct",
  "position",
  "feedback",
];

const curriculumReads = (role) => [
  read(role, "curriculum_categories", { active: eq(true) }, CURRICULUM_CATEGORY_FIELDS),
  read(role, "curriculum_courses", { active: eq(true) }, CURRICULUM_COURSE_FIELDS),
  read(role, "curriculum_domains", { active: eq(true) }, CURRICULUM_DOMAIN_FIELDS),
  read(role, "curriculum_clusters", { active: eq(true) }, CURRICULUM_CLUSTER_FIELDS),
  read(role, "curriculum_standards", { active: eq(true) }, CURRICULUM_STANDARD_FIELDS),
  read(role, "curriculum_substandards", { active: eq(true) }, CURRICULUM_SUBSTANDARD_FIELDS),
  read(
    role,
    "curriculum_course_domains",
    { course_id: { active: eq(true) } },
    CURRICULUM_COURSE_DOMAIN_FIELDS,
  ),
  read(
    role,
    "curriculum_course_standards",
    { course_id: { active: eq(true) } },
    CURRICULUM_COURSE_STANDARD_FIELDS,
  ),
  read(
    role,
    "curriculum_course_substandards",
    { course_id: { active: eq(true) } },
    CURRICULUM_COURSE_SUBSTANDARD_FIELDS,
  ),
  read(
    role,
    "curriculum_lookup_aliases",
    { alias: { _nnull: true } },
    CURRICULUM_LOOKUP_FIELDS,
  ),
];

const STUDENT_TEST_RESULT_FIELDS = TEST_RESULT_FIELDS.filter(
  (field) => field !== "scoring_details" && field !== "graded_by_teacher_id",
);

const PEDAGOGICAL_REPORT_FIELDS = [
  "id",
  "school_id",
  "student_id",
  "class_id",
  "created_by_teacher_id",
  "title",
  "language",
  "period_start",
  "period_end",
  "version",
  "status",
  "narrative",
  "structured_content",
  "generation_context",
  "model_name",
  "model_version",
  "generated_at",
  "reviewed_at",
  "finalized_at",
  "created_at",
  "updated_at",
];

const PEDAGOGICAL_REPORT_CREATE_FIELDS = [
  "school_id",
  "student_id",
  "class_id",
  "created_by_teacher_id",
  "title",
  "language",
  "period_start",
  "period_end",
  "version",
  "status",
  "narrative",
  "structured_content",
  "generation_context",
  "model_name",
  "model_version",
  "generated_at",
  "reviewed_at",
  "finalized_at",
];

const CLASS_REPORT_FIELDS = [
  "id",
  "school_id",
  "class_id",
  "created_by_teacher_id",
  "title",
  "language",
  "period_start",
  "period_end",
  "version",
  "status",
  "narrative",
  "structured_content",
  "generation_context",
  "model_name",
  "model_version",
  "generated_at",
  "reviewed_at",
  "finalized_at",
  "created_at",
  "updated_at",
];

const CLASS_REPORT_CREATE_FIELDS = [
  "school_id",
  "class_id",
  "created_by_teacher_id",
  "title",
  "language",
  "period_start",
  "period_end",
  "version",
  "status",
  "narrative",
  "structured_content",
  "generation_context",
  "model_name",
  "model_version",
  "generated_at",
  "reviewed_at",
  "finalized_at",
];

const permission = ({
  role,
  collection,
  action,
  permissions,
  fields,
  validation = null,
  presets = null,
}) => ({
  role,
  collection,
  action,
  permissions,
  validation,
  presets,
  fields,
});

const read = (role, collection, permissions, fields) =>
  permission({ role, collection, action: "read", permissions, fields });

const update = (role, collection, permissions, fields, validation = null) =>
  permission({ role, collection, action: "update", permissions, fields, validation });

// Directus applies `validation` to create payloads. `permissions` is an item
// filter and cannot protect a record that does not exist yet.
const create = (role, collection, validation, fields, presets = null) =>
  permission({
    role,
    collection,
    action: "create",
    permissions: null,
    fields,
    validation,
    presets,
  });

export const ROLE_DEFINITIONS = [
  {
    key: "student",
    name: "Student",
    icon: "school",
    description: "Mathia SPA student. API access only; no Directus Data Studio access.",
    parent: null,
  },
  {
    key: "teacher",
    name: "Teacher",
    icon: "co_present",
    description: "Mathia SPA teacher. Relational API access to assigned classes only.",
    parent: null,
  },
  {
    key: "director",
    name: "Director",
    icon: "manage_accounts",
    description: "Mathia SPA director. School-scoped API management without Data Studio.",
    parent: null,
  },
];

export const POLICY_DEFINITIONS = [
  {
    key: "student",
    name: "Mathia Student API",
    icon: "school",
    description: "Deny-by-default API policy for a student's own educational context.",
    app_access: false,
    admin_access: false,
    enforce_tfa: false,
    ip_access: null,
  },
  {
    key: "teacher",
    name: "Mathia Teacher API",
    icon: "co_present",
    description: "Deny-by-default API policy scoped through active class assignments.",
    app_access: false,
    admin_access: false,
    enforce_tfa: false,
    ip_access: null,
  },
  {
    key: "director",
    name: "Mathia Director API",
    icon: "manage_accounts",
    description: "Deny-by-default API policy scoped to the director's active school profile.",
    app_access: false,
    admin_access: false,
    enforce_tfa: false,
    ip_access: null,
  },
];

export const PERMISSION_DEFINITIONS = [
  ...curriculumReads("student"),
  read("student", "directus_users", ownUser, DIRECTUS_USER_READ_FIELDS),
  read("student", "directus_roles", ownRole, DIRECTUS_ROLE_READ_FIELDS),
  read("student", "student_profiles", currentStudent, STUDENT_PROFILE_FIELDS),
  update(
    "student",
    "student_profiles",
    activeCurrentStudent,
    ["preferred_name", "preferred_language"],
  ),
  read("student", "schools", studentSchool, SCHOOL_FIELDS),
  read("student", "classes", studentClass, CLASS_FIELDS),
  read("student", "class_students", studentEnrollment, CLASS_STUDENT_FIELDS),
  read("student", "resources", studentResource, RESOURCE_FIELDS),
  read(
    "student",
    "resource_assignments",
    studentResourceAssignment,
    RESOURCE_ASSIGNMENT_FIELDS,
  ),
  read(
    "student",
    "student_domain_evaluations",
    { student_id: activeCurrentStudent },
    STUDENT_DOMAIN_EVALUATION_FIELDS,
  ),
  read(
    "student",
    "student_standard_evaluations",
    { student_id: activeCurrentStudent },
    STUDENT_STANDARD_EVALUATION_FIELDS,
  ),
  read(
    "student",
    "student_substandard_evaluations",
    { student_id: activeCurrentStudent },
    STUDENT_SUBSTANDARD_EVALUATION_FIELDS,
  ),
  read(
    "student",
    "resource_curriculum_alignments",
    { resource_id: studentResource },
    RESOURCE_CURRICULUM_ALIGNMENT_FIELDS,
  ),
  read("student", "tests", studentTest, STUDENT_TEST_FIELDS),
  read("student", "test_assignments", studentTestAssignment, TEST_ASSIGNMENT_FIELDS),
  read("student", "test_versions", studentTestVersion, STUDENT_TEST_VERSION_FIELDS),
  read("student", "test_sections", studentSection, STUDENT_TEST_SECTION_FIELDS),
  read(
    "student",
    "test_version_questions",
    { test_version_id: studentTestVersion },
    STUDENT_TEST_VERSION_QUESTION_FIELDS,
  ),
  read("student", "test_attempts", studentAttempt, STUDENT_TEST_ATTEMPT_FIELDS),
  create(
    "student",
    "test_attempts",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { test_assignment_id: { _nnull: true } },
      { test_version_id: { _nnull: true } },
      { student_id: { _nnull: true } },
    ),
    [
      "test_assignment_id",
      "test_version_id",
      "student_id",
      "attempt_number",
      "random_seed",
      "status",
      "started_at",
      "expires_at",
      "max_score",
    ],
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "student",
    "test_attempts",
    and(studentAttempt, { status: eq("in_progress") }),
    ["status", "submitted_at"],
    { status: { _in: ["in_progress", "submitted"] } },
  ),
  read("student", "test_attempt_questions", studentAttemptQuestion, TEST_ATTEMPT_QUESTION_FIELDS),
  create(
    "student",
    "test_attempt_questions",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { attempt_id: { _nnull: true } },
      { test_version_question_id: { _nnull: true } },
    ),
    [
      "attempt_id",
      "test_version_question_id",
      "display_position",
      "option_order",
      "first_presented_at",
      "active_duration_ms",
      "visit_count",
    ],
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "student",
    "test_attempt_questions",
    studentAttemptQuestion,
    [
      "first_presented_at",
      "last_presented_at",
      "answered_at",
      "active_duration_ms",
      "visit_count",
      "option_order",
    ],
  ),
  read("student", "test_attempt_answers", studentAttemptAnswer, STUDENT_TEST_ATTEMPT_ANSWER_FIELDS),
  create(
    "student",
    "test_attempt_answers",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { attempt_question_id: { _nnull: true } },
    ),
    ["attempt_question_id", "answer_payload", "answered_at"],
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "student",
    "test_attempt_answers",
    studentAttemptAnswer,
    ["answer_payload", "answered_at"],
  ),
  read("student", "test_results", studentResult, STUDENT_TEST_RESULT_FIELDS),
  update(
    "student",
    "test_results",
    and(studentResult, { status: eq("in_progress") }),
    ["answers", "status", "submitted_at"],
    { status: { _in: ["in_progress", "submitted"] } },
  ),
  read(
    "student",
    "directus_files",
    { [follow("resources", "directus_file_id")]: studentResource },
    DIRECTUS_FILE_READ_FIELDS,
  ),

  ...curriculumReads("teacher"),
  read("teacher", "directus_users", ownUser, DIRECTUS_USER_READ_FIELDS),
  read("teacher", "directus_roles", ownRole, DIRECTUS_ROLE_READ_FIELDS),
  read("teacher", "teacher_profiles", currentTeacher, TEACHER_PROFILE_FIELDS),
  update(
    "teacher",
    "teacher_profiles",
    activeCurrentTeacher,
    ["preferred_language"],
  ),
  read(
    "teacher",
    "schools",
    { [follow("teacher_profiles", "school_id")]: activeCurrentTeacher },
    SCHOOL_FIELDS,
  ),
  read("teacher", "classes", teacherClass, CLASS_FIELDS),
  read("teacher", "class_teachers", assignedTeacher, CLASS_TEACHER_FIELDS),
  read("teacher", "class_students", teacherEnrollment, CLASS_STUDENT_FIELDS),
  read("teacher", "student_profiles", teacherStudent, STUDENT_PROFILE_FIELDS),
  read("teacher", "resources", teacherResource, RESOURCE_FIELDS),
  create(
    "teacher",
    "resources",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { title: { _nnull: true } },
      { resource_type: { _nnull: true } },
    ),
    RESOURCE_CREATE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "resources",
    { created_by_teacher_id: activeCurrentTeacher },
    [
      "title",
      "description",
      "resource_type",
      "status",
      "language",
      "course_id",
      "category_id",
      "domain_id",
      "cluster_id",
      "standard_id",
      "target_level",
      "url",
      "directus_file_id",
      "body",
      "metadata",
      "published_at",
    ],
  ),
  read(
    "teacher",
    "student_domain_evaluations",
    { student_id: teacherStudent },
    STUDENT_DOMAIN_EVALUATION_FIELDS,
  ),
  read(
    "teacher",
    "student_standard_evaluations",
    { student_id: teacherStudent },
    STUDENT_STANDARD_EVALUATION_FIELDS,
  ),
  read(
    "teacher",
    "student_substandard_evaluations",
    { student_id: teacherStudent },
    STUDENT_SUBSTANDARD_EVALUATION_FIELDS,
  ),
  read(
    "teacher",
    "student_support_predictions",
    { student_id: teacherStudent },
    STUDENT_SUPPORT_PREDICTION_FIELDS,
  ),
  read(
    "teacher",
    "resource_curriculum_alignments",
    { resource_id: teacherResource },
    RESOURCE_CURRICULUM_ALIGNMENT_FIELDS,
  ),
  create(
    "teacher",
    "resource_curriculum_alignments",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { resource_id: { _nnull: true } },
      { course_id: { _nnull: true } },
    ),
    RESOURCE_CURRICULUM_ALIGNMENT_WRITE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "resource_curriculum_alignments",
    { school_id: eq(CURRENT_USER_SCHOOL) },
    RESOURCE_CURRICULUM_ALIGNMENT_WRITE_FIELDS,
  ),
  read(
    "teacher",
    "question_course_alignments",
    { question_id: teacherQuestion },
    QUESTION_COURSE_ALIGNMENT_FIELDS,
  ),
  create(
    "teacher",
    "question_course_alignments",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { question_id: { _nnull: true } },
      { course_id: { _nnull: true } },
    ),
    QUESTION_COURSE_ALIGNMENT_WRITE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  read(
    "teacher",
    "resource_assignments",
    teacherAssignmentTarget,
    RESOURCE_ASSIGNMENT_FIELDS,
  ),
  update(
    "teacher",
    "resource_assignments",
    teacherAssignmentTarget,
    ["available_from", "due_at", "active"],
  ),
  read("teacher", "tests", teacherTest, TEST_FIELDS),
  create(
    "teacher",
    "tests",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { created_by_user_id: eq(CURRENT_USER) },
    ),
    TEST_CREATE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "teacher",
    "tests",
    { created_by_teacher_id: activeCurrentTeacher },
    [
      "title",
      "description",
      "instructions",
      "status",
      "language",
      "duration_minutes",
      "max_attempts",
      "max_score",
      "definition",
      "published_at",
    ],
  ),
  read("teacher", "test_blueprint_rules", teacherBlueprintRule, TEST_BLUEPRINT_RULE_FIELDS),
  create(
    "teacher",
    "test_blueprint_rules",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { test_id: { _nnull: true } },
    ),
    TEST_BLUEPRINT_RULE_WRITE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "test_blueprint_rules",
    teacherBlueprintRule,
    TEST_BLUEPRINT_RULE_WRITE_FIELDS.filter((f) => f !== "test_id"),
  ),
  read("teacher", "test_versions", teacherTestVersion, TEST_VERSION_FIELDS),
  create(
    "teacher",
    "test_versions",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { created_by_user_id: eq(CURRENT_USER) },
      { test_id: { _nnull: true } },
    ),
    TEST_VERSION_WRITE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "teacher",
    "test_versions",
    teacherTestVersion,
    TEST_VERSION_WRITE_FIELDS.filter((f) => f !== "test_id"),
  ),
  read("teacher", "test_sections", teacherSection, TEST_SECTION_FIELDS),
  create(
    "teacher",
    "test_sections",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { test_version_id: { _nnull: true } },
    ),
    TEST_SECTION_WRITE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "test_sections",
    teacherSection,
    TEST_SECTION_WRITE_FIELDS.filter((f) => f !== "test_version_id"),
  ),
  read("teacher", "test_version_questions", teacherVersionQuestion, TEST_VERSION_QUESTION_FIELDS),
  create(
    "teacher",
    "test_version_questions",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { test_version_id: { _nnull: true } },
    ),
    TEST_VERSION_QUESTION_WRITE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  read("teacher", "test_assignments", teacherAssignmentTarget, TEST_ASSIGNMENT_FIELDS),
  create(
    "teacher",
    "test_assignments",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { test_id: { _nnull: true } },
    ),
    TEST_ASSIGNMENT_CREATE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "test_assignments",
    teacherAssignmentTarget,
    ["test_version_id", "available_from", "due_at", "max_attempts_override", "enabled"],
  ),
  read("teacher", "test_attempts", teacherAttempt, TEST_ATTEMPT_FIELDS),
  update(
    "teacher",
    "test_attempts",
    teacherAttempt,
    ["status", "score", "max_score", "graded_at", "graded_by_teacher_id", "teacher_feedback"],
  ),
  read("teacher", "test_attempt_questions", teacherAttemptQuestion, TEST_ATTEMPT_QUESTION_FIELDS),
  read("teacher", "test_attempt_answers", teacherAttemptAnswer, TEST_ATTEMPT_ANSWER_FIELDS),
  update(
    "teacher",
    "test_attempt_answers",
    teacherAttemptAnswer,
    ["is_correct", "score_awarded"],
  ),
  read("teacher", "question_import_batches", teacherOwnedQuestion, QUESTION_IMPORT_BATCH_FIELDS),
  create(
    "teacher",
    "question_import_batches",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { created_by_user_id: eq(CURRENT_USER) },
    ),
    QUESTION_IMPORT_BATCH_WRITE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "teacher",
    "question_import_batches",
    teacherOwnedQuestion,
    QUESTION_IMPORT_BATCH_WRITE_FIELDS,
  ),
  read("teacher", "test_results", { student_id: teacherStudent }, TEST_RESULT_FIELDS),
  update(
    "teacher",
    "test_results",
    { student_id: teacherStudent },
    ["status", "score", "max_score", "teacher_feedback", "graded_at"],
  ),
  read(
    "teacher",
    "pedagogical_reports",
    teacherStudentReport,
    PEDAGOGICAL_REPORT_FIELDS,
  ),
  create(
    "teacher",
    "pedagogical_reports",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { student_id: { _nnull: true } },
      { title: { _nnull: true } },
    ),
    PEDAGOGICAL_REPORT_CREATE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "pedagogical_reports",
    teacherStudentReport,
    [
      "title",
      "language",
      "period_start",
      "period_end",
      "version",
      "status",
      "narrative",
      "structured_content",
      "generation_context",
      "model_name",
      "model_version",
      "generated_at",
      "reviewed_at",
      "finalized_at",
    ],
  ),
  read("teacher", "class_reports", teacherClassReport, CLASS_REPORT_FIELDS),
  create(
    "teacher",
    "class_reports",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { class_id: { _nnull: true } },
      { title: { _nnull: true } },
    ),
    CLASS_REPORT_CREATE_FIELDS,
    { school_id: CURRENT_USER_SCHOOL },
  ),
  update(
    "teacher",
    "class_reports",
    teacherClassReport,
    [
      "title",
      "language",
      "period_start",
      "period_end",
      "version",
      "status",
      "narrative",
      "structured_content",
      "generation_context",
      "model_name",
      "model_version",
      "generated_at",
      "reviewed_at",
      "finalized_at",
    ],
  ),
  read(
    "teacher",
    "directus_files",
    { [follow("resources", "directus_file_id")]: teacherResource },
    DIRECTUS_FILE_READ_FIELDS,
  ),
  read("teacher", "question_bank_items", teacherQuestion, QUESTION_FIELDS),
  create(
    "teacher",
    "question_bank_items",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { created_by_user_id: eq(CURRENT_USER) },
      { visibility: { _in: ["private", "school"] } },
    ),
    QUESTION_WRITE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "teacher",
    "question_bank_items",
    teacherOwnedQuestion,
    QUESTION_WRITE_FIELDS,
  ),
  read("teacher", "question_options", teacherQuestionOption, QUESTION_OPTION_FIELDS),
  create(
    "teacher",
    "question_options",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { created_by_user_id: eq(CURRENT_USER) },
      { question_id: { _nnull: true } },
    ),
    QUESTION_OPTION_WRITE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "teacher",
    "question_options",
    teacherOwnedQuestionOption,
    QUESTION_OPTION_WRITE_FIELDS.filter((field) => field !== "question_id"),
  ),

  ...curriculumReads("director"),
  read("director", "directus_users", directorUser, DIRECTUS_USER_READ_FIELDS),
  create(
    "director",
    "directus_users",
    and({ role: { _nnull: true } }, { status: eq("active") }),
    ["id", "email", "password", "first_name", "last_name", "role", "status"],
    directorSchoolPreset,
  ),
  update(
    "director",
    "directus_users",
    directorUser,
    ["password", "first_name", "last_name", "status"],
  ),
  read(
    "director",
    "directus_roles",
    { name: { _in: ["Teacher", "Student", "Director"] } },
    DIRECTUS_ROLE_READ_FIELDS,
  ),
  read("director", "schools", directorSchool, SCHOOL_FIELDS),
  update(
    "director",
    "schools",
    directorSchool,
    ["name", "code", "slug", "default_language", "time_zone", "educational_system", "active"],
  ),
  read("director", "student_profiles", directorItem, STUDENT_PROFILE_FIELDS),
  update(
    "director",
    "student_profiles",
    directorItem,
    [
      "directus_user_id",
      "external_id",
      "first_name",
      "last_name",
      "preferred_name",
      "email",
      "date_of_birth",
      "preferred_language",
      "sex",
      "has_diagnosis",
      "needs_evaluation",
      "diagnosis_notes",
      "active",
    ],
  ),
  create(
    "director",
    "student_profiles",
    directorItem,
    STUDENT_PROFILE_CREATE_FIELDS,
    directorSchoolPreset,
  ),
  read("director", "teacher_profiles", directorItem, TEACHER_PROFILE_FIELDS),
  update(
    "director",
    "teacher_profiles",
    directorItem,
    [
      "employee_id",
      "first_name",
      "last_name",
      "email",
      "preferred_language",
      "active",
    ],
  ),
  create(
    "director",
    "teacher_profiles",
    directorItem,
    TEACHER_PROFILE_CREATE_FIELDS,
    directorSchoolPreset,
  ),
  read("director", "classes", directorItem, CLASS_FIELDS),
  update(
    "director",
    "classes",
    directorItem,
    ["name", "code", "academic_year", "grade_level", "starts_on", "ends_on", "active"],
  ),
  create("director", "classes", directorItem, CLASS_CREATE_FIELDS, directorSchoolPreset),
  read("director", "class_students", directorItem, CLASS_STUDENT_FIELDS),
  update(
    "director",
    "class_students",
    directorItem,
    ["class_id", "student_id", "enrolled_on", "left_on", "active"],
  ),
  create(
    "director",
    "class_students",
    directorItem,
    CLASS_STUDENT_CREATE_FIELDS,
    directorSchoolPreset,
  ),
  read("director", "class_teachers", directorItem, CLASS_TEACHER_FIELDS),
  update(
    "director",
    "class_teachers",
    directorItem,
    ["class_id", "teacher_id", "assigned_on", "unassigned_on", "active"],
  ),
  create(
    "director",
    "class_teachers",
    directorItem,
    CLASS_TEACHER_CREATE_FIELDS,
    directorSchoolPreset,
  ),
  read("director", "resources", directorItem, RESOURCE_FIELDS),
  create("director", "resources", directorItem, RESOURCE_CREATE_FIELDS, directorSchoolPreset),
  update(
    "director",
    "resources",
    directorItem,
    [
      "created_by_teacher_id",
      "title",
      "description",
      "resource_type",
      "status",
      "language",
      "course_id",
      "category_id",
      "domain_id",
      "cluster_id",
      "standard_id",
      "target_level",
      "url",
      "directus_file_id",
      "body",
      "metadata",
      "published_at",
    ],
  ),
  read(
    "director",
    "student_domain_evaluations",
    directorItem,
    STUDENT_DOMAIN_EVALUATION_FIELDS,
  ),
  read(
    "director",
    "student_standard_evaluations",
    directorItem,
    STUDENT_STANDARD_EVALUATION_FIELDS,
  ),
  read(
    "director",
    "student_substandard_evaluations",
    directorItem,
    STUDENT_SUBSTANDARD_EVALUATION_FIELDS,
  ),
  read(
    "director",
    "student_support_predictions",
    directorItem,
    STUDENT_SUPPORT_PREDICTION_FIELDS,
  ),
  read(
    "director",
    "resource_curriculum_alignments",
    directorItem,
    RESOURCE_CURRICULUM_ALIGNMENT_FIELDS,
  ),
  create(
    "director",
    "resource_curriculum_alignments",
    directorItem,
    RESOURCE_CURRICULUM_ALIGNMENT_WRITE_FIELDS,
    directorSchoolPreset,
  ),
  update(
    "director",
    "resource_curriculum_alignments",
    directorItem,
    RESOURCE_CURRICULUM_ALIGNMENT_WRITE_FIELDS,
  ),
  read(
    "director",
    "question_course_alignments",
    directorItem,
    QUESTION_COURSE_ALIGNMENT_FIELDS,
  ),
  create(
    "director",
    "question_course_alignments",
    directorItem,
    QUESTION_COURSE_ALIGNMENT_WRITE_FIELDS,
    directorSchoolPreset,
  ),
  read(
    "director",
    "resource_assignments",
    directorItem,
    RESOURCE_ASSIGNMENT_FIELDS,
  ),
  update(
    "director",
    "resource_assignments",
    directorItem,
    [
      "resource_id",
      "class_id",
      "student_id",
      "assigned_by_teacher_id",
      "available_from",
      "due_at",
      "active",
    ],
  ),
  read("director", "tests", directorItem, TEST_FIELDS),
  create("director", "tests", directorItem, TEST_CREATE_FIELDS, directorSchoolPreset),
  update(
    "director",
    "tests",
    directorItem,
    [
      "created_by_teacher_id",
      "title",
      "description",
      "instructions",
      "status",
      "language",
      "duration_minutes",
      "max_attempts",
      "max_score",
      "definition",
      "published_at",
    ],
  ),
  read("director", "test_blueprint_rules", directorItem, TEST_BLUEPRINT_RULE_FIELDS),
  create("director", "test_blueprint_rules", directorItem, TEST_BLUEPRINT_RULE_WRITE_FIELDS, directorSchoolPreset),
  update(
    "director",
    "test_blueprint_rules",
    directorItem,
    TEST_BLUEPRINT_RULE_WRITE_FIELDS.filter((f) => f !== "test_id"),
  ),
  read("director", "test_versions", directorItem, TEST_VERSION_FIELDS),
  create("director", "test_versions", directorItem, TEST_VERSION_WRITE_FIELDS, directorSchoolPreset),
  update(
    "director",
    "test_versions",
    directorItem,
    TEST_VERSION_WRITE_FIELDS.filter((f) => f !== "test_id"),
  ),
  read("director", "test_sections", directorItem, TEST_SECTION_FIELDS),
  create("director", "test_sections", directorItem, TEST_SECTION_WRITE_FIELDS, directorSchoolPreset),
  update(
    "director",
    "test_sections",
    directorItem,
    TEST_SECTION_WRITE_FIELDS.filter((f) => f !== "test_version_id"),
  ),
  read("director", "test_version_questions", directorItem, TEST_VERSION_QUESTION_FIELDS),
  create("director", "test_version_questions", directorItem, TEST_VERSION_QUESTION_WRITE_FIELDS, directorSchoolPreset),
  read("director", "test_assignments", directorItem, TEST_ASSIGNMENT_FIELDS),
  create("director", "test_assignments", directorItem, TEST_ASSIGNMENT_CREATE_FIELDS, directorSchoolPreset),
  update(
    "director",
    "test_assignments",
    directorItem,
    [
      "test_id",
      "test_version_id",
      "class_id",
      "student_id",
      "assigned_by_teacher_id",
      "available_from",
      "due_at",
      "max_attempts_override",
      "enabled",
    ],
  ),
  read("director", "test_attempts", directorItem, TEST_ATTEMPT_FIELDS),
  update(
    "director",
    "test_attempts",
    directorItem,
    ["status", "score", "max_score", "graded_at", "graded_by_teacher_id", "teacher_feedback"],
  ),
  read("director", "test_attempt_questions", directorItem, TEST_ATTEMPT_QUESTION_FIELDS),
  read("director", "test_attempt_answers", directorItem, TEST_ATTEMPT_ANSWER_FIELDS),
  update(
    "director",
    "test_attempt_answers",
    directorItem,
    ["is_correct", "score_awarded"],
  ),
  read("director", "question_import_batches", directorItem, QUESTION_IMPORT_BATCH_FIELDS),
  create("director", "question_import_batches", directorItem, QUESTION_IMPORT_BATCH_WRITE_FIELDS, directorSchoolPreset),
  update("director", "question_import_batches", directorItem, QUESTION_IMPORT_BATCH_WRITE_FIELDS),
  read("director", "test_results", directorItem, TEST_RESULT_FIELDS),
  update(
    "director",
    "test_results",
    directorItem,
    [
      "status",
      "score",
      "max_score",
      "scoring_details",
      "teacher_feedback",
      "graded_by_teacher_id",
      "submitted_at",
      "graded_at",
    ],
  ),
  read(
    "director",
    "pedagogical_reports",
    directorItem,
    PEDAGOGICAL_REPORT_FIELDS,
  ),
  create(
    "director",
    "pedagogical_reports",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { student_id: { _nnull: true } },
      { title: { _nnull: true } },
    ),
    PEDAGOGICAL_REPORT_CREATE_FIELDS,
    directorSchoolPreset,
  ),
  update(
    "director",
    "pedagogical_reports",
    directorItem,
    [
      "student_id",
      "class_id",
      "created_by_teacher_id",
      "title",
      "language",
      "period_start",
      "period_end",
      "version",
      "status",
      "narrative",
      "structured_content",
      "generation_context",
      "model_name",
      "model_version",
      "generated_at",
      "reviewed_at",
      "finalized_at",
    ],
  ),
  read("director", "class_reports", directorItem, CLASS_REPORT_FIELDS),
  create(
    "director",
    "class_reports",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { class_id: { _nnull: true } },
      { title: { _nnull: true } },
    ),
    CLASS_REPORT_CREATE_FIELDS,
    directorSchoolPreset,
  ),
  update(
    "director",
    "class_reports",
    directorItem,
    [
      "class_id",
      "created_by_teacher_id",
      "title",
      "language",
      "period_start",
      "period_end",
      "version",
      "status",
      "narrative",
      "structured_content",
      "generation_context",
      "model_name",
      "model_version",
      "generated_at",
      "reviewed_at",
      "finalized_at",
    ],
  ),
  read(
    "director",
    "directus_files",
    { [follow("resources", "directus_file_id")]: directorItem },
    DIRECTUS_FILE_READ_FIELDS,
  ),
  read("director", "question_bank_items", directorQuestion, QUESTION_FIELDS),
  create(
    "director",
    "question_bank_items",
    and(
      directorItem,
      { created_by_user_id: eq(CURRENT_USER) },
      { visibility: { _in: ["private", "school"] } },
    ),
    QUESTION_WRITE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "director",
    "question_bank_items",
    directorItem,
    QUESTION_WRITE_FIELDS,
  ),
  read("director", "question_options", directorQuestionOption, QUESTION_OPTION_FIELDS),
  create(
    "director",
    "question_options",
    and(
      { school_id: eq(CURRENT_USER_SCHOOL) },
      { created_by_user_id: eq(CURRENT_USER) },
      { question_id: { _nnull: true } },
    ),
    QUESTION_OPTION_WRITE_FIELDS,
    questionCreatorPreset,
  ),
  update(
    "director",
    "question_options",
    { created_by_user_id: eq(CURRENT_USER) },
    QUESTION_OPTION_WRITE_FIELDS.filter((field) => field !== "question_id"),
  ),
];

export const REQUIRED_COLLECTIONS = [
  "schools",
  "student_profiles",
  "teacher_profiles",
  "classes",
  "class_students",
  "class_teachers",
  "resources",
  "resource_assignments",
  "curriculum_categories",
  "curriculum_courses",
  "curriculum_domains",
  "curriculum_clusters",
  "curriculum_standards",
  "curriculum_substandards",
  "curriculum_course_domains",
  "curriculum_course_standards",
  "curriculum_course_substandards",
  "curriculum_lookup_aliases",
  "question_bank_items",
  "question_options",
  "question_import_batches",
  "tests",
  "test_versions",
  "test_sections",
  "test_blueprint_rules",
  "test_version_questions",
  "test_assignments",
  "test_attempts",
  "test_attempt_questions",
  "test_attempt_answers",
  "test_results",
  "pedagogical_reports",
  "class_reports",
  "question_course_alignments",
  "resource_curriculum_alignments",
  "student_standard_evaluations",
  "student_substandard_evaluations",
  "student_support_predictions",
  "directus_users",
  "directus_roles",
  "directus_files",
];

export const REQUIRED_RELATIONS = [
  ["student_profiles", "school_id", "schools"],
  ["student_profiles", "directus_user_id", "directus_users"],
  ["teacher_profiles", "school_id", "schools"],
  ["teacher_profiles", "directus_user_id", "directus_users"],
  ["directus_users", "school_id", "schools"],
  ["classes", "school_id", "schools"],
  ["class_students", "school_id", "schools"],
  ["class_students", "class_id", "classes"],
  ["class_students", "student_id", "student_profiles"],
  ["class_teachers", "school_id", "schools"],
  ["class_teachers", "class_id", "classes"],
  ["class_teachers", "teacher_id", "teacher_profiles"],
  ["resources", "school_id", "schools"],
  ["resources", "created_by_teacher_id", "teacher_profiles"],
  ["resources", "directus_file_id", "directus_files"],
  ["resource_assignments", "school_id", "schools"],
  ["resource_assignments", "resource_id", "resources"],
  ["resource_assignments", "class_id", "classes"],
  ["resource_assignments", "student_id", "student_profiles"],
  ["curriculum_domains", "category_id", "curriculum_categories"],
  ["curriculum_clusters", "domain_id", "curriculum_domains"],
  ["curriculum_standards", "cluster_id", "curriculum_clusters"],
  ["curriculum_substandards", "standard_id", "curriculum_standards"],
  ["curriculum_course_domains", "course_id", "curriculum_courses"],
  ["curriculum_course_domains", "domain_id", "curriculum_domains"],
  ["curriculum_course_standards", "course_id", "curriculum_courses"],
  ["curriculum_course_standards", "standard_id", "curriculum_standards"],
  ["curriculum_course_substandards", "course_id", "curriculum_courses"],
  ["curriculum_course_substandards", "substandard_id", "curriculum_substandards"],
  ["curriculum_lookup_aliases", "standard_id", "curriculum_standards"],
  ["curriculum_lookup_aliases", "substandard_id", "curriculum_substandards"],
  ["question_bank_items", "school_id", "schools"],
  ["question_bank_items", "created_by_user_id", "directus_users"],
  ["question_bank_items", "created_by_teacher_id", "teacher_profiles"],
  ["question_bank_items", "domain_id", "curriculum_domains"],
  ["question_bank_items", "cluster_id", "curriculum_clusters"],
  ["question_bank_items", "standard_id", "curriculum_standards"],
  ["question_bank_items", "substandard_id", "curriculum_substandards"],
  ["question_options", "school_id", "schools"],
  ["question_options", "created_by_user_id", "directus_users"],
  ["question_options", "question_id", "question_bank_items"],
  ["question_import_batches", "school_id", "schools"],
  ["question_import_batches", "created_by_user_id", "directus_users"],
  ["question_import_batches", "created_by_teacher_id", "teacher_profiles"],
  ["tests", "school_id", "schools"],
  ["tests", "created_by_user_id", "directus_users"],
  ["tests", "created_by_teacher_id", "teacher_profiles"],
  ["test_versions", "school_id", "schools"],
  ["test_versions", "test_id", "tests"],
  ["test_versions", "created_by_user_id", "directus_users"],
  ["test_versions", "created_by_teacher_id", "teacher_profiles"],
  ["test_sections", "school_id", "schools"],
  ["test_sections", "test_version_id", "test_versions"],
  ["test_blueprint_rules", "school_id", "schools"],
  ["test_blueprint_rules", "test_id", "tests"],
  ["test_version_questions", "school_id", "schools"],
  ["test_version_questions", "test_version_id", "test_versions"],
  ["test_version_questions", "question_id", "question_bank_items"],
  ["test_version_questions", "section_id", "test_sections"],
  ["test_version_questions", "course_id", "curriculum_courses"],
  ["test_assignments", "school_id", "schools"],
  ["test_assignments", "test_id", "tests"],
  ["test_assignments", "test_version_id", "test_versions"],
  ["test_assignments", "class_id", "classes"],
  ["test_assignments", "student_id", "student_profiles"],
  ["test_attempts", "school_id", "schools"],
  ["test_attempts", "test_assignment_id", "test_assignments"],
  ["test_attempts", "test_version_id", "test_versions"],
  ["test_attempts", "student_id", "student_profiles"],
  ["test_attempt_questions", "school_id", "schools"],
  ["test_attempt_questions", "attempt_id", "test_attempts"],
  ["test_attempt_questions", "test_version_question_id", "test_version_questions"],
  ["test_attempt_answers", "school_id", "schools"],
  ["test_attempt_answers", "attempt_question_id", "test_attempt_questions"],
  ["test_results", "school_id", "schools"],
  ["test_results", "student_id", "student_profiles"],
  ["pedagogical_reports", "school_id", "schools"],
  ["pedagogical_reports", "student_id", "student_profiles"],
  ["pedagogical_reports", "class_id", "classes"],
  ["class_reports", "school_id", "schools"],
  ["class_reports", "class_id", "classes"],
  ["question_course_alignments", "school_id", "schools"],
  ["question_course_alignments", "question_id", "question_bank_items"],
  ["question_course_alignments", "course_id", "curriculum_courses"],
  ["resource_curriculum_alignments", "school_id", "schools"],
  ["resource_curriculum_alignments", "resource_id", "resources"],
  ["resource_curriculum_alignments", "course_id", "curriculum_courses"],
  ["resource_curriculum_alignments", "domain_id", "curriculum_domains"],
  ["resource_curriculum_alignments", "standard_id", "curriculum_standards"],
  ["resource_curriculum_alignments", "substandard_id", "curriculum_substandards"],
  ["student_standard_evaluations", "school_id", "schools"],
  ["student_standard_evaluations", "student_id", "student_profiles"],
  ["student_standard_evaluations", "course_id", "curriculum_courses"],
  ["student_standard_evaluations", "standard_id", "curriculum_standards"],
  ["student_substandard_evaluations", "school_id", "schools"],
  ["student_substandard_evaluations", "student_id", "student_profiles"],
  ["student_substandard_evaluations", "course_id", "curriculum_courses"],
  ["student_substandard_evaluations", "substandard_id", "curriculum_substandards"],
  ["student_substandard_evaluations", "standard_id", "curriculum_standards"],
  ["student_support_predictions", "school_id", "schools"],
  ["student_support_predictions", "student_id", "student_profiles"],
];

export const MANIFEST = {
  roles: ROLE_DEFINITIONS,
  policies: POLICY_DEFINITIONS,
  permissions: PERMISSION_DEFINITIONS,
  required_collections: REQUIRED_COLLECTIONS,
  required_relations: REQUIRED_RELATIONS,
};
