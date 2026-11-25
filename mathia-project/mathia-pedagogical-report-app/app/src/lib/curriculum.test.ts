import { describe, expect, it } from "vitest";

import type {
  CurriculumCategory,
  CurriculumCourseDomain,
  CurriculumDomain,
} from "../services/schema";
import {
  domainBelongsToCourse,
  formatCategoryName,
  formatCourseLabel,
  formatCourseOptionLabel,
  formatDomainName,
  getCategoriesForCourse,
  getCategoryForDomain,
  getCourseById,
  getCourseList,
  getCoursesForDomain,
  getDomainsForCourse,
  getDomainsForCourseAndCategory,
  questionMatchesCourse,
  relationId,
  resolveCourseIdFromGrade,
} from "./curriculum";

const mockTimestamps = {
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockCategories: CurriculumCategory[] = [
  { id: "N", code: "N", name: { es: "Número y cantidad", en: "Number and Quantity" }, active: true, ...mockTimestamps },
  { id: "A", code: "A", name: { es: "Álgebra", en: "Algebra" }, active: true, ...mockTimestamps },
  { id: "F", code: "F", name: { es: "Funciones", en: "Functions" }, active: true, ...mockTimestamps },
  { id: "G", code: "G", name: { es: "Geometría", en: "Geometry" }, active: true, ...mockTimestamps },
  { id: "S", code: "S", name: { es: "Estadística y probabilidad", en: "Statistics and Probability" }, active: true, ...mockTimestamps },
];

const mockDomains: CurriculumDomain[] = [
  { id: "6.RP", category_id: "N", code: "6.RP", name: { es: "Razones y relaciones proporcionales", en: "Ratios and Proportional Relationships" }, category_assignment: "project_crosswalk", source: {}, active: true, ...mockTimestamps },
  { id: "6.NS", category_id: "N", code: "6.NS", name: { es: "El sistema numérico", en: "The Number System" }, category_assignment: "project_crosswalk", source: {}, active: true, ...mockTimestamps },
  { id: "6.EE", category_id: "A", code: "6.EE", name: { es: "Expresiones y ecuaciones", en: "Expressions and Equations" }, category_assignment: "project_crosswalk", source: {}, active: true, ...mockTimestamps },
  { id: "6.G", category_id: "G", code: "6.G", name: { es: "Geometría", en: "Geometry" }, category_assignment: "project_crosswalk", source: {}, active: true, ...mockTimestamps },
  { id: "6.SP", category_id: "S", code: "6.SP", name: { es: "Estadística y probabilidad", en: "Statistics and Probability" }, category_assignment: "project_crosswalk", source: {}, active: true, ...mockTimestamps },
  { id: "8.F", category_id: "F", code: "8.F", name: { es: "Funciones", en: "Functions" }, category_assignment: "project_crosswalk", source: {}, active: true, ...mockTimestamps },
  { id: "HSA-CED", category_id: "A", code: "HSA-CED", name: { es: "Creación de ecuaciones", en: "Creating Equations" }, category_assignment: "official", source: {}, active: true, ...mockTimestamps },
];

const mockCourseDomains: CurriculumCourseDomain[] = [
  { id: "cd-1", course_id: "grade-6", domain_id: "6.RP" },
  { id: "cd-2", course_id: "grade-6", domain_id: "6.NS" },
  { id: "cd-3", course_id: "grade-6", domain_id: "6.EE" },
  { id: "cd-4", course_id: "grade-6", domain_id: "6.G" },
  { id: "cd-5", course_id: "grade-6", domain_id: "6.SP" },
  { id: "cd-6", course_id: "grade-8", domain_id: "8.F" },
  { id: "cd-7", course_id: "grade-9", domain_id: "HSA-CED" },
  { id: "cd-8", course_id: "grade-10", domain_id: "HSA-CED" },
];

describe("curriculum helpers", () => {
  it("provides canonical courses from grade 6 to 10 without embedded domainIds", () => {
    const courses = getCourseList();
    expect(courses).toHaveLength(5);
    expect(courses.map((c) => c.grade)).toEqual([6, 7, 8, 9, 10]);
    expect(courses.map((c) => c.id)).toEqual([
      "grade-6",
      "grade-7",
      "grade-8",
      "grade-9",
      "grade-10",
    ]);

    const grade6 = getCourseById("grade-6");
    expect(grade6).toBeDefined();
    expect(grade6?.grade).toBe(6);
    expect((grade6 as unknown as { domainIds?: unknown }).domainIds).toBeUndefined();
    expect(getCourseById("non-existent")).toBeUndefined();
  });

  it("formats course labels in Spanish, English and Italian correctly", () => {
    expect(formatCourseLabel("grade-6", "es")).toBe("6º Primaria");
    expect(formatCourseLabel(6, "es")).toBe("6º Primaria");
    expect(formatCourseLabel("grade-7", "es")).toBe("1º ESO");
    expect(formatCourseLabel(7, "es")).toBe("1º ESO");
    expect(formatCourseLabel("grade-8", "es")).toBe("2º ESO");
    expect(formatCourseLabel(8, "es")).toBe("2º ESO");
    expect(formatCourseLabel("grade-9", "es")).toBe("3º ESO");
    expect(formatCourseLabel(9, "es")).toBe("3º ESO");
    expect(formatCourseLabel("grade-10", "es")).toBe("4º ESO");
    expect(formatCourseLabel(10, "es")).toBe("4º ESO");

    expect(formatCourseLabel("grade-6", "en")).toBe("Grade 6");
    expect(formatCourseLabel(6, "en")).toBe("Grade 6");
    expect(formatCourseLabel("grade-7", "en")).toBe("Grade 7");
    expect(formatCourseLabel("grade-8", "en")).toBe("Grade 8");
    expect(formatCourseLabel("grade-9", "en")).toBe("Grade 9");
    expect(formatCourseLabel("grade-10", "en")).toBe("Grade 10");

    expect(formatCourseLabel("grade-99", "es")).toBe("grade-99");
    expect(getCourseList().map((course) => formatCourseLabel(course.id, "it"))).toEqual([
      "1ª Media",
      "2ª Media",
      "3ª Media",
      "1ª Superiore",
      "2ª Superiore",
    ]);
    expect(formatCourseLabel(10, "it")).toBe("2ª Superiore");
  });

  it("extracts relation IDs uniformly", () => {
    expect(relationId("grade-6")).toBe("grade-6");
    expect(relationId({ id: "grade-6" })).toBe("grade-6");
    expect(relationId(null)).toBe("");
    expect(relationId(undefined)).toBe("");
  });

  it("returns relational domains for a course", () => {
    expect(getDomainsForCourse("grade-6", mockCourseDomains)).toEqual([
      "6.RP",
      "6.NS",
      "6.EE",
      "6.G",
      "6.SP",
    ]);
    expect(getDomainsForCourse("grade-8", mockCourseDomains)).toEqual(["8.F"]);
    expect(getDomainsForCourse("unknown-grade", mockCourseDomains)).toEqual([]);
  });

  it("maps domains to courses and handles shared high school domains", () => {
    expect(getCoursesForDomain("6.EE", mockCourseDomains)).toEqual(["grade-6"]);
    expect(getCoursesForDomain("8.F", mockCourseDomains)).toEqual(["grade-8"]);

    const hsCourses = getCoursesForDomain("HSA-CED", mockCourseDomains);
    expect(hsCourses).toHaveLength(2);
    expect(hsCourses).toContain("grade-9");
    expect(hsCourses).toContain("grade-10");
  });

  it("checks if a domain belongs to a course", () => {
    expect(domainBelongsToCourse("6.EE", "grade-6", mockCourseDomains)).toBe(true);
    expect(domainBelongsToCourse("6.EE", "grade-7", mockCourseDomains)).toBe(false);
    expect(domainBelongsToCourse("HSA-CED", "grade-9", mockCourseDomains)).toBe(true);
    expect(domainBelongsToCourse("HSA-CED", "grade-10", mockCourseDomains)).toBe(true);
  });

  it("gets the category for a domain", () => {
    expect(getCategoryForDomain("6.EE", mockDomains)).toBe("A");
    expect(getCategoryForDomain("6.RP", mockDomains)).toBe("N");
    expect(getCategoryForDomain("8.F", mockDomains)).toBe("F");
    expect(getCategoryForDomain("unknown", mockDomains)).toBeNull();
  });

  it("filters categories available for a given course", () => {
    const grade6Categories = getCategoriesForCourse("grade-6", {
      categories: mockCategories,
      domains: mockDomains,
      courseDomains: mockCourseDomains,
    });
    const catCodes = grade6Categories.map((c) => c.code);
    expect(catCodes).toContain("N");
    expect(catCodes).toContain("A");
    expect(catCodes).toContain("G");
    expect(catCodes).toContain("S");
    // Functions (F) only exists in Grade 8
    expect(catCodes).not.toContain("F");

    const allCats = getCategoriesForCourse("all", {
      categories: mockCategories,
      domains: mockDomains,
      courseDomains: mockCourseDomains,
    });
    expect(allCats).toHaveLength(mockCategories.length);
  });

  it("filters domains by both course and category cascadingly", () => {
    const catalog = {
      domains: mockDomains,
      courseDomains: mockCourseDomains,
    };

    // Course + Category
    const grade6Number = getDomainsForCourseAndCategory("grade-6", "N", catalog);
    expect(grade6Number.map((d) => d.code)).toEqual(["6.RP", "6.NS"]);

    const grade6Algebra = getDomainsForCourseAndCategory("grade-6", "A", catalog);
    expect(grade6Algebra.map((d) => d.code)).toEqual(["6.EE"]);

    // Course without domains in a category returns an empty array
    const grade6Functions = getDomainsForCourseAndCategory("grade-6", "F", catalog);
    expect(grade6Functions).toEqual([]);

    // Category across all courses
    const allAlgebra = getDomainsForCourseAndCategory("all", "A", catalog);
    expect(allAlgebra.map((d) => d.code)).toEqual(["6.EE", "HSA-CED"]);

    // Shared domain resolves in both Grade 9 and Grade 10
    const grade9Algebra = getDomainsForCourseAndCategory("grade-9", "A", catalog);
    expect(grade9Algebra.map((d) => d.code)).toEqual(["HSA-CED"]);

    const grade10Algebra = getDomainsForCourseAndCategory("grade-10", "A", catalog);
    expect(grade10Algebra.map((d) => d.code)).toEqual(["HSA-CED"]);
  });

  it("formats category names localized", () => {
    expect(formatCategoryName(mockCategories[0], "es")).toBe("Número y cantidad");
    expect(formatCategoryName(mockCategories[0], "en")).toBe("Number and Quantity");
    expect(formatCategoryName(mockCategories[0], "it")).toBe("Numeri e quantità");
    expect(formatCategoryName({ code: "N", name: { it: "Numeri locali", es: "Número" } }, "it")).toBe("Numeri locali");
    expect(formatCategoryName(null)).toBe("");
  });

  it("uses Italian names for known curriculum domains", () => {
    expect(formatDomainName("6.RP", "it")).toBe("Rapporti e relazioni proporzionali");
    expect(formatDomainName(mockDomains[0], "it")).toBe("Rapporti e relazioni proporzionali");
    expect(formatDomainName({ code: "6.RP", name: { it: "Rapporti locali", es: "Razones" } }, "it")).toBe("Rapporti locali");
  });

  it("formats domain names without raw CCSS codes", () => {
    expect(formatDomainName("6.EE", "es")).toBe("Expresiones y ecuaciones");
    expect(formatDomainName("6.EE", "en")).toBe("Expressions and Equations");
    expect(formatDomainName("8.F", "es")).toBe("Funciones");
    expect(formatDomainName("8.F", "en")).toBe("Functions");

    const domainObj = {
      id: "6.NS",
      code: "6.NS",
      name: { es: "El sistema numérico", en: "The Number System" },
    };
    expect(formatDomainName(domainObj, "es")).toBe("El sistema numérico");
    expect(formatDomainName(domainObj, "en")).toBe("The Number System");

    expect(formatDomainName(null, "es")).toBe("");
    expect(formatDomainName(undefined, "es")).toBe("");
  });

  it("checks whether questions match courses using relational courseDomains", () => {
    const qGrade6 = { domain_id: "6.EE" };
    const qGrade8 = { domain_id: { id: "8.F" } };
    const qHS = { domain_id: "HSA-CED" };

    expect(questionMatchesCourse(qGrade6, "", mockCourseDomains)).toBe(true);
    expect(questionMatchesCourse(qGrade6, "all", mockCourseDomains)).toBe(true);

    expect(questionMatchesCourse(qGrade6, "grade-6", mockCourseDomains)).toBe(true);
    expect(questionMatchesCourse(qGrade6, "grade-7", mockCourseDomains)).toBe(false);

    expect(questionMatchesCourse(qGrade8, "grade-8", mockCourseDomains)).toBe(true);
    expect(questionMatchesCourse(qGrade8, "grade-6", mockCourseDomains)).toBe(false);

    expect(questionMatchesCourse(qHS, "grade-9", mockCourseDomains)).toBe(true);
    expect(questionMatchesCourse(qHS, "grade-10", mockCourseDomains)).toBe(true);
    expect(questionMatchesCourse(qHS, "grade-6", mockCourseDomains)).toBe(false);
  });

  it("resolves course IDs from arbitrary grade labels and legacy strings", () => {
    expect(resolveCourseIdFromGrade("grade-7")).toBe("grade-7");
    expect(resolveCourseIdFromGrade("1º Secundaria")).toBe("grade-7");
    expect(resolveCourseIdFromGrade("1 Secundaria")).toBe("grade-7");
    expect(resolveCourseIdFromGrade("1º ESO")).toBe("grade-7");
    expect(resolveCourseIdFromGrade("7th Grade")).toBe("grade-7");
    expect(resolveCourseIdFromGrade("2º ESO / 10")).toBe("grade-8");
    expect(resolveCourseIdFromGrade("3º ESO")).toBe("grade-9");
    expect(resolveCourseIdFromGrade("4º ESO")).toBe("grade-10");
    expect(resolveCourseIdFromGrade("6º Primaria")).toBe("grade-6");
    expect(resolveCourseIdFromGrade("1º Media")).toBe("grade-6");
    expect(resolveCourseIdFromGrade("2ª Media")).toBe("grade-7");
    expect(resolveCourseIdFromGrade("3ª Media")).toBe("grade-8");
    expect(resolveCourseIdFromGrade("1º Superior")).toBe("grade-9");
    expect(resolveCourseIdFromGrade("2ª Superiore")).toBe("grade-10");
    expect(resolveCourseIdFromGrade(null)).toBe("grade-6");
  });

  it("formats legacy course strings cleanly into localized labels", () => {
    expect(formatCourseLabel("1º Secundaria", "es")).toBe("1º ESO");
    expect(formatCourseLabel("1º Secundaria", "en")).toBe("Grade 7");
    expect(formatCourseLabel("2º ESO / 10", "es")).toBe("2º ESO");
    expect(formatCourseLabel("2º ESO / 10", "en")).toBe("Grade 8");
    expect(formatCourseLabel("1º Media", "en")).toBe("Grade 6");
    expect(formatCourseLabel("2ª Media", "it")).toBe("2ª Media");
    expect(formatCourseLabel("1º Superior", "it")).toBe("1ª Superiore");
    expect(formatCourseLabel(null, "es")).toBe("");
    expect(formatCourseLabel(undefined, "es")).toBe("");
  });

  it("formats course option labels bilingually", () => {
    const grade7 = getCourseById("grade-7")!;
    expect(formatCourseOptionLabel(grade7, "es")).toBe("1º ESO (Grade 7)");
    expect(formatCourseOptionLabel(grade7, "en")).toBe("Grade 7 (1º ESO)");
    expect(formatCourseOptionLabel(grade7, "it")).toBe("2ª Media (1º ESO)");
  });
});
