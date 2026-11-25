import { beforeEach, describe, expect, it, vi } from "vitest";

const directusMock = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("./directus", () => ({ directus: directusMock }));

import { computeClassStats, teacherService } from "./teacher";

describe("teacherService", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  it("fetches assigned classes filtered by active", async () => {
    const mockClasses = [
      { id: "class-1", name: "1º Secundaria A", code: "1SEC-A", active: true },
    ];
    directusMock.request.mockResolvedValueOnce(mockClasses);

    const classes = await teacherService.getAssignedClasses();
    expect(classes).toEqual(mockClasses);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("fetches students sorted by last_name and first_name", async () => {
    const mockStudents = [
      { id: "stu-1", first_name: "Lucas", last_name: "García", active: true },
    ];
    directusMock.request.mockResolvedValueOnce(mockStudents);

    const students = await teacherService.getStudents();
    expect(students).toEqual(mockStudents);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("calculates teacher metrics accurately", async () => {
    directusMock.request
      .mockResolvedValueOnce([{ id: "class-1" }])
      .mockResolvedValueOnce([{ id: "stu-1" }, { id: "stu-2" }])
      .mockResolvedValueOnce([]);

    const metrics = await teacherService.getMetrics();
    expect(metrics).toEqual({
      classesCount: 1,
      studentsCount: 2,
      reportsCount: 0,
    });
    expect(directusMock.request).toHaveBeenCalledTimes(3);
  });

  it("fetches class_students with optional classId filter", async () => {
    const mockClassStudents = [
      { id: "cs-1", class_id: "class-1", student_id: "stu-1", active: true },
    ];
    directusMock.request.mockResolvedValueOnce(mockClassStudents);

    const result = await teacherService.getClassStudents("class-1");
    expect(result).toEqual(mockClassStudents);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("computes class stats accurately with attempts and students", () => {
    const students = [
      { id: "stu-1", first_name: "Lucas", last_name: "García" } as any,
      { id: "stu-2", first_name: "Elena", last_name: "Martín" } as any,
    ];
    const assignments = [
      {
        id: "asg-1",
        test_id: { id: "test-1", title: "Matemáticas I", max_score: 10 } as any,
        test_version_id: { version_number: 1, max_score: 10 } as any,
      } as any,
    ];
    const attempts = [
      {
        id: "att-1",
        attempt_number: 1,
        test_assignment_id: { id: "asg-1" } as any,
        student_id: { id: "stu-1" } as any,
        status: "graded" as any,
        score: 8,
        max_score: 10,
      } as any,
    ];

    const stats = computeClassStats("class-1", students, assignments, attempts);
    expect(stats.total_students).toBe(2);
    expect(stats.total_assignments).toBe(1);
    expect(stats.total_completed_attempts).toBe(1);
    expect(stats.class_average_percent).toBe(80);

    const testStat = stats.test_stats[0]!;
    expect(testStat.completed_count).toBe(1);
    expect(testStat.pending_count).toBe(1);
    expect(testStat.completion_rate_percent).toBe(50);
    expect(testStat.average_score).toBe(8);

    const stu1 = stats.student_stats.find((s) => s.student_id === "stu-1")!;
    expect(stu1.completed_tests_count).toBe(1);
    expect(stu1.average_score_percent).toBe(80);

    const stu2 = stats.student_stats.find((s) => s.student_id === "stu-2")!;
    expect(stu2.completed_tests_count).toBe(0);
    expect(stu2.average_score_percent).toBe(0);
  });

  it("groups curricular standards by Big Five category and calculates class averages", async () => {
    directusMock.request
      .mockResolvedValueOnce({ id: "class-1", grade_level: "grade-6" })
      .mockResolvedValueOnce([{ student_id: { id: "stu-1" } }, { student_id: { id: "stu-2" } }])
      .mockResolvedValueOnce([
        { student_id: { id: "stu-1" }, standard_id: { id: "std-n" }, score: 12, evaluations_count: 2, correct_questions_count: 2, total_questions_count: 3 },
        { student_id: { id: "stu-2" }, standard_id: { id: "std-n" }, score: 8, evaluations_count: 1, correct_questions_count: 1, total_questions_count: 2 },
        { student_id: { id: "stu-1" }, standard_id: { id: "std-a" }, score: 6, evaluations_count: 1, correct_questions_count: 1, total_questions_count: 2 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "course-std-n", course_id: { id: "grade-6" }, standard_id: { id: "std-n" } },
        { id: "course-std-a", course_id: { id: "grade-6" }, standard_id: { id: "std-a" } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "std-n", cluster_id: { id: "cluster-n" }, code: "6.NS.1", description: { es: "Números", en: "Numbers" } },
        { id: "std-a", cluster_id: { id: "cluster-a" }, code: "6.RP.1", description: { es: "Razones", en: "Ratios" } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { course_id: { id: "grade-6" }, domain_id: { id: "6.NS" } },
        { course_id: { id: "grade-6" }, domain_id: { id: "6.RP" } },
      ])
      .mockResolvedValueOnce([
        { id: "6.NS", category_id: { id: "N" }, code: "6.NS", name: { es: "El sistema numérico", en: "The Number System" } },
        { id: "6.RP", category_id: { id: "A" }, code: "6.RP", name: { es: "Razones", en: "Ratios" } },
      ])
      .mockResolvedValueOnce([
        { id: "cluster-n", domain_id: { id: "6.NS" } },
        { id: "cluster-a", domain_id: { id: "6.RP" } },
      ])
      .mockResolvedValueOnce([
        { id: "N", code: "N", name: { es: "Números y cantidades", en: "Number and Quantity" } },
        { id: "A", code: "A", name: { es: "Álgebra", en: "Algebra" } },
        { id: "F", code: "F", name: { es: "Funciones", en: "Functions" } },
        { id: "G", code: "G", name: { es: "Geometría", en: "Geometry" } },
        { id: "S", code: "S", name: { es: "Estadística y probabilidad", en: "Statistics and Probability" } },
      ]);

    const result = await teacherService.getClassCurricularBreakdown("class-1", "es");
    const numberCategory = result.find((category) => category.categoryId === "N")!;
    const algebraCategory = result.find((category) => category.categoryId === "A")!;

    expect(result.map((category) => category.categoryId)).toEqual(["N", "A", "F", "G", "S"]);
    expect(numberCategory.categoryName).toBe("Números y cantidades");
    expect(numberCategory.score).toBe(10);
    expect(numberCategory.standards[0]?.score).toBe(10);
    expect(numberCategory.standards[0]?.evaluatedStudentsCount).toBe(2);
    expect(algebraCategory.score).toBe(6);
    expect(algebraCategory.standards[0]?.code).toBe("6.RP.1");
  });
});
