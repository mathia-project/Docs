export type Identifier = string;
export type IsoDate = string;
export type IsoDateTime = string;
export type Relation<T> = Identifier | T;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type PublishableStatus = "draft" | "published" | "archived";
export type ResourceType =
  | "document"
  | "link"
  | "video"
  | "audio"
  | "image"
  | "exercise"
  | "other";
export type TestResultStatus = "in_progress" | "submitted" | "graded" | "voided";
export type ReportStatus = "draft" | "generated" | "reviewed" | "finalized" | "archived";
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "numeric"
  | "short_text";
export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionVisibility = "private" | "school" | "global";
export type SupportPredictionStatus =
  | "support_suggested"
  | "no_support_signal"
  | "insufficient_information"
  | "diagnosis_recorded";
export type SupportEvidenceLevel = "insufficient" | "limited" | "standard";

export interface DirectusRoleRecord {
  id: Identifier;
  name: string;
}

export interface DirectusUserRecord {
  id: Identifier;
  email: string | null;
  password?: string;
  first_name: string | null;
  last_name: string | null;
  role: Relation<DirectusRoleRecord> | null;
  status?: string;
}

export interface DirectusFileRecord {
  id: Identifier;
}

export type EducationalSystem = "ES" | "IT";
export type StudentSex = "male" | "female" | "other";

export interface School {
  id: Identifier;
  name: string;
  code: string;
  slug: string;
  default_language: string;
  time_zone: string;
  educational_system: EducationalSystem;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StudentProfile {
  id: Identifier;
  school_id: Relation<School>;
  directus_user_id: Relation<DirectusUserRecord> | null;
  external_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
  date_of_birth: IsoDate | null;
  preferred_language: string;
  sex: StudentSex | null;
  has_diagnosis?: boolean | undefined;
  needs_evaluation?: boolean | undefined;
  diagnosis_notes?: string | null | undefined;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TeacherProfile {
  id: Identifier;
  school_id: Relation<School>;
  directus_user_id: Relation<DirectusUserRecord> | null;
  employee_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  preferred_language: string;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface ClassRecord {
  id: Identifier;
  school_id: Relation<School>;
  name: string;
  code: string;
  academic_year: string;
  grade_level: string | null;
  starts_on: IsoDate | null;
  ends_on: IsoDate | null;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface ClassStudent {
  id: Identifier;
  school_id: Relation<School>;
  class_id: Relation<ClassRecord>;
  student_id: Relation<StudentProfile>;
  enrolled_on: IsoDate;
  left_on: IsoDate | null;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface ClassTeacher {
  id: Identifier;
  school_id: Relation<School>;
  class_id: Relation<ClassRecord>;
  teacher_id: Relation<TeacherProfile>;
  assigned_on: IsoDate;
  unassigned_on: IsoDate | null;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export type ResourceTargetLevel = "reinforcement" | "practice" | "enrichment";

export interface Resource {
  id: Identifier;
  school_id: Relation<School>;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  title: string;
  description: string | null;
  resource_type: ResourceType;
  status: PublishableStatus;
  language: string;
  course_id: Relation<CurriculumCourse> | null;
  category_id: Relation<CurriculumCategory> | null;
  domain_id: Relation<CurriculumDomain> | null;
  cluster_id: Relation<CurriculumCluster> | null;
  standard_id: Relation<CurriculumStandard> | null;
  substandard_id: Relation<CurriculumSubstandard> | null;
  target_level: ResourceTargetLevel;
  url: string | null;
  directus_file_id: Relation<DirectusFileRecord> | null;
  body: string | null;
  metadata: JsonObject;
  published_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StudentDomainEvaluation {
  id: Identifier;
  school_id: Relation<School>;
  student_id: Relation<StudentProfile>;
  domain_id: string;
  category_id: string | null;
  score: number | null;
  is_baseline: boolean;
  evaluations_count: number;
  correct_questions_count: number;
  total_questions_count: number;
  total_score_awarded: number;
  total_max_score: number;
  last_attempt_id: Relation<TestAttempt> | null;
  last_evaluated_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StudentStandardEvaluation {
  id: Identifier;
  school_id: Relation<School>;
  student_id: Relation<StudentProfile>;
  course_id: Relation<CurriculumCourse> | string;
  standard_id: Relation<CurriculumStandard> | string;
  score: number | null;
  evaluations_count: number;
  correct_questions_count: number;
  total_questions_count: number;
  total_score_awarded: number;
  total_max_score: number;
  last_attempt_id: Relation<TestAttempt> | null;
  last_evaluated_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StudentSubstandardEvaluation {
  id: Identifier;
  school_id: Relation<School>;
  student_id: Relation<StudentProfile>;
  course_id: Relation<CurriculumCourse> | string;
  substandard_id: Relation<CurriculumSubstandard> | string;
  standard_id: Relation<CurriculumStandard> | string;
  score: number | null;
  evaluations_count: number;
  correct_questions_count: number;
  total_questions_count: number;
  total_score_awarded: number;
  total_max_score: number;
  last_attempt_id: Relation<TestAttempt> | null;
  last_evaluated_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface QuestionCourseAlignment {
  id: Identifier;
  school_id: Relation<School>;
  question_id: Relation<QuestionBankItem>;
  course_id: Relation<CurriculumCourse>;
  domain_id: Relation<CurriculumDomain> | null;
  standard_id: Relation<CurriculumStandard> | null;
  substandard_id: Relation<CurriculumSubstandard> | null;
  created_at: IsoDateTime;
}

export interface ResourceCurriculumAlignment {
  id: Identifier;
  school_id: Relation<School>;
  resource_id: Relation<Resource>;
  course_id: Relation<CurriculumCourse>;
  domain_id: Relation<CurriculumDomain> | null;
  standard_id: Relation<CurriculumStandard> | null;
  substandard_id: Relation<CurriculumSubstandard> | null;
  created_at: IsoDateTime;
}

export interface ResourceAssignment {
  id: Identifier;
  school_id: Relation<School>;
  resource_id: Relation<Resource>;
  class_id: Relation<ClassRecord> | null;
  student_id: Relation<StudentProfile> | null;
  assigned_by_teacher_id: Relation<TeacherProfile> | null;
  available_from: IsoDateTime | null;
  due_at: IsoDateTime | null;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestRecord {
  id: Identifier;
  school_id: Relation<School>;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  title: string;
  description: string | null;
  instructions: string | null;
  status: PublishableStatus;
  language: string;
  duration_minutes: number | null;
  max_attempts: number;
  max_score: number | null;
  definition: JsonObject;
  published_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestAssignment {
  id: Identifier;
  school_id: Relation<School>;
  test_id: Relation<TestRecord>;
  test_version_id?: Relation<TestVersion> | null;
  class_id: Relation<ClassRecord> | null;
  student_id: Relation<StudentProfile> | null;
  assigned_by_teacher_id: Relation<TeacherProfile> | null;
  available_from: IsoDateTime | null;
  due_at: IsoDateTime | null;
  max_attempts_override: number | null;
  enabled: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestResult {
  id: Identifier;
  school_id: Relation<School>;
  test_assignment_id: Relation<TestAssignment>;
  student_id: Relation<StudentProfile>;
  attempt_number: number;
  status: TestResultStatus;
  score: number | null;
  max_score: number | null;
  answers: JsonObject | JsonValue[];
  scoring_details: JsonObject;
  teacher_feedback: string | null;
  graded_by_teacher_id: Relation<TeacherProfile> | null;
  started_at: IsoDateTime;
  submitted_at: IsoDateTime | null;
  graded_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface LocalizedText extends JsonObject {
  en: string;
  es: string;
}

export interface CurriculumCategory {
  id: Identifier;
  code: string;
  name: LocalizedText;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumCourse {
  id: Identifier;
  grade_level: number;
  name: LocalizedText;
  spanish_equivalent: JsonObject | null;
  italian_equivalent: JsonObject | null;
  pathway: JsonObject;
  source: JsonObject;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumDomain {
  id: Identifier;
  category_id: Relation<CurriculumCategory>;
  code: string;
  name: LocalizedText;
  category_assignment: "official" | "project_crosswalk";
  source: JsonObject;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumCluster {
  id: Identifier;
  domain_id: Relation<CurriculumDomain>;
  code: string;
  name: LocalizedText;
  source: JsonObject;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumStandard {
  id: Identifier;
  cluster_id: Relation<CurriculumCluster>;
  code: string;
  ccss_id: string;
  description: LocalizedText;
  markers: JsonObject;
  source: JsonObject;
  notes: JsonValue[];
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumSubstandard {
  id: Identifier;
  standard_id: Relation<CurriculumStandard>;
  code: string;
  ccss_id: string;
  description: LocalizedText;
  markers: JsonObject;
  source: JsonObject;
  active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumCourseStandard {
  id: Identifier;
  course_id: Relation<CurriculumCourse>;
  standard_id: Relation<CurriculumStandard>;
  inclusion: "listed" | "optional_extension";
  coverage: JsonValue[];
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumCourseSubstandard {
  id: Identifier;
  course_id: Relation<CurriculumCourse>;
  substandard_id: Relation<CurriculumSubstandard>;
  inclusion: "listed" | "optional_extension";
  coverage: JsonValue[];
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface CurriculumCourseDomain {
  id: Identifier;
  course_id: Relation<CurriculumCourse>;
  domain_id: Relation<CurriculumDomain>;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface CurriculumLookupAlias {
  alias: string;
  item_kind: "standard" | "substandard";
  standard_id: Relation<CurriculumStandard> | null;
  substandard_id: Relation<CurriculumSubstandard> | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface QuestionBankItem {
  id: Identifier;
  school_id: Relation<School> | null;
  created_by_user_id: Relation<DirectusUserRecord> | null;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  external_id: string | null;
  question_type: QuestionType;
  prompt: string;
  explanation: string | null;
  difficulty: QuestionDifficulty;
  language: string;
  domain_id: Relation<CurriculumDomain>;
  cluster_id: Relation<CurriculumCluster> | null;
  standard_id: Relation<CurriculumStandard> | null;
  substandard_id: Relation<CurriculumSubstandard> | null;
  visibility: QuestionVisibility;
  status: PublishableStatus;
  source: "manual" | "csv" | "ai" | "migrated";
  source_reference: string | null;
  answer_config: JsonObject;
  metadata: JsonObject;
  published_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface QuestionOption {
  id: Identifier;
  school_id: Relation<School> | null;
  created_by_user_id: Relation<DirectusUserRecord> | null;
  question_id: Relation<QuestionBankItem>;
  option_key: string;
  content: string;
  is_correct: boolean;
  position: number;
  feedback: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface StudentSupportPrediction {
  id: Identifier;
  school_id: Relation<School>;
  student_id: Relation<StudentProfile>;
  suggests_educational_support: boolean | null;
  status: SupportPredictionStatus;
  attention_index: number | null;
  applied_threshold: number | null;
  model_name: string;
  model_version: string;
  model_route: string;
  evidence_level: SupportEvidenceLevel;
  total_responses: number;
  valid_response_times: number;
  volume_outside_fit_range: boolean;
  warnings: string[];
  reason: string | null;
  generated_at: IsoDateTime;
  created_at: IsoDateTime;
}

export interface PedagogicalReport {
  id: Identifier;
  school_id: Relation<School>;
  student_id: Relation<StudentProfile>;
  class_id: Relation<ClassRecord> | null;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  title: string;
  language: string;
  period_start: IsoDate | null;
  period_end: IsoDate | null;
  version: number;
  status: ReportStatus;
  narrative: string | null;
  structured_content: JsonObject;
  generation_context: JsonObject;
  model_name: string | null;
  model_version: string | null;
  generated_at: IsoDateTime | null;
  reviewed_at: IsoDateTime | null;
  finalized_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface ClassReport {
  id: Identifier;
  school_id: Relation<School>;
  class_id: Relation<ClassRecord>;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  title: string;
  language: string;
  period_start: IsoDate | null;
  period_end: IsoDate | null;
  version: number;
  status: ReportStatus;
  narrative: string | null;
  structured_content: JsonObject;
  generation_context: JsonObject;
  model_name: string | null;
  model_version: string | null;
  generated_at: IsoDateTime | null;
  reviewed_at: IsoDateTime | null;
  finalized_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface QuestionImportBatch {
  id: Identifier;
  school_id: Relation<School>;
  created_by_user_id: Relation<DirectusUserRecord> | null;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  source: "manual" | "csv" | "ai" | "migrated";
  filename: string | null;
  schema_version: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  result_summary: JsonObject;
  created_at: IsoDateTime;
  completed_at: IsoDateTime | null;
}

export interface TestVersion {
  id: Identifier;
  school_id: Relation<School>;
  test_id: Relation<TestRecord>;
  version_number: number;
  instructions: string | null;
  language: string;
  duration_minutes: number | null;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  status: "published" | "archived";
  max_score: number;
  published_at: IsoDateTime;
  created_by_user_id: Relation<DirectusUserRecord> | null;
  created_by_teacher_id: Relation<TeacherProfile> | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestSection {
  id: Identifier;
  school_id: Relation<School>;
  test_version_id: Relation<TestVersion>;
  title: string;
  position: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestBlueprintRule {
  id: Identifier;
  school_id: Relation<School>;
  test_id: Relation<TestRecord>;
  section_title: string;
  category_id: Relation<CurriculumCategory> | null;
  domain_id: Relation<CurriculumDomain> | null;
  cluster_id: Relation<CurriculumCluster> | null;
  standard_id: Relation<CurriculumStandard> | null;
  substandard_id: Relation<CurriculumSubstandard> | null;
  difficulty: QuestionDifficulty | null;
  question_type: QuestionType | null;
  question_count: number;
  manual_question_ids: string[];
  position: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestVersionQuestion {
  id: Identifier;
  school_id: Relation<School>;
  test_version_id: Relation<TestVersion>;
  question_id: Relation<QuestionBankItem>;
  section_id: Relation<TestSection> | null;
  canonical_position: number;
  points: number;
  course_id?: Relation<CurriculumCourse> | string | null;
  scoring_key?: JsonObject | null;
  question_snapshot: JsonObject;
  created_at: IsoDateTime;
}

export type AttemptStatus = "in_progress" | "submitted" | "graded" | "expired" | "voided";

export interface TestAttempt {
  id: Identifier;
  school_id: Relation<School>;
  test_assignment_id: Relation<TestAssignment>;
  test_version_id: Relation<TestVersion>;
  student_id: Relation<StudentProfile>;
  attempt_number: number;
  random_seed: string;
  status: AttemptStatus;
  started_at: IsoDateTime;
  submitted_at: IsoDateTime | null;
  expires_at: IsoDateTime | null;
  score: number | null;
  max_score: number;
  graded_at: IsoDateTime | null;
  graded_by_teacher_id: Relation<TeacherProfile> | null;
  teacher_feedback: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestAttemptQuestion {
  id: Identifier;
  school_id: Relation<School>;
  attempt_id: Relation<TestAttempt>;
  test_version_question_id: Relation<TestVersionQuestion>;
  display_position: number;
  option_order: string[] | null;
  first_presented_at: IsoDateTime | null;
  last_presented_at: IsoDateTime | null;
  answered_at: IsoDateTime | null;
  active_duration_ms: number;
  visit_count: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface TestAttemptAnswer {
  id: Identifier;
  school_id: Relation<School>;
  attempt_question_id: Relation<TestAttemptQuestion>;
  answer_payload: JsonObject;
  is_correct: boolean | null;
  score_awarded: number | null;
  answered_at: IsoDateTime;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface AppSchema {
  directus_files: DirectusFileRecord[];
  directus_roles: DirectusRoleRecord[];
  directus_users: DirectusUserRecord[];
  schools: School[];
  student_profiles: StudentProfile[];
  teacher_profiles: TeacherProfile[];
  classes: ClassRecord[];
  class_students: ClassStudent[];
  class_teachers: ClassTeacher[];
  resources: Resource[];
  resource_assignments: ResourceAssignment[];
  curriculum_categories: CurriculumCategory[];
  curriculum_courses: CurriculumCourse[];
  curriculum_domains: CurriculumDomain[];
  curriculum_clusters: CurriculumCluster[];
  curriculum_standards: CurriculumStandard[];
  curriculum_substandards: CurriculumSubstandard[];
  curriculum_course_domains: CurriculumCourseDomain[];
  curriculum_course_standards: CurriculumCourseStandard[];
  curriculum_course_substandards: CurriculumCourseSubstandard[];
  curriculum_lookup_aliases: CurriculumLookupAlias[];
  question_bank_items: QuestionBankItem[];
  question_options: QuestionOption[];
  question_import_batches: QuestionImportBatch[];
  question_course_alignments: QuestionCourseAlignment[];
  resource_curriculum_alignments: ResourceCurriculumAlignment[];
  tests: TestRecord[];
  test_versions: TestVersion[];
  test_sections: TestSection[];
  test_blueprint_rules: TestBlueprintRule[];
  test_version_questions: TestVersionQuestion[];
  test_assignments: TestAssignment[];
  test_attempts: TestAttempt[];
  test_attempt_questions: TestAttemptQuestion[];
  test_attempt_answers: TestAttemptAnswer[];
  test_results: TestResult[];
  student_domain_evaluations: StudentDomainEvaluation[];
  student_standard_evaluations: StudentStandardEvaluation[];
  student_substandard_evaluations: StudentSubstandardEvaluation[];
  student_support_predictions: StudentSupportPrediction[];
  pedagogical_reports: PedagogicalReport[];
  class_reports: ClassReport[];
}

