import { describe, expect, it } from "vitest";
import {
  analyzeStrengthsAndWeaknesses,
  buildStudentReportDiagnosticInfo,
  buildRecommendedResources,
  type DomainReportItem,
} from "./pedagogical-report";
import type { Resource, StudentProfile, StudentSupportPrediction } from "./schema";

function student(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    id: "student-1",
    school_id: "school-1",
    directus_user_id: null,
    external_id: null,
    first_name: "Ada",
    last_name: "Lovelace",
    preferred_name: null,
    email: null,
    date_of_birth: null,
    preferred_language: "es",
    sex: "female",
    has_diagnosis: false,
    needs_evaluation: false,
    diagnosis_notes: null,
    active: true,
    created_at: "2026-09-25T00:00:00Z",
    updated_at: "2026-09-25T00:00:00Z",
    ...overrides,
  };
}

function supportPrediction(
  overrides: Partial<StudentSupportPrediction> = {},
): StudentSupportPrediction {
  return {
    id: "prediction-1",
    school_id: "school-1",
    student_id: "student-1",
    suggests_educational_support: false,
    status: "no_support_signal",
    attention_index: 0.5,
    applied_threshold: 0.66,
    model_name: "mathia_pu",
    model_version: "schema-v4-test",
    model_route: "con_tiempos",
    evidence_level: "standard",
    total_responses: 100,
    valid_response_times: 90,
    volume_outside_fit_range: false,
    warnings: ["prediction_is_not_a_diagnosis"],
    reason: null,
    generated_at: "2026-09-25T00:00:00Z",
    created_at: "2026-09-25T00:00:00Z",
    ...overrides,
  };
}

describe("buildStudentReportDiagnosticInfo", () => {
  it("does not execute or invent a result when no prediction was requested", () => {
    const diagnostic = buildStudentReportDiagnosticInfo(student(), null);

    expect(diagnostic.support_prediction).toBeNull();
    expect(diagnostic.needs_evaluation).toBe(false);
    expect(diagnostic.evaluation_suggestion_label).toBe("Predicción no solicitada");
  });

  it("keeps null as insufficient information instead of false", () => {
    const diagnostic = buildStudentReportDiagnosticInfo(
      student(),
      supportPrediction({
        suggests_educational_support: null,
        status: "insufficient_information",
        attention_index: null,
        applied_threshold: null,
        evidence_level: "limited",
        reason: "Faltan datos obligatorios.",
      }),
    );

    expect(diagnostic.needs_evaluation).toBe(false);
    expect(diagnostic.support_prediction?.suggests_educational_support).toBeNull();
    expect(diagnostic.evaluation_suggestion_label).toContain("Información insuficiente");
    expect(diagnostic.evaluation_suggestion_detail).toBe("Faltan datos obligatorios.");
  });

  it("uses the model decision instead of the legacy profile boolean", () => {
    const diagnostic = buildStudentReportDiagnosticInfo(
      student({ needs_evaluation: false }),
      supportPrediction({
        suggests_educational_support: true,
        status: "support_suggested",
        attention_index: 0.75,
      }),
    );

    expect(diagnostic.needs_evaluation).toBe(true);
    expect(diagnostic.evaluation_suggestion_detail).toContain("0.750");
  });

  it("preserves a registered diagnosis without presenting a model decision", () => {
    const diagnostic = buildStudentReportDiagnosticInfo(
      student({ has_diagnosis: true, diagnosis_notes: "Seguimiento activo" }),
      supportPrediction({
        suggests_educational_support: null,
        status: "diagnosis_recorded",
        attention_index: null,
        applied_threshold: null,
      }),
    );

    expect(diagnostic.has_diagnosis).toBe(true);
    expect(diagnostic.needs_evaluation).toBe(false);
    expect(diagnostic.evaluation_suggestion_detail).toBe("Seguimiento activo");
  });
});

describe("analyzeStrengthsAndWeaknesses", () => {
  it("splits domains into strengths (>= 10.0) and weaknesses (< 10.0)", () => {
    const domains: DomainReportItem[] = [
      {
        domain_id: "dom-1",
        domain_name: "Álgebra",
        score: 13.5,
        mastery_level: "mastered",
        evaluations_count: 3,
        accuracy_percent: 90,
        total_questions: 10,
        is_baseline: false,
      },
      {
        domain_id: "dom-2",
        domain_name: "Geometría",
        score: 10.5,
        mastery_level: "proficient",
        evaluations_count: 2,
        accuracy_percent: 70,
        total_questions: 8,
        is_baseline: false,
      },
      {
        domain_id: "dom-3",
        domain_name: "Fracciones",
        score: 4.5,
        mastery_level: "needs_reinforcement",
        evaluations_count: 2,
        accuracy_percent: 30,
        total_questions: 10,
        is_baseline: false,
      },
      {
        domain_id: "dom-4",
        domain_name: "Estadística",
        score: 7.2,
        mastery_level: "in_progress",
        evaluations_count: 1,
        accuracy_percent: 48,
        total_questions: 6,
        is_baseline: false,
      },
    ];

    const { strengths, weaknesses } = analyzeStrengthsAndWeaknesses(domains);

    expect(strengths).toHaveLength(2);
    expect(strengths[0]!.domain_name).toBe("Álgebra");
    expect(strengths[1]!.domain_name).toBe("Geometría");

    expect(weaknesses).toHaveLength(2);
    // Ordered from lowest score first
    expect(weaknesses[0]!.domain_name).toBe("Fracciones");
    expect(weaknesses[0]!.score).toBe(4.5);
    expect(weaknesses[1]!.domain_name).toBe("Estadística");
    expect(weaknesses[1]!.score).toBe(7.2);
  });

  it("handles empty domain list gracefully", () => {
    const result = analyzeStrengthsAndWeaknesses([]);
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
  });

  it("splits relatively when all scores are below 10", () => {
    const domains: DomainReportItem[] = [
      {
        domain_id: "dom-1",
        domain_name: "D1",
        score: 8.0,
        mastery_level: "in_progress",
        evaluations_count: 1,
        accuracy_percent: 53,
        total_questions: 5,
        is_baseline: false,
      },
      {
        domain_id: "dom-2",
        domain_name: "D2",
        score: 3.5,
        mastery_level: "needs_reinforcement",
        evaluations_count: 1,
        accuracy_percent: 23,
        total_questions: 5,
        is_baseline: false,
      },
    ];

    const { strengths, weaknesses } = analyzeStrengthsAndWeaknesses(domains);
    expect(strengths[0]!.domain_name).toBe("D1");
    expect(weaknesses[0]!.domain_name).toBe("D2");
  });
});

describe("buildRecommendedResources", () => {
  const domainsMap = new Map([
    ["dom-urgent", "Fracciones"],
    ["dom-moderate", "Ecuaciones"],
    ["dom-master", "Álgebra"],
  ]);

  const mockWeaknesses: DomainReportItem[] = [
    {
      domain_id: "dom-urgent",
      domain_name: "Fracciones",
      score: 4.0,
      mastery_level: "needs_reinforcement",
      evaluations_count: 2,
      accuracy_percent: 26,
      total_questions: 10,
      is_baseline: false,
    },
    {
      domain_id: "dom-moderate",
      domain_name: "Ecuaciones",
      score: 8.0,
      mastery_level: "in_progress",
      evaluations_count: 2,
      accuracy_percent: 53,
      total_questions: 10,
      is_baseline: false,
    },
  ];

  const mockStrengths: DomainReportItem[] = [
    {
      domain_id: "dom-master",
      domain_name: "Álgebra",
      score: 14.0,
      mastery_level: "mastered",
      evaluations_count: 3,
      accuracy_percent: 93,
      total_questions: 10,
      is_baseline: false,
    },
  ];

  const mockResources: Resource[] = [
    {
      id: "res-1",
      school_id: "sch-1",
      created_by_teacher_id: null,
      title: "Guía intensiva de fracciones",
      description: "Ejercicios paso a paso",
      resource_type: "document",
      target_level: "reinforcement",
      category_id: null,
      domain_id: "dom-urgent",
      cluster_id: null,
      standard_id: null,
      substandard_id: null,
      course_id: "course-1",
      language: "es",
      status: "published",
      url: null,
      directus_file_id: null,
      body: null,
      metadata: {},
      published_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-2",
      school_id: "sch-1",
      created_by_teacher_id: null,
      title: "Práctica de ecuaciones lineales",
      description: "Problemas guiados",
      resource_type: "exercise",
      target_level: "practice",
      category_id: null,
      domain_id: "dom-moderate",
      cluster_id: null,
      standard_id: null,
      substandard_id: null,
      course_id: "course-1",
      language: "es",
      status: "published",
      url: null,
      directus_file_id: null,
      body: null,
      metadata: {},
      published_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-3",
      school_id: "sch-1",
      created_by_teacher_id: null,
      title: "Desafíos de álgebra avanzada",
      description: "Ampliación de conceptos",
      resource_type: "link",
      target_level: "enrichment",
      category_id: null,
      domain_id: "dom-master",
      cluster_id: null,
      standard_id: null,
      substandard_id: null,
      course_id: "course-1",
      language: "es",
      status: "published",
      url: null,
      directus_file_id: null,
      body: null,
      metadata: {},
      published_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  ];

  it("assigns urgent tier to resources matching score < 5.0 and reinforcement target", () => {
    const recommendations = buildRecommendedResources(
      mockWeaknesses,
      mockStrengths,
      mockResources,
      domainsMap,
    );

    const urgentRec = recommendations.find((r) => r.priority_tier === "urgent");
    expect(urgentRec).toBeDefined();
    expect(urgentRec?.resource_id).toBe("res-1");
    expect(urgentRec?.target_level).toBe("reinforcement");
    expect(urgentRec?.recommendation_reason).toContain("< 5.0/15");
  });

  it("assigns practice tier to resources matching score between 5.0 and 9.9", () => {
    const recommendations = buildRecommendedResources(
      mockWeaknesses,
      mockStrengths,
      mockResources,
      domainsMap,
    );

    const practiceRec = recommendations.find((r) => r.priority_tier === "practice");
    expect(practiceRec).toBeDefined();
    expect(practiceRec?.resource_id).toBe("res-2");
    expect(practiceRec?.recommendation_reason).toContain("debajo de 10.0/15");
  });

  it("assigns enrichment tier for high-scoring strengths", () => {
    const recommendations = buildRecommendedResources(
      mockWeaknesses,
      mockStrengths,
      mockResources,
      domainsMap,
    );

    const enrichmentRec = recommendations.find((r) => r.priority_tier === "enrichment");
    expect(enrichmentRec).toBeDefined();
    expect(enrichmentRec?.resource_id).toBe("res-3");
    expect(enrichmentRec?.recommendation_reason).toContain("≥ 10.0/15");
  });
});
