import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import { browserAuthenticationStorage } from "./auth-storage";
import { appConfig } from "./config";
import { directus } from "./directus";
import type {
  ClassRecord,
  CurriculumDomain,
  PedagogicalReport,
  Resource,
  StudentDomainEvaluation,
  StudentProfile,
  StudentSupportPrediction,
  TestAttempt,
} from "./schema";
import { determineMasteryLevel, type MasteryLevel } from "./student";

export type PriorityTier = "urgent" | "practice" | "enrichment";

export interface DomainReportItem {
  domain_id: string;
  domain_name: string;
  category_id?: string | undefined;
  score: number; // 0.00 - 15.00
  mastery_level: MasteryLevel;
  evaluations_count: number;
  accuracy_percent: number;
  total_questions: number;
  is_baseline: boolean;
}

export interface RecommendedResourceItem {
  resource_id: string;
  title: string;
  description: string | null;
  resource_type: string;
  target_level: "reinforcement" | "practice" | "enrichment";
  domain_id?: string | undefined;
  domain_name?: string | undefined;
  priority_tier: PriorityTier;
  recommendation_reason: string;
  url?: string | null | undefined;
}

export interface StudentReportDiagnosticInfo {
  has_diagnosis: boolean;
  diagnosis_notes: string | null;
  needs_evaluation: boolean;
  support_prediction: StudentSupportPrediction | null;
  evaluation_suggestion_label?: string | undefined;
  evaluation_suggestion_detail?: string | undefined;
}

async function getDirectusAccessToken(): Promise<string> {
  let token: string | null = null;
  try {
    token =
      (await (directus as unknown as { getToken?: () => Promise<string | null> }).getToken?.()) ??
      null;
  } catch {
    // Fall back to the configured authentication storage.
  }
  if (!token) {
    const authData = await browserAuthenticationStorage.get();
    token = authData?.access_token ?? null;
  }
  if (!token) throw new Error("Authentication is required to run the support prediction.");
  return token;
}

export async function predictStudentSupport(studentId: string): Promise<StudentSupportPrediction> {
  const token = await getDirectusAccessToken();
  const response = await fetch(
    `${appConfig.aiServiceUrl}/predict/student/${encodeURIComponent(studentId)}/support`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(error?.detail || `Support prediction failed with status ${response.status}`);
  }
  return (await response.json()) as StudentSupportPrediction;
}

async function getLatestStudentSupportPrediction(
  studentId: string,
): Promise<StudentSupportPrediction | null> {
  const predictions = (await directus.request(
    readItems("student_support_predictions", {
      filter: { student_id: { _eq: studentId } },
      fields: [
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
      ],
      sort: ["-generated_at"],
      limit: 1,
    }),
  )) as StudentSupportPrediction[];
  return predictions[0] ?? null;
}

export function buildStudentReportDiagnosticInfo(
  student: StudentProfile,
  supportPrediction: StudentSupportPrediction | null,
): StudentReportDiagnosticInfo {
  const hasDiagnosis =
    supportPrediction?.status === "diagnosis_recorded" || Boolean(student.has_diagnosis);
  const needsEvaluation = supportPrediction?.suggests_educational_support === true;
  const scoreDetail =
    supportPrediction?.attention_index !== null &&
    supportPrediction?.attention_index !== undefined &&
    supportPrediction.applied_threshold !== null
      ? `Índice de atención ${supportPrediction.attention_index.toFixed(3)}; umbral aplicado ${supportPrediction.applied_threshold.toFixed(3)}.`
      : null;

  return {
    has_diagnosis: hasDiagnosis,
    diagnosis_notes: student.diagnosis_notes || null,
    needs_evaluation: needsEvaluation,
    support_prediction: supportPrediction,
    evaluation_suggestion_label: hasDiagnosis
      ? "Diagnóstico registrado"
      : supportPrediction === null
        ? "Predicción no solicitada"
      : needsEvaluation
        ? "Sugerencia IA: revisión y apoyo educativo"
        : supportPrediction.status === "insufficient_information"
          ? "Información insuficiente para emitir una sugerencia"
          : "Sin señal suficiente para sugerir apoyo educativo",
    evaluation_suggestion_detail: hasDiagnosis
      ? student.diagnosis_notes || "El alumno cuenta con diagnóstico previo oficial."
      : supportPrediction === null
        ? "Solicite manualmente la predicción para incorporar la señal del modelo al informe."
      : needsEvaluation
        ? `El índice superó el umbral de revisión educativa. ${scoreDetail || ""}`.trim()
        : supportPrediction.status === "insufficient_information"
          ? supportPrediction.reason || "No hay evidencia suficiente para ejecutar el modelo."
          : `El índice no superó el umbral. Esto no descarta dificultades. ${scoreDetail || ""}`.trim(),
  };
}

export interface StructuredReportPayload {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    external_id: string | null;
    preferred_language: string;
    grade_level: string | null;
    class_id: string | null;
    class_name: string | null;
  };
  diagnostic: StudentReportDiagnosticInfo;
  metrics: {
    curriculum_average: number; // 0.00 - 15.00
    curriculum_average_percent: number; // 0 - 100%
    total_evaluated_domains: number;
    tests_completed: number;
    total_questions_answered: number;
    overall_accuracy_percent: number;
  };
  domains: DomainReportItem[];
  strengths: DomainReportItem[];
  weaknesses: DomainReportItem[];
  recommended_resources: RecommendedResourceItem[];
  llm_prompt_blueprint: {
    system_role: string;
    student_summary: string;
    strengths_summary: string;
    weaknesses_summary: string;
    diagnostic_context: string;
    recommendations_summary: string;
    format_instructions: string;
  };
}

/**
 * Filter and prioritize pedagogical resources aligned with student weaknesses.
 * Rule thresholds:
 * - score < 5.0: Urgent reinforcement (target_level = 'reinforcement')
 * - score 5.0 - 9.9 (< 10.0): Practice & consolidation (target_level = 'practice' | 'reinforcement')
 * - score >= 10.0: Enrichment (target_level = 'enrichment')
 */
export function buildRecommendedResources(
  weaknesses: DomainReportItem[],
  strengths: DomainReportItem[],
  availableResources: Resource[],
  domainsMap: Map<string, string>,
): RecommendedResourceItem[] {
  const recommendations: RecommendedResourceItem[] = [];
  const weakDomainIds = new Set(weaknesses.map((w) => w.domain_id));
  const urgentDomainIds = new Set(weaknesses.filter((w) => w.score < 5.0).map((w) => w.domain_id));

  // 1. Critical & Weakness Recommendations (score < 10)
  for (const resource of availableResources) {
    const rawDomainId =
      typeof resource.domain_id === "object" && resource.domain_id !== null
        ? resource.domain_id.id
        : (resource.domain_id as string | undefined);

    const domainName = rawDomainId ? (domainsMap.get(rawDomainId) || rawDomainId) : "General";

    if (rawDomainId && weakDomainIds.has(rawDomainId)) {
      const isUrgent = urgentDomainIds.has(rawDomainId);
      const targetLevel = resource.target_level || "reinforcement";

      if (isUrgent && targetLevel === "reinforcement") {
        recommendations.push({
          resource_id: resource.id,
          title: resource.title,
          description: resource.description,
          resource_type: resource.resource_type,
          target_level: "reinforcement",
          domain_id: rawDomainId,
          domain_name: domainName,
          priority_tier: "urgent",
          recommendation_reason: `Puntuación crítica (< 5.0/15) en ${domainName}. Refuerzo prioritario recomendado.`,
          url: resource.url,
        });
      } else if (!isUrgent && (targetLevel === "practice" || targetLevel === "reinforcement")) {
        recommendations.push({
          resource_id: resource.id,
          title: resource.title,
          description: resource.description,
          resource_type: resource.resource_type,
          target_level: targetLevel,
          domain_id: rawDomainId,
          domain_name: domainName,
          priority_tier: "practice",
          recommendation_reason: `Puntuación por debajo de 10.0/15 en ${domainName}. Práctica y consolidación recomendada.`,
          url: resource.url,
        });
      }
    }
  }

  // 2. Enrichment Recommendations for top strengths (score >= 10)
  if (strengths.length > 0) {
    const topStrengthIds = new Set(strengths.map((s) => s.domain_id));
    for (const resource of availableResources) {
      const rawDomainId =
        typeof resource.domain_id === "object" && resource.domain_id !== null
          ? resource.domain_id.id
          : (resource.domain_id as string | undefined);

      if (rawDomainId && topStrengthIds.has(rawDomainId) && resource.target_level === "enrichment") {
        const domainName = domainsMap.get(rawDomainId) || rawDomainId;
        recommendations.push({
          resource_id: resource.id,
          title: resource.title,
          description: resource.description,
          resource_type: resource.resource_type,
          target_level: "enrichment",
          domain_id: rawDomainId,
          domain_name: domainName,
          priority_tier: "enrichment",
          recommendation_reason: `Alto dominio (≥ 10.0/15) en ${domainName}. Material de ampliación pedagógica.`,
          url: resource.url,
        });
      }
    }
  }

  return recommendations;
}

/**
 * Classify domains into Strengths and Weaknesses based on scores and evaluations.
 */
export function analyzeStrengthsAndWeaknesses(domains: DomainReportItem[]): {
  strengths: DomainReportItem[];
  weaknesses: DomainReportItem[];
} {
  if (domains.length === 0) {
    return { strengths: [], weaknesses: [] };
  }

  // Sort descending by score, then accuracy
  const sorted = [...domains].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.accuracy_percent - a.accuracy_percent;
  });

  // Weaknesses: Domains with score < 10.0, or bottom 40% if all >= 10
  const lowScoring = sorted.filter((d) => d.score < 10.0);
  const highScoring = sorted.filter((d) => d.score >= 10.0);

  let strengths: DomainReportItem[];
  let weaknesses: DomainReportItem[];

  if (lowScoring.length > 0 && highScoring.length > 0) {
    strengths = highScoring;
    weaknesses = lowScoring.reverse(); // Lowest scores first
  } else if (lowScoring.length > 0 && highScoring.length === 0) {
    // All scores are below 10: split relatively into best and worst
    const mid = Math.ceil(sorted.length / 2);
    strengths = sorted.slice(0, mid);
    weaknesses = sorted.slice(mid).reverse();
  } else {
    // All scores are >= 10: top half are strengths, bottom are minor focus
    const mid = Math.ceil(sorted.length / 2);
    strengths = sorted.slice(0, mid);
    weaknesses = sorted.slice(mid).reverse();
  }

  return { strengths, weaknesses };
}

/**
 * Pedagogical Report Service
 */
export const pedagogicalReportService = {
  /**
   * Fetch all system data for a student and build the structured pedagogical report payload.
   */
  async getStudentReportData(
    studentId: string,
    classId?: string,
  ): Promise<StructuredReportPayload> {
    // 1. Fetch Student Profile
    const student = (await directus.request(
      readItem("student_profiles", studentId, {
        fields: [
          "id",
          "first_name",
          "last_name",
          "external_id",
          "email",
          "preferred_language",
          "has_diagnosis",
          "needs_evaluation",
          "diagnosis_notes",
          "school_id",
        ],
      }),
    )) as StudentProfile;

    if (!student) {
      throw new Error(`Student not found: ${studentId}`);
    }

    // Reading a report never executes the model. Only the explicit manual action does.
    const supportPrediction = await getLatestStudentSupportPrediction(studentId);

    // 2. Fetch Class Details & Grade Level if available
    let classRecord: ClassRecord | null = null;
    let resolvedClassId = classId;

    if (!resolvedClassId) {
      // Find class through class_students
      const enrollments = (await directus.request(
        readItems("class_students", {
          filter: {
            student_id: { _eq: studentId },
            active: { _eq: true },
          },
          fields: ["id", "class_id"],
          limit: 1,
        }),
      )) as any[];

      if (enrollments.length > 0 && enrollments[0]?.class_id) {
        resolvedClassId =
          typeof enrollments[0].class_id === "object"
            ? enrollments[0].class_id.id
            : enrollments[0].class_id;
      }
    }

    if (resolvedClassId) {
      try {
        classRecord = (await directus.request(
          readItem("classes", resolvedClassId, {
            fields: ["id", "name", "code", "grade_level", "academic_year"],
          }),
        )) as ClassRecord;
      } catch {
        // Class read might fail if permission denied or deleted
      }
    }

    // 3. Fetch Curricular Domains dictionary
    const domainsData = (await directus.request(
      readItems("curriculum_domains", {
        fields: ["id", "code", "name", "category_id"],
        limit: 100,
      }),
    )) as CurriculumDomain[];

    const domainsMap = new Map<string, string>();
    for (const d of domainsData) {
      const name =
        typeof d.name === "object" && d.name !== null
          ? d.name.es || d.name.en || d.code
          : d.code;
      domainsMap.set(d.id, name);
    }

    // 4. Fetch Student Domain Evaluations
    const domainEvals = (await directus.request(
      readItems("student_domain_evaluations", {
        filter: { student_id: { _eq: studentId } },
        fields: [
          "id",
          "domain_id",
          "category_id",
          "score",
          "is_baseline",
          "evaluations_count",
          "correct_questions_count",
          "total_questions_count",
          "total_score_awarded",
          "total_max_score",
        ],
        limit: 100,
      }),
    )) as StudentDomainEvaluation[];

    // 5. Fetch Test Attempts for student
    const attempts = (await directus.request(
      readItems("test_attempts", {
        filter: {
          student_id: { _eq: studentId },
          status: { _in: ["submitted", "graded"] },
        },
        fields: ["id", "score", "max_score", "status", "submitted_at"],
        limit: 100,
      }),
    )) as TestAttempt[];

    // 6. Fetch Available Resources for School / Grade
    const availableResources = (await directus.request(
      readItems("resources", {
        filter: {
          status: { _eq: "published" },
        },
        fields: [
          "id",
          "title",
          "description",
          "resource_type",
          "target_level",
          "domain_id",
          "course_id",
          "url",
        ],
        limit: 150,
      }),
    )) as Resource[];

    // 7. Map Domain Evaluations to DomainReportItems
    const domainItems: DomainReportItem[] = domainEvals.map((de) => {
      const dId =
        typeof de.domain_id === "object" && de.domain_id !== null
          ? (de.domain_id as any).id
          : String(de.domain_id);
      const catId =
        typeof de.category_id === "object" && de.category_id !== null
          ? (de.category_id as any).id
          : de.category_id
            ? String(de.category_id)
            : undefined;

      const numScore = Number(de.score) || 0;
      const totalQ = Number(de.total_questions_count) || 0;
      const correctQ = Number(de.correct_questions_count) || 0;
      const accuracy = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;

      return {
        domain_id: dId,
        domain_name: domainsMap.get(dId) || dId,
        category_id: catId,
        score: numScore,
        mastery_level: determineMasteryLevel(numScore),
        evaluations_count: Number(de.evaluations_count) || 0,
        accuracy_percent: accuracy,
        total_questions: totalQ,
        is_baseline: Boolean(de.is_baseline),
      };
    });

    // 8. Analyze Strengths and Weaknesses
    const { strengths, weaknesses } = analyzeStrengthsAndWeaknesses(domainItems);

    // 9. Recommend Resources based on weaknesses and thresholds (<5, <10, >=10)
    const recommendedResources = buildRecommendedResources(
      weaknesses,
      strengths,
      availableResources,
      domainsMap,
    );

    // 10. Compute Aggregate Metrics
    const totalScore = domainItems.reduce((acc, curr) => acc + curr.score, 0);
    const avgScore = domainItems.length > 0 ? Math.round((totalScore / domainItems.length) * 100) / 100 : 0;
    const avgPercent = Math.round((avgScore / 15.0) * 100);

    const totalQuestionsAnswered = domainItems.reduce((acc, curr) => acc + curr.total_questions, 0);
    const totalQuestionsCorrect = domainEvals.reduce(
      (acc, curr) => acc + (Number(curr.correct_questions_count) || 0),
      0,
    );
    const overallAccuracy =
      totalQuestionsAnswered > 0
        ? Math.round((totalQuestionsCorrect / totalQuestionsAnswered) * 100)
        : 0;

    // 11. Diagnostic Info & Evaluation suggestion logic
    const diagnosticInfo = buildStudentReportDiagnosticInfo(student, supportPrediction);
    const hasDiagnosis = diagnosticInfo.has_diagnosis;
    const needsEvaluation = diagnosticInfo.needs_evaluation;
    const scoreDetail =
      supportPrediction?.attention_index !== null &&
      supportPrediction?.attention_index !== undefined &&
      supportPrediction.applied_threshold !== null
        ? `Índice de atención ${supportPrediction.attention_index.toFixed(3)}; umbral aplicado ${supportPrediction.applied_threshold.toFixed(3)}.`
        : null;

    // 12. Build LLM prompt blueprint
    const fullName = `${student.first_name} ${student.last_name}`;
    const strengthsText = strengths.length > 0
      ? strengths.map((s) => `- ${s.domain_name}: ${s.score}/15 (${s.accuracy_percent}% de acierto)`).join("\n")
      : "No se identificaron fortalezas consolidadas aún.";

    const weaknessesText = weaknesses.length > 0
      ? weaknesses.map((w) => `- ${w.domain_name}: ${w.score}/15 (Prioridad ${w.score < 5 ? "Urgente" : "Práctica"})`).join("\n")
      : "No se detectaron debilidades críticas.";

    const diagnosticContextText = hasDiagnosis
      ? `Alumno con diagnóstico previo: ${student.diagnosis_notes || "Registrado en expediente"}.`
      : supportPrediction === null
        ? "No se ha solicitado todavía una predicción de apoyo educativo."
      : needsEvaluation
        ? `El modelo PU sugiere revisión educativa. ${scoreDetail || ""}`.trim()
        : supportPrediction.status === "insufficient_information"
          ? `El modelo PU no emitió una decisión: ${supportPrediction.reason || "información insuficiente"}.`
          : `El modelo PU no superó el umbral de revisión; esto no descarta dificultades. ${scoreDetail || ""}`.trim();

    const recommendationsText = recommendedResources.length > 0
      ? recommendedResources.slice(0, 5).map((r) => `- [${r.priority_tier.toUpperCase()}] ${r.title} (${r.recommendation_reason})`).join("\n")
      : "Continuar con el currículo ordinario.";

    const payload: StructuredReportPayload = {
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        full_name: fullName,
        external_id: student.external_id || null,
        preferred_language: student.preferred_language || "es",
        grade_level: classRecord?.grade_level || null,
        class_id: classRecord?.id || null,
        class_name: classRecord?.name || null,
      },
      diagnostic: diagnosticInfo,
      metrics: {
        curriculum_average: avgScore,
        curriculum_average_percent: avgPercent,
        total_evaluated_domains: domainItems.length,
        tests_completed: attempts.length,
        total_questions_answered: totalQuestionsAnswered,
        overall_accuracy_percent: overallAccuracy,
      },
      domains: domainItems,
      strengths,
      weaknesses,
      recommended_resources: recommendedResources,
      llm_prompt_blueprint: {
        system_role: "Eres un orientador pedagógico experto. Tu objetivo es redactar un informe pedagógico constructivo, claro y orientado a la acción a partir de datos estructurados.",
        student_summary: `Estudiante: ${fullName} (Código: ${student.external_id || "N/A"}). Promedio curricular: ${avgScore}/15 (${avgPercent}%). Pruebas realizadas: ${attempts.length}.`,
        strengths_summary: strengthsText,
        weaknesses_summary: weaknessesText,
        diagnostic_context: diagnosticContextText,
        recommendations_summary: recommendationsText,
        format_instructions: "Genera una narrativa pedagógica estructurada en: 1. Resumen ejecutivo, 2. Análisis de competencias y fortalezas, 3. Áreas de intervención y necesidades específicas, 4. Plan de acción pedagógico con recursos recomendados.",
      },
    };

    return payload;
  },

  /**
   * Save or update draft report in Directus pedagogical_reports collection
   */
  async saveDraftReport(
    payload: StructuredReportPayload,
    teacherId?: string,
  ): Promise<PedagogicalReport> {
    const title = `Informe Pedagógico: ${payload.student.full_name}`;
    const structuredContent = {
      student: payload.student,
      diagnostic: payload.diagnostic,
      metrics: payload.metrics,
      domains: payload.domains,
      strengths: payload.strengths,
      weaknesses: payload.weaknesses,
      recommended_resources: payload.recommended_resources,
    };

    const generationContext = {
      llm_prompt_blueprint: payload.llm_prompt_blueprint,
      prepared_at: new Date().toISOString(),
      llm_status: "pending_generation",
    };

    // Check if an existing draft report exists for this student
    const existing = (await directus.request(
      readItems("pedagogical_reports", {
        filter: {
          student_id: { _eq: payload.student.id },
          status: { _eq: "draft" },
        },
        fields: ["id"],
        limit: 1,
      }),
    )) as PedagogicalReport[];

    if (existing.length > 0 && existing[0]) {
      return (await directus.request(
        updateItem("pedagogical_reports", existing[0].id, {
          title,
          language: payload.student.preferred_language,
          structured_content: structuredContent,
          generation_context: generationContext,
          updated_at: new Date().toISOString(),
        }),
      )) as PedagogicalReport;
    }

    const createPayload: any = {
      student_id: payload.student.id,
      title,
      language: payload.student.preferred_language,
      status: "draft",
      version: 1,
      structured_content: structuredContent,
      generation_context: generationContext,
    };

    if (payload.student.class_id) {
      createPayload.class_id = payload.student.class_id;
    }
    if (teacherId) {
      try {
        const teachers = (await directus.request(
          readItems("teacher_profiles", {
            filter: {
              _or: [
                { id: { _eq: teacherId } },
                { directus_user_id: { _eq: teacherId } },
              ],
            },
            fields: ["id"],
            limit: 1,
          }),
        )) as Array<{ id: string }>;
        if (teachers.length > 0 && teachers[0]?.id) {
          createPayload.created_by_teacher_id = teachers[0].id;
        }
      } catch {
        // Fallback: omit created_by_teacher_id if resolution fails
      }
    }

    return (await directus.request(
      createItem("pedagogical_reports", createPayload),
    )) as PedagogicalReport;
  },
};
