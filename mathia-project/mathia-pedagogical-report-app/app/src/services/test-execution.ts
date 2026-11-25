import {
  createItem,
  readItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directus } from "./directus";
import type {
  AttemptStatus,
  IsoDateTime,
  JsonObject,
  QuestionDifficulty,
  QuestionType,
  TestAssignment,
  TestAttempt,
  TestAttemptAnswer,
  TestAttemptQuestion,
  TestVersion,
  TestVersionQuestion,
} from "./schema";
import { appConfig } from "./config";
import { browserAuthenticationStorage } from "./auth-storage";

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
export function createPrng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using deterministic PRNG.
 */
export function deterministicShuffle<T>(array: readonly T[], prng: () => number): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    const temp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = temp;
  }
  return copy;
}

export interface StudentOptionView {
  option_key: string;
  content: string;
  position: number;
}

export interface StudentQuestionView {
  attempt_question_id: string;
  display_position: number;
  question_type: QuestionType;
  prompt: string;
  difficulty: QuestionDifficulty;
  language: string;
  options: StudentOptionView[];
  current_answer: Record<string, unknown> | null;
  active_duration_ms: number;
}

export interface StudentAttemptView {
  attempt_id: string;
  assignment_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: IsoDateTime;
  expires_at: IsoDateTime | null;
  duration_minutes: number | null;
  questions: StudentQuestionView[];
}

export interface AnswerEvaluationResult {
  is_correct: boolean;
  score_awarded: number;
}

export interface DomainBreakdownItem {
  domain_id: string;
  total_questions: number;
  correct_questions: number;
  score: number;
  max_score: number;
  accuracy_percent: number;
  average_duration_ms: number;
}

export interface QuestionReviewItem {
  attempt_question_id: string;
  display_position: number;
  prompt: string;
  question_type: QuestionType;
  difficulty: QuestionDifficulty;
  points: number;
  score_awarded: number;
  is_correct: boolean;
  active_duration_ms: number;
  student_answer: Record<string, unknown> | null;
  options?: any[] | undefined;
  domain_id?: string | undefined;
  standard_id?: string | undefined;
}

export interface AttemptReportBreakdown {
  attempt_id: string;
  total_score: number;
  max_score: number;
  score_percent: number;
  total_active_duration_ms: number;
  by_domain: Record<string, DomainBreakdownItem>;
  by_difficulty: Record<string, { total: number; correct: number; accuracy_percent: number }>;
  question_reviews?: QuestionReviewItem[];
}

/**
 * Strips all scoring keys, correct options, and teacher feedback before serving to students.
 */
export function sanitizeQuestionForStudent(
  snapshot: Record<string, unknown>,
  displayPosition: number,
  attemptQuestionId: string,
  optionOrder: string[] | null,
  currentAnswer: Record<string, unknown> | null = null,
  activeDurationMs = 0,
): StudentQuestionView {
  const rawOptions = (snapshot.options as Array<{
    option_key: string;
    content: string;
    position: number;
  }>) || [];

  let optionsToPresent: StudentOptionView[] = rawOptions.map((opt) => ({
    option_key: opt.option_key,
    content: opt.content,
    position: opt.position,
  }));

  if (optionOrder && optionOrder.length > 0) {
    const optMap = new Map(optionsToPresent.map((o) => [o.option_key, o]));
    const reordered: StudentOptionView[] = [];
    for (let i = 0; i < optionOrder.length; i++) {
      const key = optionOrder[i];
      if (key && optMap.has(key)) {
        reordered.push({ ...optMap.get(key)!, position: reordered.length + 1 });
        optMap.delete(key);
      }
    }
    // Append any options that were not covered by optionOrder
    for (const remaining of optMap.values()) {
      reordered.push({ ...remaining, position: reordered.length + 1 });
    }
    if (reordered.length > 0) {
      optionsToPresent = reordered;
    }
  }

  return {
    attempt_question_id: attemptQuestionId,
    display_position: displayPosition,
    question_type: snapshot.question_type as QuestionType,
    prompt: String(snapshot.prompt || ""),
    difficulty: (snapshot.difficulty || "medium") as QuestionDifficulty,
    language: String(snapshot.language || "es"),
    options: optionsToPresent,
    current_answer: currentAnswer,
    active_duration_ms: activeDurationMs,
  };
}

/**
 * Deterministically grades a single student answer against a frozen question snapshot.
 */
export function evaluateAnswer(
  snapshot: Record<string, unknown>,
  answerPayload: Record<string, unknown> | null | undefined,
  maxPoints = 1.0,
): AnswerEvaluationResult {
  if (!answerPayload) {
    return { is_correct: false, score_awarded: 0 };
  }

  const questionType = snapshot.question_type as QuestionType;
  const rawOptions = (snapshot.options as Array<{
    option_key: string;
    content: string;
    is_correct: boolean;
  }>) || [];

  switch (questionType) {
    case "single_choice": {
      const correctOpt = rawOptions.find((o) => o.is_correct);
      if (!correctOpt) return { is_correct: false, score_awarded: 0 };

      const studentKey = String(answerPayload.selected_option_key ?? "").trim();
      const isCorrect = studentKey === correctOpt.option_key;
      return {
        is_correct: isCorrect,
        score_awarded: isCorrect ? maxPoints : 0,
      };
    }

    case "multiple_choice": {
      const correctKeys = rawOptions
        .filter((o) => o.is_correct)
        .map((o) => o.option_key)
        .sort();

      const studentKeys = Array.isArray(answerPayload.selected_option_keys)
        ? (answerPayload.selected_option_keys as string[]).map((k) => String(k).trim()).sort()
        : [];

      const isCorrect =
        correctKeys.length === studentKeys.length &&
        correctKeys.every((key, idx) => key === studentKeys[idx]);

      return {
        is_correct: isCorrect,
        score_awarded: isCorrect ? maxPoints : 0,
      };
    }

    case "true_false": {
      const correctOpt = rawOptions.find((o) => o.is_correct);
      if (!correctOpt) return { is_correct: false, score_awarded: 0 };

      const studentKey = String(answerPayload.selected_option_key ?? "").trim();
      const isCorrect = studentKey === correctOpt.option_key;
      return {
        is_correct: isCorrect,
        score_awarded: isCorrect ? maxPoints : 0,
      };
    }

    case "numeric": {
      const answerConfig = (snapshot.answer_config as Record<string, unknown>) || {};
      const expected = Number(answerConfig.correct_value ?? answerConfig.expected_value);
      const tolerance = Number(answerConfig.tolerance ?? 0);
      const studentVal = Number(answerPayload.numeric_value);

      if (Number.isNaN(studentVal) || Number.isNaN(expected)) {
        return { is_correct: false, score_awarded: 0 };
      }

      const isCorrect = Math.abs(studentVal - expected) <= tolerance;
      return {
        is_correct: isCorrect,
        score_awarded: isCorrect ? maxPoints : 0,
      };
    }

    default:
      return { is_correct: false, score_awarded: 0 };
  }
}

export const testExecutionService = {
  /**
   * Starts a new attempt or resumes an in-progress attempt for a student.
   */
  async startAttempt(assignmentId: string, studentId: string): Promise<StudentAttemptView> {
    const assignment = (await directus.request(
      readItem("test_assignments", assignmentId),
    )) as TestAssignment;

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found.`);
    }

    if (!assignment.enabled) {
      throw new Error("This test assignment is currently disabled.");
    }

    const now = new Date();
    if (assignment.available_from && new Date(assignment.available_from) > now) {
      throw new Error("This test is not yet available.");
    }

    if (assignment.due_at && new Date(assignment.due_at) < now) {
      throw new Error("The deadline for this test has passed.");
    }

    const versionId =
      typeof assignment.test_version_id === "object"
        ? assignment.test_version_id?.id
        : assignment.test_version_id;

    if (!versionId) {
      throw new Error("Assignment is missing a published test version.");
    }

    const version = (await directus.request(
      readItem("test_versions", versionId),
    )) as TestVersion;

    // Check for an existing in-progress attempt
    const existingAttempts = (await directus.request(
      readItems("test_attempts", {
        filter: {
          test_assignment_id: { _eq: assignmentId },
          student_id: { _eq: studentId },
        },
        sort: ["-attempt_number"],
        limit: 10,
      }),
    )) as TestAttempt[];

    const activeAttempt = existingAttempts.find((a) => a.status === "in_progress");
    if (activeAttempt) {
      // Check expiration
      if (activeAttempt.expires_at && new Date(activeAttempt.expires_at) < now) {
        await this.expireAttempt(activeAttempt.id);
      } else {
        return this.getAttemptView(activeAttempt.id);
      }
    }

    // Check max attempts
    const allowedAttempts = assignment.max_attempts_override || version.max_attempts || 1;
    if (existingAttempts.length >= allowedAttempts) {
      throw new Error(`You have reached the maximum number of attempts (${allowedAttempts}).`);
    }

    const nextAttemptNumber = existingAttempts.length + 1;
    const randomSeed = `seed_${assignmentId}_${studentId}_${nextAttemptNumber}_${Date.now()}`;

    // Compute expires_at
    let expiresAt: string | null = null;
    if (version.duration_minutes && version.duration_minutes > 0) {
      const expDate = new Date(now.getTime() + version.duration_minutes * 60 * 1000);
      expiresAt = expDate.toISOString();
    }

    // Create the test_attempts record
    const attempt = (await directus.request(
      createItem("test_attempts", {
        test_assignment_id: assignment.id,
        test_version_id: version.id,
        student_id: studentId,
        attempt_number: nextAttemptNumber,
        random_seed: randomSeed,
        status: "in_progress",
        started_at: now.toISOString(),
        expires_at: expiresAt,
        max_score: version.max_score,
      }),
    )) as TestAttempt;

    // Read test_version_questions
    const versionQuestions = (await directus.request(
      readItems("test_version_questions", {
        filter: { test_version_id: { _eq: version.id } },
        sort: ["canonical_position"],
        limit: -1,
      }),
    )) as TestVersionQuestion[];

    // Initialize PRNG with the attempt seed
    const prng = createPrng(randomSeed);

    // Reproducibly shuffle questions if enabled
    const orderedVersionQuestions = version.shuffle_questions
      ? deterministicShuffle(versionQuestions, prng)
      : versionQuestions;

    // Materialize test_attempt_questions
    for (let i = 0; i < orderedVersionQuestions.length; i++) {
      const vq = orderedVersionQuestions[i];
      if (!vq) continue;
      const snapshot = vq.question_snapshot as Record<string, unknown>;
      const rawOptions = (snapshot.options as Array<{ option_key: string }>) || [];

      // Reproducibly shuffle options if enabled
      let optionOrder: string[] | null = null;
      if (version.shuffle_options && rawOptions.length > 0) {
        const shuffledOpts = deterministicShuffle(rawOptions, prng);
        optionOrder = shuffledOpts.map((o) => o.option_key);
      }

      await directus.request(
        createItem("test_attempt_questions", {
          attempt_id: attempt.id,
          test_version_question_id: vq.id,
          display_position: i + 1,
          option_order: optionOrder,
          active_duration_ms: 0,
          visit_count: 0,
        }),
      );
    }

    return this.getAttemptView(attempt.id);
  },

  /**
   * Retrieves sanitized attempt view for a student.
   */
  async getAttemptView(attemptId: string): Promise<StudentAttemptView> {
    const attempt = (await directus.request(
      readItem("test_attempts", attemptId),
    )) as TestAttempt;

    if (!attempt) {
      throw new Error(`Attempt ${attemptId} not found.`);
    }

    const versionId =
      typeof attempt.test_version_id === "object"
        ? attempt.test_version_id.id
        : attempt.test_version_id;

    const version = (await directus.request(
      readItem("test_versions", versionId),
    )) as TestVersion;

    const [attemptQuestions, answers] = await Promise.all([
      directus.request(
        readItems("test_attempt_questions", {
          filter: { attempt_id: { _eq: attemptId } },
          sort: ["display_position"],
          limit: -1,
        }),
      ) as Promise<TestAttemptQuestion[]>,
      directus.request(
        readItems("test_attempt_answers", {
          limit: -1,
        }),
      ) as Promise<TestAttemptAnswer[]>,
    ]);

    const answersMap = new Map<string, Record<string, unknown>>();
    for (const a of answers) {
      const qId =
        typeof a.attempt_question_id === "object"
          ? a.attempt_question_id.id
          : a.attempt_question_id;
      answersMap.set(qId, a.answer_payload as Record<string, unknown>);
    }

    // Fetch version questions for snapshots
    const versionQuestions = (await directus.request(
      readItems("test_version_questions", {
        filter: { test_version_id: { _eq: versionId } },
        limit: -1,
      }),
    )) as TestVersionQuestion[];

    const versionQuestionMap = new Map<string, TestVersionQuestion>();
    for (const vq of versionQuestions) {
      versionQuestionMap.set(vq.id, vq);
    }

    const sanitizedQuestions: StudentQuestionView[] = [];
    for (const aq of attemptQuestions) {
      const vqId =
        typeof aq.test_version_question_id === "object"
          ? aq.test_version_question_id.id
          : aq.test_version_question_id;
      const vq = versionQuestionMap.get(vqId);
      if (!vq) continue;

      const currentAns = answersMap.get(aq.id) || null;
      sanitizedQuestions.push(
        sanitizeQuestionForStudent(
          vq.question_snapshot as Record<string, unknown>,
          aq.display_position,
          aq.id,
          aq.option_order as string[] | null,
          currentAns,
          Number(aq.active_duration_ms || 0),
        ),
      );
    }

    return {
      attempt_id: attempt.id,
      assignment_id:
        typeof attempt.test_assignment_id === "object"
          ? attempt.test_assignment_id.id
          : attempt.test_assignment_id,
      attempt_number: attempt.attempt_number,
      status: attempt.status,
      started_at: attempt.started_at,
      expires_at: attempt.expires_at,
      duration_minutes: version.duration_minutes,
      questions: sanitizedQuestions,
    };
  },

  /**
   * Records incremental active duration and navigation events.
   */
  async recordQuestionTiming(
    attemptQuestionId: string,
    durationDeltaMs: number,
    isFirstPresentation = false,
  ): Promise<void> {
    if (durationDeltaMs < 0 || durationDeltaMs > 600000) {
      // Reject anomalous negative or >10min bursts
      return;
    }

    const aq = (await directus.request(
      readItem("test_attempt_questions", attemptQuestionId),
    )) as TestAttemptQuestion;

    if (!aq) return;

    const patch: Record<string, unknown> = {
      active_duration_ms: (Number(aq.active_duration_ms) || 0) + durationDeltaMs,
      last_presented_at: new Date().toISOString(),
      visit_count: (Number(aq.visit_count) || 0) + 1,
    };

    if (isFirstPresentation && !aq.first_presented_at) {
      patch.first_presented_at = new Date().toISOString();
    }

    await directus.request(updateItem("test_attempt_questions", attemptQuestionId, patch));
  },

  /**
   * Saves or updates a student's answer incrementally.
   */
  async saveAnswer(
    attemptQuestionId: string,
    answerPayload: Record<string, unknown>,
  ): Promise<void> {
    const aq = (await directus.request(
      readItem("test_attempt_questions", attemptQuestionId),
    )) as TestAttemptQuestion;

    if (!aq) {
      throw new Error(`Attempt question ${attemptQuestionId} not found.`);
    }

    const attemptId =
      typeof aq.attempt_id === "object" ? aq.attempt_id.id : aq.attempt_id;
    const attempt = (await directus.request(
      readItem("test_attempts", attemptId),
    )) as TestAttempt;

    if (attempt.status !== "in_progress") {
      throw new Error(`Cannot save answer: attempt is '${attempt.status}'.`);
    }

    const now = new Date();
    if (attempt.expires_at && new Date(attempt.expires_at) < now) {
      await this.expireAttempt(attemptId);
      throw new Error("Cannot save answer: test duration has expired.");
    }

    // Check existing answer
    const existingAnswers = (await directus.request(
      readItems("test_attempt_answers", {
        filter: { attempt_question_id: { _eq: attemptQuestionId } },
        limit: 1,
      }),
    )) as TestAttemptAnswer[];

    const nowIso = now.toISOString();

    if (existingAnswers.length > 0 && existingAnswers[0]) {
      await directus.request(
        updateItem("test_attempt_answers", existingAnswers[0].id, {
          answer_payload: answerPayload as unknown as JsonObject,
          answered_at: nowIso,
        }),
      );
    } else {
      await directus.request(
        createItem("test_attempt_answers", {
          attempt_question_id: attemptQuestionId,
          answer_payload: answerPayload as unknown as JsonObject,
          answered_at: nowIso,
        }),
      );
    }

    await directus.request(
      updateItem("test_attempt_questions", attemptQuestionId, {
        answered_at: nowIso,
      }),
    );
  },

  /**
   * Submits an attempt and performs automated server-side deterministic scoring via FastAPI.
   */
  async submitAttempt(attemptId: string): Promise<AttemptReportBreakdown> {
    let token: string | null = null;
    try {
      token = (await (directus as unknown as { getToken?: () => Promise<string | null> }).getToken?.()) ?? null;
    } catch {
      // Fallback to storage
    }
    if (!token) {
      const authData = await browserAuthenticationStorage.get();
      token = authData?.access_token ?? null;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${appConfig.aiServiceUrl}/attempts/${attemptId}/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({ answers: [] }),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({ detail: response.statusText }))) as { detail?: string };
      throw new Error(err.detail || `Server grading failed with status ${response.status}`);
    }

    const data = (await response.json()) as AttemptReportBreakdown;
    return data;
  },

  async expireAttempt(attemptId: string): Promise<void> {
    await directus.request(
      updateItem("test_attempts", attemptId, {
        status: "expired",
        submitted_at: new Date().toISOString(),
      }),
    );
  },

  /**
   * Retrieves all attempts for a student, optionally filtered by assignment.
   */
  async getStudentAttempts(studentId: string, assignmentId?: string): Promise<TestAttempt[]> {
    const filter: Record<string, unknown> = {
      student_id: { _eq: studentId },
    };
    if (assignmentId) {
      filter.test_assignment_id = { _eq: assignmentId };
    }
    return (await directus.request(
      readItems("test_attempts", {
        filter,
        sort: ["-attempt_number"],
        limit: -1,
      }),
    )) as TestAttempt[];
  },

  /**
   * Generates or fetches the report breakdown for a completed attempt without mutating state.
   */
  async getAttemptReport(attemptId: string): Promise<AttemptReportBreakdown> {
    const attempt = (await directus.request(
      readItem("test_attempts", attemptId),
    )) as TestAttempt;

    if (!attempt) {
      throw new Error(`Attempt ${attemptId} not found.`);
    }

    const versionId =
      typeof attempt.test_version_id === "object"
        ? attempt.test_version_id.id
        : attempt.test_version_id;

    const [attemptQuestions, versionQuestions] = await Promise.all([
      directus.request(
        readItems("test_attempt_questions", {
          filter: { attempt_id: { _eq: attemptId } },
          sort: ["display_position"],
          limit: -1,
        }),
      ) as Promise<TestAttemptQuestion[]>,
      directus.request(
        readItems("test_version_questions", {
          filter: { test_version_id: { _eq: versionId } },
          limit: -1,
        }),
      ) as Promise<TestVersionQuestion[]>,
    ]);

    const aqIds = attemptQuestions.map((aq) => aq.id);
    const answers = aqIds.length > 0
      ? ((await directus.request(
          readItems("test_attempt_answers", {
            filter: { attempt_question_id: { _in: aqIds } },
            limit: -1,
          }),
        )) as TestAttemptAnswer[])
      : [];

    const vqMap = new Map<string, TestVersionQuestion>();
    for (const vq of versionQuestions) {
      vqMap.set(vq.id, vq);
    }

    const answersMap = new Map<string, TestAttemptAnswer>();
    for (const a of answers) {
      const qId =
        typeof a.attempt_question_id === "object"
          ? a.attempt_question_id.id
          : a.attempt_question_id;
      answersMap.set(qId, a);
    }

    const totalScore = Number(attempt.score) || 0;
    const totalMaxScore = Number(attempt.max_score) || 0;
    let totalDurationMs = 0;

    const domainStats: Record<string, DomainBreakdownItem> = {};
    const difficultyStats: Record<string, { total: number; correct: number; accuracy_percent: number }> = {};

    const questionReviews: QuestionReviewItem[] = [];

    for (const aq of attemptQuestions) {
      const vqId =
        typeof aq.test_version_question_id === "object"
          ? aq.test_version_question_id.id
          : aq.test_version_question_id;
      const vq = vqMap.get(vqId);
      if (!vq) continue;

      const snapshot = (vq.question_snapshot || {}) as Record<string, unknown>;
      const existingAns = answersMap.get(aq.id);
      const points = Number(vq.points) || 1.0;

      const qDuration = Number(aq.active_duration_ms) || 0;
      totalDurationMs += qDuration;

      const domain = String(snapshot.domain_id || "general");
      const difficulty = (snapshot.difficulty || "medium") as QuestionDifficulty;
      const qType = (snapshot.question_type || "single_choice") as QuestionType;

      if (!domainStats[domain]) {
        domainStats[domain] = {
          domain_id: domain,
          total_questions: 0,
          correct_questions: 0,
          score: 0,
          max_score: 0,
          accuracy_percent: 0,
          average_duration_ms: 0,
        };
      }
      if (!difficultyStats[difficulty]) {
        difficultyStats[difficulty] = { total: 0, correct: 0, accuracy_percent: 0 };
      }

      domainStats[domain]!.total_questions += 1;
      domainStats[domain]!.max_score += points;
      difficultyStats[difficulty]!.total += 1;

      const isCorrect = existingAns?.is_correct ?? false;
      const scoreAwarded = Number(existingAns?.score_awarded) || 0;
      domainStats[domain]!.score += scoreAwarded;

      if (isCorrect) {
        domainStats[domain]!.correct_questions += 1;
        difficultyStats[difficulty]!.correct += 1;
      }

      questionReviews.push({
        attempt_question_id: aq.id,
        display_position: aq.display_position,
        prompt: String(snapshot.prompt || ""),
        question_type: qType,
        difficulty: difficulty,
        points: points,
        score_awarded: scoreAwarded,
        is_correct: isCorrect,
        active_duration_ms: qDuration,
        student_answer: (existingAns?.answer_payload as Record<string, unknown>) || null,
        options: (snapshot.options as any[]) || [],
        domain_id: snapshot.domain_id ? String(snapshot.domain_id) : undefined,
        standard_id: snapshot.standard_id ? String(snapshot.standard_id) : undefined,
      });
    }

    for (const d of Object.values(domainStats)) {
      d.accuracy_percent = d.max_score > 0 ? Math.round((d.score / d.max_score) * 100) : 0;
      d.average_duration_ms =
        d.total_questions > 0 ? Math.round(totalDurationMs / d.total_questions) : 0;
    }

    for (const diff of Object.values(difficultyStats)) {
      diff.accuracy_percent =
        diff.total > 0 ? Math.round((diff.correct / diff.total) * 100) : 0;
    }

    return {
      attempt_id: attemptId,
      total_score: totalScore,
      max_score: totalMaxScore,
      score_percent: totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0,
      total_active_duration_ms: totalDurationMs,
      by_domain: domainStats,
      by_difficulty: difficultyStats,
      question_reviews: questionReviews,
    };
  },
};
