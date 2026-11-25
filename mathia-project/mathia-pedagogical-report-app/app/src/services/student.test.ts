import { beforeEach, describe, expect, it, vi } from "vitest";

const directusMock = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("./directus", () => ({ directus: directusMock }));

import { determineMasteryLevel, resolveCourseIdFromGrade, studentService } from "./student";

describe("studentService", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  it("fetches the student profile", async () => {
    const mockProfile = {
      id: "stu-1",
      first_name: "Lucas",
      last_name: "García",
      preferred_language: "es",
    };
    directusMock.request.mockResolvedValueOnce([mockProfile]);

    const profile = await studentService.getProfile();
    expect(profile).toEqual(mockProfile);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("fetches the enrolled class", async () => {
    const mockClass = {
      id: "class-1",
      name: "1º Secundaria A",
      code: "1SEC-A",
      grade_level: "1º Secundaria",
    };
    directusMock.request.mockResolvedValueOnce([mockClass]);

    const enrolled = await studentService.getEnrolledClass();
    expect(enrolled).toEqual(mockClass);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("fetches the student school", async () => {
    const mockSchool = {
      id: "school-1",
      name: "Mathia School",
      code: "MATH001",
    };
    directusMock.request.mockResolvedValueOnce([mockSchool]);

    const school = await studentService.getSchool();
    expect(school).toEqual(mockSchool);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("calculates student metrics with active class", async () => {
    directusMock.request
      .mockResolvedValueOnce([{ name: "1º Secundaria A", code: "1SEC-A" }])
      .mockResolvedValueOnce([{ id: "res-1" }])
      .mockResolvedValueOnce([]);

    const metrics = await studentService.getMetrics();
    expect(metrics).toEqual({
      className: "1º Secundaria A",
      classCode: "1SEC-A",
      resourcesCount: 1,
      pendingTestsCount: 0,
    });
    expect(directusMock.request).toHaveBeenCalledTimes(3);
  });

  it("calculates student metrics when no class is enrolled", async () => {
    directusMock.request
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const metrics = await studentService.getMetrics();
    expect(metrics).toEqual({
      className: null,
      classCode: null,
      resourcesCount: 0,
      pendingTestsCount: 0,
    });
  });

  const mockGrade6Domains = [
    { id: "cd-1", course_id: "grade-6", domain_id: "6.RP" },
    { id: "cd-2", course_id: "grade-6", domain_id: "6.NS" },
    { id: "cd-3", course_id: "grade-6", domain_id: "6.EE" },
    { id: "cd-4", course_id: "grade-6", domain_id: "6.G" },
    { id: "cd-5", course_id: "grade-6", domain_id: "6.SP" },
  ];
  const mockGrade7Domains = [
    { id: "cd-6", course_id: "grade-7", domain_id: "7.RP" },
    { id: "cd-7", course_id: "grade-7", domain_id: "7.NS" },
    { id: "cd-8", course_id: "grade-7", domain_id: "7.EE" },
    { id: "cd-9", course_id: "grade-7", domain_id: "7.G" },
    { id: "cd-10", course_id: "grade-7", domain_id: "7.SP" },
  ];

  it("returns null score and unassessed status for un-evaluated domains without fictitious 5.0", async () => {
    const mockProfile = { id: "stu-1", first_name: "Lucas", last_name: "García" };
    const mockClass = { id: "class-1", grade_level: "6º Primaria" };

    directusMock.request
      .mockResolvedValueOnce([mockProfile]) // getProfile
      .mockResolvedValueOnce([mockClass]) // getEnrolledClass
      .mockResolvedValueOnce([]) // no evaluations in database yet
      .mockResolvedValueOnce(mockGrade6Domains); // relational course domains

    const profile = await studentService.getPedagogicalProfile("es");
    expect(profile).not.toBeNull();
    expect(profile?.courseId).toBe("grade-6");
    expect(profile?.domains.length).toBe(5); // 6.NS, 6.RP, 6.EE, 6.G, 6.SP
    expect(profile?.overallAverageScore).toBeNull();
    expect(profile?.baselineDomainsCount).toBe(5);
    expect(profile?.evaluatedDomainsCount).toBe(0);

    for (const d of profile!.domains) {
      expect(d.score).toBeNull();
      expect(d.isBaseline).toBe(true);
      expect(d.evidenceStatus).toBe("unassessed");
      expect(d.masteryLevel).toBe("unassessed");
    }
  });

  it("applies evaluated scores from test attempts and identifies reinforcement domains", async () => {
    const mockProfile = { id: "stu-1", first_name: "Lucas", last_name: "García" };
    const mockClass = { id: "class-1", grade_level: "6º Primaria" };
    const mockEvaluation = {
      domain_id: "6.EE",
      category_id: "A",
      score: "3.33",
      is_baseline: false,
      evaluations_count: 1,
      correct_questions_count: 1,
      total_questions_count: 3,
      last_evaluated_at: "2026-09-06T12:00:00Z",
    };

    directusMock.request
      .mockResolvedValueOnce([mockProfile])
      .mockResolvedValueOnce([mockClass])
      .mockResolvedValueOnce([mockEvaluation])
      .mockResolvedValueOnce(mockGrade6Domains);

    const profile = await studentService.getPedagogicalProfile("es");
    expect(profile).not.toBeNull();
    expect(profile?.evaluatedDomainsCount).toBe(1);
    expect(profile?.baselineDomainsCount).toBe(4);

    const eeDomain = profile?.domains.find((d) => d.domainId === "6.EE");
    expect(eeDomain).toBeDefined();
    expect(eeDomain?.score).toBe(3.33);
    expect(eeDomain?.isBaseline).toBe(false);
    expect(eeDomain?.masteryLevel).toBe("needs_reinforcement");

    expect(profile?.reinforcementDomains.length).toBe(1);
    expect(profile?.reinforcementDomains[0]?.domainId).toBe("6.EE");
  });

  describe("determineMasteryLevel (0 - 15 scale)", () => {
    it("classifies scores >= 12.5 as mastered", () => {
      expect(determineMasteryLevel(15.0)).toBe("mastered");
      expect(determineMasteryLevel(12.5)).toBe("mastered");
    });

    it("classifies scores between 9.5 and 12.49 as proficient", () => {
      expect(determineMasteryLevel(12.4)).toBe("proficient");
      expect(determineMasteryLevel(9.5)).toBe("proficient");
    });

    it("classifies scores between 5.0 and 9.49 as in_progress", () => {
      expect(determineMasteryLevel(9.4)).toBe("in_progress");
      expect(determineMasteryLevel(5.0)).toBe("in_progress");
    });

    it("classifies scores < 5.0 as needs_reinforcement", () => {
      expect(determineMasteryLevel(4.9)).toBe("needs_reinforcement");
      expect(determineMasteryLevel(0.0)).toBe("needs_reinforcement");
    });
  });

  describe("resolveCourseIdFromGrade", () => {
    it("resolves 1º Secundaria and 1º ESO variations to grade-7", () => {
      expect(resolveCourseIdFromGrade("1º Secundaria")).toBe("grade-7");
      expect(resolveCourseIdFromGrade("1º Secundaria A")).toBe("grade-7");
      expect(resolveCourseIdFromGrade("1º ESO")).toBe("grade-7");
      expect(resolveCourseIdFromGrade("1 ESO")).toBe("grade-7");
      expect(resolveCourseIdFromGrade("Grade 7")).toBe("grade-7");
      expect(resolveCourseIdFromGrade("7th Grade")).toBe("grade-7");
    });

    it("resolves other ESO and Primary grades correctly", () => {
      expect(resolveCourseIdFromGrade("6º Primaria")).toBe("grade-6");
      expect(resolveCourseIdFromGrade("2º ESO / 10")).toBe("grade-8");
      expect(resolveCourseIdFromGrade("2º Secundaria")).toBe("grade-8");
      expect(resolveCourseIdFromGrade("3º ESO")).toBe("grade-9");
      expect(resolveCourseIdFromGrade("4º ESO")).toBe("grade-10");
      expect(resolveCourseIdFromGrade(null)).toBe("grade-6");
    });
  });

  it("does not transfer cross-grade evaluated domains through prefix or suffix matching", async () => {
    const mockProfile = { id: "stu-1", first_name: "Lucas", last_name: "García" };
    const mockClass = { id: "class-1", grade_level: "1º Secundaria" };
    // Evaluation was recorded with 6.EE from a test with grade 6 questions
    const mockEvaluation = {
      domain_id: "6.EE",
      category_id: "A",
      score: "7.50",
      is_baseline: false,
      evaluations_count: 2,
      correct_questions_count: 3,
      total_questions_count: 6,
      last_evaluated_at: "2026-09-06T12:00:00Z",
    };

    directusMock.request
      .mockResolvedValueOnce([mockProfile])
      .mockResolvedValueOnce([mockClass])
      .mockResolvedValueOnce([mockEvaluation])
      .mockResolvedValueOnce(mockGrade7Domains);

    const profile = await studentService.getPedagogicalProfile("es");
    expect(profile).not.toBeNull();
    expect(profile?.courseId).toBe("grade-7");
    expect(profile?.courseLabel).toBe("1º ESO");

    // 7.EE should NOT inherit the evaluation from 6.EE
    const eeDomain = profile?.domains.find((d) => d.domainId === "7.EE");
    expect(eeDomain).toBeDefined();
    expect(eeDomain?.score).toBeNull();
    expect(eeDomain?.evidenceStatus).toBe("unassessed");
  });
});
