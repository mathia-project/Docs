import { readItem, readItems } from "@directus/sdk";
import { directus } from "./directus";
import {
  formatCategoryName,
  relationId,
  resolveCourseIdFromGrade,
} from "../lib/curriculum";
import type {
  ClassRecord,
  ClassStudent,
  CurriculumCategory,
  CurriculumCluster,
  CurriculumCourseStandard,
  CurriculumCourseDomain,
  CurriculumCourseSubstandard,
  CurriculumDomain,
  CurriculumStandard,
  CurriculumSubstandard,
  StudentProfile,
  StudentStandardEvaluation,
  StudentSubstandardEvaluation,
  TeacherProfile,
  TestAssignment,
  TestAttempt,
  TestRecord,
  TestVersion,
} from "./schema";
import type { EvidenceStatus } from "./student";
import type { Locale } from "../lib/i18n";

export interface ClassStandardBreakdown {
  standardId: string;
  code: string;
  description: string;
  score: number | null;
  evaluationsCount: number;
  evaluatedStudentsCount: number;
  totalStudentsCount: number;
  correctCount: number;
  totalQuestionsCount: number;
  evidenceStatus: EvidenceStatus;
  substandards: Array<{
    substandardId: string;
    code: string;
    description: string;
    score: number | null;
    evaluationsCount: number;
    evaluatedStudentsCount: number;
    totalStudentsCount: number;
    correctCount: number;
    totalQuestionsCount: number;
    evidenceStatus: EvidenceStatus;
  }>;
}

export interface ClassCurricularBreakdown {
  categoryId: string;
  categoryName: string;
  score: number | null;
  evaluationsCount: number;
  evaluatedStudentsCount: number;
  totalStudentsCount: number;
  correctCount: number;
  totalQuestionsCount: number;
  evidenceStatus: EvidenceStatus;
  standards: ClassStandardBreakdown[];
}

export interface TeacherMetrics {
  classesCount: number;
  studentsCount: number;
  reportsCount: number;
}

export interface ClassTestStat {
  assignment_id: string;
  test_id: string;
  test_title: string;
  version_number: number;
  available_from: string | null;
  due_at: string | null;
  duration_minutes: number | null;
  max_attempts: number;
  max_score: number;
  total_assigned: number;
  completed_count: number;
  in_progress_count: number;
  pending_count: number;
  completion_rate_percent: number;
  average_score: number;
  average_percent: number;
  highest_score: number;
  lowest_score: number;
  attempts_by_student: Record<string, TestAttempt>;
}

export interface ClassStudentStat {
  student_id: string;
  first_name: string;
  last_name: string;
  external_id: string | null;
  email: string | null;
  has_diagnosis?: boolean;
  needs_evaluation?: boolean;
  diagnosis_notes?: string | null;
  completed_tests_count: number;
  total_assigned_tests_count: number;
  average_score_percent: number;
  attempts: TestAttempt[];
}

export interface ClassAggregatedStats {
  class_id: string;
  total_students: number;
  total_assignments: number;
  total_completed_attempts: number;
  class_average_percent: number;
  test_stats: ClassTestStat[];
  student_stats: ClassStudentStat[];
}

export function computeClassStats(
  classId: string,
  students: StudentProfile[],
  assignments: TestAssignment[],
  attempts: TestAttempt[],
): ClassAggregatedStats {
  // Group attempts by assignment_id and student_id
  const attemptsByAssignment = new Map<string, TestAttempt[]>();
  const attemptsByStudent = new Map<string, TestAttempt[]>();

  for (const att of attempts) {
    const asgId =
      typeof att.test_assignment_id === "object" && att.test_assignment_id !== null
        ? att.test_assignment_id.id
        : String(att.test_assignment_id);

    const stuId =
      typeof att.student_id === "object" && att.student_id !== null
        ? att.student_id.id
        : String(att.student_id);

    if (!attemptsByAssignment.has(asgId)) {
      attemptsByAssignment.set(asgId, []);
    }
    attemptsByAssignment.get(asgId)!.push(att);

    if (!attemptsByStudent.has(stuId)) {
      attemptsByStudent.set(stuId, []);
    }
    attemptsByStudent.get(stuId)!.push(att);
  }

  // 1. Compute Test Stats
  const testStats: ClassTestStat[] = assignments.map((asg) => {
    const testRec = (asg.test_id as TestRecord) || {};
    const versionRec = (asg.test_version_id as TestVersion) || {};
    const asgAttempts = attemptsByAssignment.get(asg.id) || [];

    const attemptsByStuMap: Record<string, TestAttempt> = {};
    for (const att of asgAttempts) {
      const stuId =
        typeof att.student_id === "object" && att.student_id !== null
          ? att.student_id.id
          : String(att.student_id);
      // Keep latest attempt for student
      if (!attemptsByStuMap[stuId] || att.attempt_number > attemptsByStuMap[stuId]!.attempt_number) {
        attemptsByStuMap[stuId] = att;
      }
    }

    let completedCount = 0;
    let inProgressCount = 0;
    let totalScoreSum = 0;
    let highestScore = 0;
    let lowestScore = Infinity;

    for (const s of students) {
      const att = attemptsByStuMap[s.id];
      if (att) {
        if (att.status === "graded" || att.status === "submitted") {
          completedCount++;
          const score = Number(att.score) || 0;
          totalScoreSum += score;
          if (score > highestScore) highestScore = score;
          if (score < lowestScore) lowestScore = score;
        } else if (att.status === "in_progress") {
          inProgressCount++;
        }
      }
    }

    if (lowestScore === Infinity) lowestScore = 0;
    const pendingCount = Math.max(0, students.length - completedCount - inProgressCount);
    const completionRate = students.length > 0 ? Math.round((completedCount / students.length) * 100) : 0;
    const maxScore = Number(versionRec.max_score) || Number(testRec.max_score) || 10;
    const avgScore = completedCount > 0 ? Number((totalScoreSum / completedCount).toFixed(2)) : 0;
    const avgPercent = maxScore > 0 ? Math.round((avgScore / maxScore) * 100) : 0;

    return {
      assignment_id: asg.id,
      test_id: testRec.id || (asg.test_id as string),
      test_title: testRec.title || "Untitled Test",
      version_number: versionRec.version_number || 1,
      available_from: asg.available_from || null,
      due_at: asg.due_at || null,
      duration_minutes: versionRec.duration_minutes || testRec.duration_minutes || null,
      max_attempts: asg.max_attempts_override || versionRec.max_attempts || 1,
      max_score: maxScore,
      total_assigned: students.length,
      completed_count: completedCount,
      in_progress_count: inProgressCount,
      pending_count: pendingCount,
      completion_rate_percent: completionRate,
      average_score: avgScore,
      average_percent: avgPercent,
      highest_score: highestScore,
      lowest_score: lowestScore,
      attempts_by_student: attemptsByStuMap,
    };
  });

  // 2. Compute Student Stats
  let totalStudentPercentagesSum = 0;
  let studentsWithGradesCount = 0;

  const studentStats: ClassStudentStat[] = students.map((s) => {
    const studentAttempts = attemptsByStudent.get(s.id) || [];
    let completedCount = 0;
    let scoreSum = 0;
    let maxScoreSum = 0;

    for (const asg of assignments) {
      const atts = studentAttempts.filter((a) => {
        const aId =
          typeof a.test_assignment_id === "object" && a.test_assignment_id !== null
            ? a.test_assignment_id.id
            : String(a.test_assignment_id);
        return aId === asg.id;
      });
      // Find latest graded
      const graded = atts.find((a) => a.status === "graded" || a.status === "submitted");
      if (graded) {
        completedCount++;
        scoreSum += Number(graded.score) || 0;
        maxScoreSum += Number(graded.max_score) || 1;
      }
    }

    const studentAvgPercent = maxScoreSum > 0 ? Math.round((scoreSum / maxScoreSum) * 100) : 0;
    if (completedCount > 0) {
      totalStudentPercentagesSum += studentAvgPercent;
      studentsWithGradesCount++;
    }

    return {
      student_id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      external_id: s.external_id || null,
      email: s.email || null,
      has_diagnosis: Boolean(s.has_diagnosis),
      needs_evaluation: Boolean(s.needs_evaluation),
      diagnosis_notes: s.diagnosis_notes || null,
      completed_tests_count: completedCount,
      total_assigned_tests_count: assignments.length,
      average_score_percent: studentAvgPercent,
      attempts: studentAttempts,
    };
  });

  const classAvgPercent =
    studentsWithGradesCount > 0 ? Math.round(totalStudentPercentagesSum / studentsWithGradesCount) : 0;

  let totalCompletedAttempts = 0;
  for (const ts of testStats) {
    totalCompletedAttempts += ts.completed_count;
  }

  return {
    class_id: classId,
    total_students: students.length,
    total_assignments: assignments.length,
    total_completed_attempts: totalCompletedAttempts,
    class_average_percent: classAvgPercent,
    test_stats: testStats,
    student_stats: studentStats,
  };
}

export const teacherService = {
  async getTeacherProfile(): Promise<TeacherProfile | null> {
    const items = (await directus.request(
      readItems("teacher_profiles", {
        limit: 1,
      }),
    )) as TeacherProfile[];
    return items[0] || null;
  },

  async getAssignedClasses(): Promise<ClassRecord[]> {
    return (await directus.request(
      readItems("classes", {
        filter: { active: { _eq: true } },
        sort: ["name"],
        limit: -1,
      }),
    )) as ClassRecord[];
  },

  async getClass(id: string): Promise<ClassRecord | null> {
    try {
      return (await directus.request(readItem("classes", id))) as ClassRecord;
    } catch {
      return null;
    }
  },

  async getStudents(): Promise<StudentProfile[]> {
    return (await directus.request(
      readItems("student_profiles", {
        filter: { active: { _eq: true } },
        sort: ["last_name", "first_name"],
        limit: -1,
      }),
    )) as StudentProfile[];
  },

  async getClassStudents(classId?: string): Promise<ClassStudent[]> {
    const filter = classId
      ? { class_id: { _eq: classId }, active: { _eq: true } }
      : { active: { _eq: true } };
    return (await directus.request(
      readItems("class_students", {
        filter,
        limit: -1,
      }),
    )) as ClassStudent[];
  },

  async getClassAssignments(classId: string): Promise<TestAssignment[]> {
    return (await directus.request(
      readItems("test_assignments", {
        filter: { class_id: { _eq: classId } },
        sort: ["-created_at"],
        fields: ["*", "test_id.*", "test_version_id.*"] as any,
        limit: -1,
      }),
    )) as unknown as TestAssignment[];
  },

  async getClassAttempts(classId: string): Promise<TestAttempt[]> {
    return (await directus.request(
      readItems("test_attempts", {
        filter: {
          test_assignment_id: {
            class_id: { _eq: classId },
          },
        },
        sort: ["-created_at"],
        fields: ["*", "student_id.*", "test_assignment_id.*", "test_version_id.*"] as any,
        limit: -1,
      }),
    )) as unknown as TestAttempt[];
  },

  async getMetrics(): Promise<TeacherMetrics> {
    const [classes, students, reports] = await Promise.all([
      directus.request(
        readItems("classes", {
          filter: { active: { _eq: true } },
          fields: ["id"],
          limit: -1,
        }),
      ),
      directus.request(
        readItems("student_profiles", {
          filter: { active: { _eq: true } },
          fields: ["id"],
          limit: -1,
        }),
      ),
      directus.request(
        readItems("pedagogical_reports", {
          fields: ["id"],
          limit: -1,
        }),
      ),
    ]);

    return {
      classesCount: (classes as unknown as { id: string }[]).length,
      studentsCount: (students as unknown as { id: string }[]).length,
      reportsCount: (reports as unknown as { id: string }[]).length,
    };
  },

  async getClassCurricularBreakdown(
    classId: string,
    locale: Locale = "es",
  ): Promise<ClassCurricularBreakdown[]> {
    const [classRecord, classStudents] = await Promise.all([
      this.getClass(classId),
      this.getClassStudents(classId),
    ]);

    if (!classRecord) return [];
    const courseId = resolveCourseIdFromGrade(classRecord.grade_level);
    const studentIds = classStudents.map((cs) => relationId(cs.student_id)).filter(Boolean);

    if (studentIds.length === 0) return [];

    const [
      standardEvals,
      substandardEvals,
      courseStandards,
      courseSubstandards,
      allStandards,
      allSubstandards,
      courseDomains,
      allDomains,
      allClusters,
      allCategories,
    ] = await Promise.all([
      directus.request(
        readItems("student_standard_evaluations", {
          filter: {
            student_id: { _in: studentIds },
            course_id: { _eq: courseId },
          },
          limit: -1,
        }),
      ).catch(() => []) as Promise<StudentStandardEvaluation[]>,
      directus.request(
        readItems("student_substandard_evaluations", {
          filter: {
            student_id: { _in: studentIds },
            course_id: { _eq: courseId },
          },
          limit: -1,
        }),
      ).catch(() => []) as Promise<StudentSubstandardEvaluation[]>,
      directus.request(
        readItems("curriculum_course_standards", {
          filter: { course_id: { _eq: courseId } },
          limit: -1,
        }),
      ).catch(() => []) as Promise<CurriculumCourseStandard[]>,
      directus.request(
        readItems("curriculum_course_substandards", {
          filter: { course_id: { _eq: courseId } },
          limit: -1,
        }),
      ).catch(() => []) as Promise<CurriculumCourseSubstandard[]>,
      directus.request(
        readItems("curriculum_standards", { limit: -1 }),
      ).catch(() => []) as Promise<CurriculumStandard[]>,
      directus.request(
        readItems("curriculum_substandards", { limit: -1 }),
      ).catch(() => []) as Promise<CurriculumSubstandard[]>,
      directus.request(
        readItems("curriculum_course_domains", {
          filter: { course_id: { _eq: courseId } },
          limit: -1,
        }),
      ).catch(() => []) as Promise<CurriculumCourseDomain[]>,
      directus.request(
        readItems("curriculum_domains", { limit: -1 }),
      ).catch(() => []) as Promise<CurriculumDomain[]>,
      directus.request(
        readItems("curriculum_clusters", { limit: -1 }),
      ).catch(() => []) as Promise<CurriculumCluster[]>,
      directus.request(
        readItems("curriculum_categories", { limit: -1 }),
      ).catch(() => []) as Promise<CurriculumCategory[]>,
    ]);

    const standardsById = new Map<string, CurriculumStandard>();
    allStandards.forEach((s) => standardsById.set(s.id, s));

    const domainsById = new Map<string, CurriculumDomain>();
    allDomains.forEach((domain) => domainsById.set(domain.id, domain));

    const clustersById = new Map<string, CurriculumCluster>();
    allClusters.forEach((cluster) => clustersById.set(cluster.id, cluster));

    const categoriesById = new Map<string, CurriculumCategory>();
    allCategories.forEach((category) => categoriesById.set(category.id, category));

    const substandardsById = new Map<string, CurriculumSubstandard>();
    allSubstandards.forEach((s) => substandardsById.set(s.id, s));

    const standardEvalsByStd = new Map<string, StudentStandardEvaluation[]>();
    for (const ev of standardEvals) {
      const stdId = relationId(ev.standard_id);
      if (!stdId) continue;
      if (!standardEvalsByStd.has(stdId)) standardEvalsByStd.set(stdId, []);
      standardEvalsByStd.get(stdId)!.push(ev);
    }

    const substandardEvalsBySub = new Map<string, StudentSubstandardEvaluation[]>();
    for (const ev of substandardEvals) {
      const subId = relationId(ev.substandard_id);
      if (!subId) continue;
      if (!substandardEvalsBySub.has(subId)) substandardEvalsBySub.set(subId, []);
      substandardEvalsBySub.get(subId)!.push(ev);
    }

    const substandardsByStandard = new Map<string, CurriculumCourseSubstandard[]>();
    for (const cs of courseSubstandards) {
      const subId = relationId(cs.substandard_id);
      const sub = substandardsById.get(subId);
      const parentStdId = relationId(sub?.standard_id);
      if (parentStdId) {
        if (!substandardsByStandard.has(parentStdId)) substandardsByStandard.set(parentStdId, []);
        substandardsByStandard.get(parentStdId)!.push(cs);
      }
    }

    const courseDomainIds = new Set(
      courseDomains
        .filter((domain) => relationId(domain.course_id) === courseId)
        .map((domain) => relationId(domain.domain_id))
        .filter(Boolean),
    );

    const domainFromStandard = (standard: CurriculumStandard | undefined): CurriculumDomain | undefined => {
      if (!standard) return undefined;
      const cluster = clustersById.get(relationId(standard.cluster_id));
      if (cluster) {
        const domain = domainsById.get(relationId(cluster.domain_id));
        if (domain) return domain;
      }

      // Keep the view usable if a legacy catalog row is missing its parent relation.
      const code = standard.code || standard.ccss_id || "";
      const fallbackDomainId = code.startsWith("HS") ? code.split(".")[0] : code.split(".").slice(0, 2).join(".");
      return Array.from(domainsById.values()).find(
        (domain) => domain.id === fallbackDomainId || domain.code === fallbackDomainId,
      );
    };

    const categoryFromDomain = (domain: CurriculumDomain | undefined, domainId: string): CurriculumCategory | undefined => {
      const categoryId = relationId(domain?.category_id);
      if (categoryId) return categoriesById.get(categoryId) || allCategories.find((category) => category.code === categoryId);

      const categoryCode = domainId.startsWith("HS")
        ? domainId.slice(2, 3)
        : domainId.split(".")[1] === "NS"
        ? "N"
        : domainId.split(".")[1] === "F"
        ? "F"
        : domainId.split(".")[1] === "G"
        ? "G"
        : domainId.split(".")[1] === "SP"
        ? "S"
        : "A";
      return categoriesById.get(categoryCode) || allCategories.find((category) => category.code === categoryCode);
    };

    const standardsByCategory = new Map<string, { category: CurriculumCategory | undefined; standards: CurriculumCourseStandard[] }>();
    for (const cstd of courseStandards) {
      const stdId = relationId(cstd.standard_id);
      const std = standardsById.get(stdId);
      const domain = domainFromStandard(std);
      const domainId = domain?.id || domain?.code || "general";
      if (courseDomainIds.size > 0 && domainId !== "general" && !courseDomainIds.has(domainId)) continue;
      const category = categoryFromDomain(domain, domainId);
      const categoryId = category?.id || category?.code || "general";
      if (!standardsByCategory.has(categoryId)) standardsByCategory.set(categoryId, { category, standards: [] });
      standardsByCategory.get(categoryId)!.standards.push(cstd);
    }

    const averageScore = (evaluations: Array<{ score: number | null }>): number | null => {
      const scored = evaluations.filter((evaluation) => evaluation.score !== null && evaluation.score !== undefined);
      if (scored.length === 0) return null;
      return Math.round((scored.reduce((sum, evaluation) => sum + Number(evaluation.score), 0) / scored.length) * 10) / 10;
    };

    const summarizeEvaluations = <T extends { student_id: unknown; score: number | null; evaluations_count: number; correct_questions_count: number; total_questions_count: number }>(
      evaluations: T[],
    ) => {
      const scored = evaluations.filter((evaluation) => evaluation.score !== null && evaluation.score !== undefined);
      const studentsWithScores = new Set(scored.map((evaluation) => relationId(evaluation.student_id)).filter(Boolean));
      const score = averageScore(scored);
      const evaluationsCount = evaluations.reduce((sum, evaluation) => sum + Number(evaluation.evaluations_count || 0), 0);
      return {
        score,
        evaluationsCount,
        evaluatedStudentsCount: studentsWithScores.size,
        totalStudentsCount: studentIds.length,
        correctCount: evaluations.reduce((sum, evaluation) => sum + Number(evaluation.correct_questions_count || 0), 0),
        totalQuestionsCount: evaluations.reduce((sum, evaluation) => sum + Number(evaluation.total_questions_count || 0), 0),
        evidenceStatus: (evaluationsCount === 0 || score === null
          ? "unassessed"
          : evaluationsCount < 3
          ? "limited"
          : "sufficient") as EvidenceStatus,
      };
    };

    const categoryResults: ClassCurricularBreakdown[] = [];

    // Preserve the canonical Big Five order and keep empty categories visible.
    const categoryDefinitions = allCategories.length > 0
      ? allCategories
      : Array.from(standardsByCategory.values())
          .map((entry) => entry.category)
          .filter((category): category is CurriculumCategory => Boolean(category));
    const categoryEntries = [...categoryDefinitions]
      .sort((a, b) => ["N", "A", "F", "G", "S"].indexOf(a.code) - ["N", "A", "F", "G", "S"].indexOf(b.code))
      .map((category) => [category.id, { category, standards: standardsByCategory.get(category.id)?.standards || [] }] as const);
    for (const [categoryId, categoryEntry] of categoryEntries) {
      const categoryStandards = categoryEntry.standards;
      const categoryStandardIds = new Set(categoryStandards.map((cstd) => relationId(cstd.standard_id)));
      const categoryEvals = standardEvals.filter((evaluation) => categoryStandardIds.has(relationId(evaluation.standard_id)));
      const categorySummary = summarizeEvaluations(categoryEvals);
      const domainsById = new Map<string, CurriculumCourseStandard[]>();

      for (const cstd of categoryStandards) {
        const std = standardsById.get(relationId(cstd.standard_id));
        const domain = domainFromStandard(std);
        const domainId = domain?.id || domain?.code || "general";
        if (!domainsById.has(domainId)) domainsById.set(domainId, []);
        domainsById.get(domainId)!.push(cstd);
      }

      const categoryStandardsResult: ClassStandardBreakdown[] = [];

      for (const cStandards of domainsById.values()) {
        const stdBreakdowns: ClassStandardBreakdown[] = [];

        for (const cstd of cStandards) {
          const stdId = relationId(cstd.standard_id);
          const stdDef = standardsById.get(stdId);
          const evals = standardEvalsByStd.get(stdId) || [];
          const summary = summarizeEvaluations(evals);

          const courseSubs = substandardsByStandard.get(stdId) || [];
          const subBreakdowns = courseSubs.map((csub) => {
            const subId = relationId(csub.substandard_id);
            const subDef = substandardsById.get(subId);
            const sEvals = substandardEvalsBySub.get(subId) || [];
            const subSummary = summarizeEvaluations(sEvals);

            return {
              substandardId: subId,
              code: subDef?.code || subId,
              description: String(subDef?.description?.[locale] || subDef?.description?.es || subDef?.description?.en || subId),
              ...subSummary,
            };
          });

          stdBreakdowns.push({
            standardId: stdId,
            code: stdDef?.code || stdId,
            description: String(stdDef?.description?.[locale] || stdDef?.description?.es || stdDef?.description?.en || stdId),
            ...summary,
            substandards: subBreakdowns,
          });
        }

        categoryStandardsResult.push(...stdBreakdowns);
      }

      categoryResults.push({
        categoryId,
        categoryName: formatCategoryName(categoryEntry.category || categoryId, locale),
        ...categorySummary,
        standards: categoryStandardsResult,
      });
    }

    return categoryResults;
  },
};
