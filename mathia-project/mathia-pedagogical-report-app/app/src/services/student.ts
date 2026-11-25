import { readItem, readItems } from "@directus/sdk";
import { directus } from "./directus";
import type {
  ClassRecord,
  CurriculumCourseDomain,
  CurriculumCourseStandard,
  CurriculumCourseSubstandard,
  CurriculumStandard,
  CurriculumSubstandard,
  Resource,
  School,
  StudentDomainEvaluation,
  StudentProfile,
  StudentStandardEvaluation,
  StudentSubstandardEvaluation,
} from "./schema";
import {
  CANONICAL_COURSES,
  formatDomainName,
  getCourseById,
  resolveCourseIdFromGrade,
} from "../lib/curriculum";
import { resourceService, type RecommendedResource } from "./resources";
import type { Locale } from "../lib/i18n";

export interface StudentMetrics {
  className: string | null;
  classCode: string | null;
  resourcesCount: number;
  pendingTestsCount: number;
}

export type MasteryLevel = "unassessed" | "mastered" | "proficient" | "in_progress" | "needs_reinforcement";
export type EvidenceStatus = "unassessed" | "limited" | "sufficient";

export interface StudentSubstandardScore {
  substandardId: string;
  standardId: string;
  courseId: string;
  code: string;
  description: string;
  score: number | null;
  evaluationsCount: number;
  correctCount: number;
  totalQuestionsCount: number;
  lastEvaluatedAt: string | null;
  masteryLevel: MasteryLevel;
  evidenceStatus: EvidenceStatus;
}

export interface StudentStandardScore {
  standardId: string;
  courseId: string;
  code: string;
  description: string;
  score: number | null;
  evaluationsCount: number;
  correctCount: number;
  totalQuestionsCount: number;
  lastEvaluatedAt: string | null;
  masteryLevel: MasteryLevel;
  evidenceStatus: EvidenceStatus;
  substandards: StudentSubstandardScore[];
}

export interface StudentDomainScore {
  domainId: string;
  domainName: string;
  categoryCode: string | null;
  score: number | null;
  isBaseline: boolean;
  evaluationsCount: number;
  correctCount: number;
  totalQuestionsCount: number;
  lastEvaluatedAt: string | null;
  masteryLevel: MasteryLevel;
  evidenceStatus: EvidenceStatus;
  standards: StudentStandardScore[];
}

export interface StudentPedagogicalProfile {
  student: StudentProfile;
  enrolledClass: ClassRecord | null;
  courseId: string;
  courseLabel: string;
  overallAverageScore: number | null;
  evaluatedDomainsCount: number;
  baselineDomainsCount: number;
  domains: StudentDomainScore[];
  reinforcementDomains: StudentDomainScore[];
  reinforcementStandards: StudentStandardScore[];
  reinforcementSubstandards: StudentSubstandardScore[];
}

export interface StudentBackpackData {
  profile: StudentPedagogicalProfile;
  priorityResources: RecommendedResource[];
  allCourseResources: Resource[];
  assignedResources: Resource[];
}

export function determineMasteryLevel(score: number | null | undefined): MasteryLevel {
  if (score === null || score === undefined || Number.isNaN(score)) return "unassessed";
  if (score >= 12.5) return "mastered";
  if (score >= 9.5) return "proficient";
  if (score >= 5.0) return "in_progress";
  return "needs_reinforcement";
}

export function determineEvidenceStatus(evaluationsCount: number, score: number | null | undefined): EvidenceStatus {
  if (score === null || score === undefined || evaluationsCount <= 0) return "unassessed";
  if (evaluationsCount < 3) return "limited";
  return "sufficient";
}

export { resolveCourseIdFromGrade } from "../lib/curriculum";

export const studentService = {
  async getProfile(): Promise<StudentProfile | null> {
    const items = (await directus.request(
      readItems("student_profiles", {
        limit: 1,
      }),
    )) as StudentProfile[];
    return items[0] || null;
  },

  async getEnrolledClass(): Promise<ClassRecord | null> {
    const items = (await directus.request(
      readItems("classes", {
        filter: { active: { _eq: true } },
        limit: 1,
      }),
    )) as ClassRecord[];
    return items[0] || null;
  },

  async getSchool(): Promise<School | null> {
    const items = (await directus.request(
      readItems("schools", {
        limit: 1,
      }),
    )) as School[];
    return items[0] || null;
  },

  async getAssignedResources(): Promise<Resource[]> {
    return (await directus.request(
      readItems("resources", {
        filter: { status: { _eq: "published" } },
        limit: -1,
      }),
    )) as Resource[];
  },

  async getMetrics(): Promise<StudentMetrics> {
    const [classes, resources, testAssignments] = await Promise.all([
      directus.request(
        readItems("classes", {
          filter: { active: { _eq: true } },
          fields: ["name", "code"],
          limit: 1,
        }),
      ),
      directus.request(
        readItems("resources", {
          filter: { status: { _eq: "published" } },
          fields: ["id"],
          limit: -1,
        }),
      ),
      directus.request(
        readItems("test_assignments", {
          filter: { enabled: { _eq: true } },
          fields: ["id"],
          limit: -1,
        }),
      ),
    ]);

    const activeClass = (classes as unknown as { name: string; code: string }[])[0] || null;

    return {
      className: activeClass?.name || null,
      classCode: activeClass?.code || null,
      resourcesCount: (resources as unknown as { id: string }[]).length,
      pendingTestsCount: (testAssignments as unknown as { id: string }[]).length,
    };
  },

  async getPedagogicalProfile(
    locale: Locale = "es",
    studentIdOverride?: string,
    classOverride?: ClassRecord | null,
  ): Promise<StudentPedagogicalProfile | null> {
    const profile = studentIdOverride
      ? ((await directus.request(readItem("student_profiles", studentIdOverride))) as StudentProfile)
      : await this.getProfile();

    const enrolledClass = classOverride !== undefined
      ? classOverride
      : await this.getEnrolledClass();

    if (!profile) return null;

    const courseId = resolveCourseIdFromGrade(enrolledClass?.grade_level);
    const courseDef = getCourseById(courseId) ?? CANONICAL_COURSES[0]!;
    const courseLabel = courseDef.labels[locale] || courseDef.labels.es;

    // Fetch curricular evaluations, standards, and mappings in parallel
    const safeRequest = async <T>(fn: () => Promise<T>): Promise<T | []> => {
      try {
        const res = await fn();
        return res ?? ([] as unknown as T);
      } catch {
        return [] as unknown as T;
      }
    };

    const [
      domainEvals,
      courseDomains,
      standardEvals,
      substandardEvals,
      courseStandards,
      courseSubstandards,
      allStandards,
      allSubstandards,
    ] = await Promise.all([
      safeRequest(() =>
        directus.request(
          readItems("student_domain_evaluations", {
            filter: { student_id: { _eq: profile.id } },
            limit: -1,
          }),
        ),
      ) as Promise<StudentDomainEvaluation[]>,
      safeRequest(() =>
        directus.request(
          readItems("curriculum_course_domains", {
            filter: { course_id: { _eq: courseId } },
            sort: ["domain_id"],
            limit: -1,
          }),
        ),
      ) as Promise<CurriculumCourseDomain[]>,
      safeRequest(() =>
        directus.request(
          readItems("student_standard_evaluations", {
            filter: {
              student_id: { _eq: profile.id },
              course_id: { _eq: courseId },
            },
            limit: -1,
          }),
        ),
      ) as Promise<StudentStandardEvaluation[]>,
      safeRequest(() =>
        directus.request(
          readItems("student_substandard_evaluations", {
            filter: {
              student_id: { _eq: profile.id },
              course_id: { _eq: courseId },
            },
            limit: -1,
          }),
        ),
      ) as Promise<StudentSubstandardEvaluation[]>,
      safeRequest(() =>
        directus.request(
          readItems("curriculum_course_standards", {
            filter: { course_id: { _eq: courseId } },
            limit: -1,
          }),
        ),
      ) as Promise<CurriculumCourseStandard[]>,
      safeRequest(() =>
        directus.request(
          readItems("curriculum_course_substandards", {
            filter: { course_id: { _eq: courseId } },
            limit: -1,
          }),
        ),
      ) as Promise<CurriculumCourseSubstandard[]>,
      safeRequest(() =>
        directus.request(
          readItems("curriculum_standards", {
            limit: -1,
          }),
        ),
      ) as Promise<CurriculumStandard[]>,
      safeRequest(() =>
        directus.request(
          readItems("curriculum_substandards", {
            limit: -1,
          }),
        ),
      ) as Promise<CurriculumSubstandard[]>,
    ]);

    // Build lookup maps
    const standardsById = new Map<string, CurriculumStandard>();
    for (const s of allStandards || []) {
      standardsById.set(s.id, s);
    }

    const substandardsById = new Map<string, CurriculumSubstandard>();
    for (const sub of allSubstandards || []) {
      substandardsById.set(sub.id, sub);
    }

    const stdEvalMap = new Map<string, StudentStandardEvaluation>();
    for (const se of standardEvals || []) {
      const sId = typeof se.standard_id === "object" && se.standard_id !== null ? se.standard_id.id : String(se.standard_id);
      stdEvalMap.set(sId, se);
    }

    const subEvalMap = new Map<string, StudentSubstandardEvaluation>();
    for (const se of substandardEvals || []) {
      const subId = typeof se.substandard_id === "object" && se.substandard_id !== null ? se.substandard_id.id : String(se.substandard_id);
      subEvalMap.set(subId, se);
    }

    const domainEvalMap = new Map<string, StudentDomainEvaluation>();
    for (const de of domainEvals || []) {
      if (de.domain_id) {
        domainEvalMap.set(de.domain_id, de);
      }
    }

    // Determine active domains for this course
    const courseDomainIds = (courseDomains || [])
      .map((cd) =>
        typeof cd.domain_id === "object" && cd.domain_id !== null && "id" in cd.domain_id
          ? (cd.domain_id as { id: string }).id
          : String(cd.domain_id),
      )
      .filter(Boolean);

    const fallbackDomainMap: Record<string, string[]> = {
      "grade-6": ["6.RP", "6.NS", "6.EE", "6.G", "6.SP"],
      "grade-7": ["7.RP", "7.NS", "7.EE", "7.G", "7.SP"],
      "grade-8": ["8.NS", "8.EE", "8.F", "8.G", "8.SP"],
      "grade-9": ["HSA-SSE", "HSA-APR", "HSA-CED", "HSA-REI", "HSF-IF", "HSF-BF", "HSF-LE", "HSS-ID"],
      "grade-10": ["HSG-CO", "HSG-SRT", "HSG-C", "HSG-GPE", "HSG-GMD", "HSS-CP", "HSS-MD"],
    };
    const activeDomainIds = courseDomainIds.length > 0 ? courseDomainIds : (fallbackDomainMap[courseId] || []);

    // Group substandards by standard for this course
    const substandardsByStandard = new Map<string, string[]>();
    for (const csub of courseSubstandards || []) {
      const subId = typeof csub.substandard_id === "object" && csub.substandard_id !== null ? csub.substandard_id.id : String(csub.substandard_id);
      const subRecord = substandardsById.get(subId);
      const stdId = subRecord
        ? (typeof subRecord.standard_id === "object" && subRecord.standard_id !== null ? subRecord.standard_id.id : String(subRecord.standard_id))
        : "";
      if (stdId) {
        if (!substandardsByStandard.has(stdId)) {
          substandardsByStandard.set(stdId, []);
        }
        substandardsByStandard.get(stdId)!.push(subId);
      }
    }

    // Group standards by domain for this course
    const standardsByDomain = new Map<string, string[]>();
    for (const cstd of courseStandards || []) {
      const stdId = typeof cstd.standard_id === "object" && cstd.standard_id !== null ? cstd.standard_id.id : String(cstd.standard_id);
      const stdRecord = standardsById.get(stdId);
      const matchedDomain = activeDomainIds.find((dId: string) => {
        if (!stdRecord) return false;
        return (
          stdRecord.code?.includes(dId) ||
          stdRecord.ccss_id?.includes(`.${dId}.`) ||
          stdRecord.ccss_id?.includes(`.${dId}`) ||
          stdRecord.ccss_id?.includes(`-${dId}`)
        );
      }) || activeDomainIds[0] || "general";

      if (!standardsByDomain.has(matchedDomain)) {
        standardsByDomain.set(matchedDomain, []);
      }
      standardsByDomain.get(matchedDomain)!.push(stdId);
    }

    const domainScores: StudentDomainScore[] = [];
    const reinforcementSubstandards: StudentSubstandardScore[] = [];
    const reinforcementStandards: StudentStandardScore[] = [];
    const reinforcementDomains: StudentDomainScore[] = [];

    let sumEvaluatedScores = 0;
    let countEvaluatedScores = 0;

    for (const domainId of activeDomainIds) {
      const stdIds = standardsByDomain.get(domainId) || [];
      const standardScores: StudentStandardScore[] = [];

      for (const stdId of stdIds) {
        const stdRecord = standardsById.get(stdId);
        const stdEval = stdEvalMap.get(stdId);
        const subIds = substandardsByStandard.get(stdId) || [];
        const substandardScores: StudentSubstandardScore[] = [];

        for (const subId of subIds) {
          const subRecord = substandardsById.get(subId);
          const subEval = subEvalMap.get(subId);
          const rawScore = subEval?.score != null ? Number(subEval.score) : null;
          const evCount = subEval?.evaluations_count ?? 0;

          const subScoreItem: StudentSubstandardScore = {
            substandardId: subId,
            standardId: stdId,
            courseId,
            code: subRecord?.code || subId,
            description: typeof subRecord?.description === "object" && subRecord?.description !== null
              ? (subRecord.description as Record<string, string>)[locale] || (subRecord.description as Record<string, string>).es || ""
              : String(subRecord?.description || ""),
            score: rawScore,
            evaluationsCount: evCount,
            correctCount: subEval?.correct_questions_count ?? 0,
            totalQuestionsCount: subEval?.total_questions_count ?? 0,
            lastEvaluatedAt: subEval?.last_evaluated_at || null,
            masteryLevel: determineMasteryLevel(rawScore),
            evidenceStatus: determineEvidenceStatus(evCount, rawScore),
          };

          substandardScores.push(subScoreItem);

          if (rawScore !== null && rawScore < 9.0) {
            reinforcementSubstandards.push(subScoreItem);
          }
        }

        const rawStdScore = stdEval?.score != null ? Number(stdEval.score) : null;
        const stdEvCount = stdEval?.evaluations_count ?? 0;

        const stdScoreItem: StudentStandardScore = {
          standardId: stdId,
          courseId,
          code: stdRecord?.code || stdId,
          description: typeof stdRecord?.description === "object" && stdRecord?.description !== null
            ? (stdRecord.description as Record<string, string>)[locale] || (stdRecord.description as Record<string, string>).es || ""
            : String(stdRecord?.description || ""),
          score: rawStdScore,
          evaluationsCount: stdEvCount,
          correctCount: stdEval?.correct_questions_count ?? 0,
          totalQuestionsCount: stdEval?.total_questions_count ?? 0,
          lastEvaluatedAt: stdEval?.last_evaluated_at || null,
          masteryLevel: determineMasteryLevel(rawStdScore),
          evidenceStatus: determineEvidenceStatus(stdEvCount, rawStdScore),
          substandards: substandardScores,
        };

        standardScores.push(stdScoreItem);

        if (rawStdScore !== null) {
          sumEvaluatedScores += rawStdScore;
          countEvaluatedScores += 1;

          if (rawStdScore < 9.0) {
            reinforcementStandards.push(stdScoreItem);
          }
        }
      }

      const domainEval = domainEvalMap.get(domainId);
      const rawDomScore = domainEval?.score != null ? Number(domainEval.score) : null;
      const domEvCount = domainEval?.evaluations_count ?? 0;
      const isBaseline = domainEval ? domainEval.is_baseline : (rawDomScore === null);

      const domainScoreItem: StudentDomainScore = {
        domainId,
        domainName: formatDomainName(domainId, locale),
        categoryCode: domainEval?.category_id || null,
        score: rawDomScore,
        isBaseline,
        evaluationsCount: domEvCount,
        correctCount: domainEval?.correct_questions_count ?? 0,
        totalQuestionsCount: domainEval?.total_questions_count ?? 0,
        lastEvaluatedAt: domainEval?.last_evaluated_at || null,
        masteryLevel: determineMasteryLevel(rawDomScore),
        evidenceStatus: determineEvidenceStatus(domEvCount, rawDomScore),
        standards: standardScores,
      };

      domainScores.push(domainScoreItem);

      if (rawDomScore !== null && rawDomScore < 9.0) {
        reinforcementDomains.push(domainScoreItem);
      }
    }

    const overallAverageScore = countEvaluatedScores > 0
      ? Math.round((sumEvaluatedScores / countEvaluatedScores) * 10) / 10
      : null;

    const evaluatedDomainsCount = domainScores.filter((d) => d.score !== null && !d.isBaseline).length;
    const baselineDomainsCount = domainScores.filter((d) => d.score === null || d.isBaseline).length;

    return {
      student: profile,
      enrolledClass,
      courseId,
      courseLabel,
      overallAverageScore,
      evaluatedDomainsCount,
      baselineDomainsCount,
      domains: domainScores,
      reinforcementDomains,
      reinforcementStandards,
      reinforcementSubstandards,
    };
  },

  async getBackpackData(locale: Locale = "es"): Promise<StudentBackpackData | null> {
    const profile = await this.getPedagogicalProfile(locale);
    if (!profile) return null;

    // Load all published resources for the student's school/course
    const allResources = (await directus.request(
      readItems("resources", {
        filter: {
          status: { _eq: "published" },
        },
        sort: ["-created_at"],
        limit: -1,
      }),
    )) as Resource[];

    const allCourseResources = allResources.filter(
      (r) => !r.course_id || r.course_id === profile.courseId,
    );

    // Get 3-tier recommended resources using the weak curricular objectives
    const priorityResources = await resourceService.getRecommendedResources({
      courseId: profile.courseId,
      weakSubstandards: profile.reinforcementSubstandards.map((s) => ({
        substandardId: s.substandardId,
        code: s.code,
      })),
      weakStandards: profile.reinforcementStandards.map((s) => ({
        standardId: s.standardId,
        code: s.code,
      })),
      weakDomains: profile.reinforcementDomains.map((d) => ({
        domainId: d.domainId,
        code: d.domainId,
      })),
      limit: 6,
    });

    return {
      profile,
      priorityResources,
      allCourseResources,
      assignedResources: allCourseResources,
    };
  },
};
