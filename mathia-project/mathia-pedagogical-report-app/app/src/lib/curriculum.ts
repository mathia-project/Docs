import type {
  CurriculumCategory,
  CurriculumCourseDomain,
  CurriculumDomain,
  QuestionBankItem,
} from "../services/schema";
import type { Locale } from "./i18n";

export interface CurriculumCourseDef {
  id: string;
  grade: number;
  labels: {
    es: string;
    en: string;
    it: string;
  };
  officialNames: {
    es: string;
    en: string;
    it: string;
  };
}

export const CANONICAL_COURSES: readonly CurriculumCourseDef[] = [
  {
    id: "grade-6",
    grade: 6,
    labels: {
      es: "6º Primaria",
      en: "Grade 6",
      it: "1ª Media",
    },
    officialNames: {
      es: "6.º de Educación Primaria",
      en: "Year 6 of Primary Education",
      it: "1° anno della scuola secondaria di primo grado",
    },
  },
  {
    id: "grade-7",
    grade: 7,
    labels: {
      es: "1º ESO",
      en: "Grade 7",
      it: "2ª Media",
    },
    officialNames: {
      es: "1.º de Educación Secundaria Obligatoria (ESO)",
      en: "Year 1 of Compulsory Secondary Education (ESO)",
      it: "2° anno della scuola secondaria di primo grado",
    },
  },
  {
    id: "grade-8",
    grade: 8,
    labels: {
      es: "2º ESO",
      en: "Grade 8",
      it: "3ª Media",
    },
    officialNames: {
      es: "2.º de Educación Secundaria Obligatoria (ESO)",
      en: "Year 2 of Compulsory Secondary Education (ESO)",
      it: "3° anno della scuola secondaria di primo grado",
    },
  },
  {
    id: "grade-9",
    grade: 9,
    labels: {
      es: "3º ESO",
      en: "Grade 9",
      it: "1ª Superiore",
    },
    officialNames: {
      es: "3.º de Educación Secundaria Obligatoria (ESO)",
      en: "Year 3 of Compulsory Secondary Education (ESO)",
      it: "1° anno della scuola secondaria di secondo grado",
    },
  },
  {
    id: "grade-10",
    grade: 10,
    labels: {
      es: "4º ESO",
      en: "Grade 10",
      it: "2ª Superiore",
    },
    officialNames: {
      es: "4.º de Educación Secundaria Obligatoria (ESO)",
      en: "Year 4 of Compulsory Secondary Education (ESO)",
      it: "2° anno della scuola secondaria di secondo grado",
    },
  },
] as const;

export const DOMAIN_NAME_FALLBACKS: Record<string, { es: string; en: string }> = {
  "6.EE": { es: "Expresiones y ecuaciones", en: "Expressions and Equations" },
  "6.G": { es: "Geometría", en: "Geometry" },
  "6.NS": { es: "El sistema numérico", en: "The Number System" },
  "6.RP": { es: "Razones y relaciones proporcionales", en: "Ratios and Proportional Relationships" },
  "6.SP": { es: "Estadística y probabilidad", en: "Statistics and Probability" },
  "7.EE": { es: "Expresiones y ecuaciones", en: "Expressions and Equations" },
  "7.G": { es: "Geometría", en: "Geometry" },
  "7.NS": { es: "El sistema numérico", en: "The Number System" },
  "7.RP": { es: "Razones y relaciones proporcionales", en: "Ratios and Proportional Relationships" },
  "7.SP": { es: "Estadística y probabilidad", en: "Statistics and Probability" },
  "8.EE": { es: "Expresiones y ecuaciones", en: "Expressions and Equations" },
  "8.F": { es: "Funciones", en: "Functions" },
  "8.G": { es: "Geometría", en: "Geometry" },
  "8.NS": { es: "El sistema numérico", en: "The Number System" },
  "8.SP": { es: "Estadística y probabilidad", en: "Statistics and Probability" },
  "HSA-APR": { es: "Aritmética con polinomios y expresiones racionales", en: "Arithmetic with Polynomials and Rational Expressions" },
  "HSA-CED": { es: "Creación de ecuaciones", en: "Creating Equations" },
  "HSA-REI": { es: "Razonamiento con ecuaciones e inecuaciones", en: "Reasoning with Equations and Inequalities" },
  "HSA-SSE": { es: "Reconocimiento de la estructura de las expresiones", en: "Seeing Structure in Expressions" },
  "HSF-BF": { es: "Construcción de funciones", en: "Building Functions" },
  "HSF-IF": { es: "Interpretación de funciones", en: "Interpreting Functions" },
  "HSF-LE": { es: "Modelos lineales, cuadráticos y exponenciales", en: "Linear, Quadratic, and Exponential Models" },
  "HSF-TF": { es: "Funciones trigonométricas", en: "Trigonometric Functions" },
  "HSG-C": { es: "Circunferencias", en: "Circles" },
  "HSG-CO": { es: "Congruencia", en: "Congruence" },
  "HSG-GMD": { es: "Medición geométrica y dimensión", en: "Geometric Measurement and Dimension" },
  "HSG-GPE": { es: "Expresión de propiedades geométricas mediante ecuaciones", en: "Expressing Geometric Properties with Equations" },
  "HSG-SRT": { es: "Semejanza, triángulos rectángulos y trigonometría", en: "Similarity, Right Triangles, and Trigonometry" },
  "HSN-CN": { es: "El sistema de los números complejos", en: "The Complex Number System" },
  "HSN-Q": { es: "Cantidades", en: "Quantities" },
  "HSN-RN": { es: "El sistema de los números reales", en: "The Real Number System" },
  "HSS-CP": { es: "Probabilidad condicionada y reglas de probabilidad", en: "Conditional Probability and the Rules of Probability" },
  "HSS-ID": { es: "Interpretación de datos categóricos y cuantitativos", en: "Interpreting Categorical and Quantitative Data" },
  "HSS-MD": { es: "Uso de la probabilidad para tomar decisiones", en: "Using Probability to Make Decisions" },
};

const ITALIAN_CATEGORY_NAMES: Record<string, string> = {
  N: "Numeri e quantità",
  A: "Algebra",
  F: "Funzioni",
  G: "Geometria",
  S: "Statistica e probabilità",
};

const ITALIAN_DOMAIN_NAMES: Record<string, string> = {
  "6.EE": "Espressioni ed equazioni",
  "6.G": "Geometria",
  "6.NS": "Il sistema numerico",
  "6.RP": "Rapporti e relazioni proporzionali",
  "6.SP": "Statistica e probabilità",
  "7.EE": "Espressioni ed equazioni",
  "7.G": "Geometria",
  "7.NS": "Il sistema numerico",
  "7.RP": "Rapporti e relazioni proporzionali",
  "7.SP": "Statistica e probabilità",
  "8.EE": "Espressioni ed equazioni",
  "8.F": "Funzioni",
  "8.G": "Geometria",
  "8.NS": "Il sistema numerico",
  "8.SP": "Statistica e probabilità",
  "HSA-APR": "Aritmetica con polinomi ed espressioni razionali",
  "HSA-CED": "Creazione di equazioni",
  "HSA-REI": "Ragionamento con equazioni e disequazioni",
  "HSA-SSE": "Struttura delle espressioni",
  "HSF-BF": "Costruzione di funzioni",
  "HSF-IF": "Interpretazione delle funzioni",
  "HSF-LE": "Modelli lineari, quadratici ed esponenziali",
  "HSF-TF": "Funzioni trigonometriche",
  "HSG-C": "Circonferenze",
  "HSG-CO": "Congruenza",
  "HSG-GMD": "Misura geometrica e dimensione",
  "HSG-GPE": "Proprietà geometriche espresse mediante equazioni",
  "HSG-SRT": "Similitudine, triangoli rettangoli e trigonometria",
  "HSN-CN": "Il sistema dei numeri complessi",
  "HSN-Q": "Quantità",
  "HSN-RN": "Il sistema dei numeri reali",
  "HSS-CP": "Probabilità condizionata e regole della probabilità",
  "HSS-ID": "Interpretazione di dati categorici e quantitativi",
  "HSS-MD": "Uso della probabilità per prendere decisioni",
};

export type CanonicalCourseId = "grade-6" | "grade-7" | "grade-8" | "grade-9" | "grade-10";

export function resolveCourseIdFromGrade(gradeLevel?: string | null): CanonicalCourseId {
  if (!gradeLevel) return "grade-6";
  const clean = gradeLevel.trim().toLowerCase();

  // Direct ID check
  if (clean === "grade-6") return "grade-6";
  if (clean === "grade-7") return "grade-7";
  if (clean === "grade-8") return "grade-8";
  if (clean === "grade-9") return "grade-9";
  if (clean === "grade-10") return "grade-10";

  // Italian school years use 1-3 for middle school and 1-2 for upper school.
  const italianYear = clean.match(/(?:^|[^\d])([1-3])\s*[ºª°a.]?\s*(media|superior(?:e|i)?)\b/i);
  if (italianYear) {
    const year = Number(italianYear[1]);
    if (italianYear[2] === "media" || year <= 2) {
      return `grade-${italianYear[2] === "media" ? year + 5 : year + 8}` as CanonicalCourseId;
    }
  }

  // 1º ESO / 1º Secundaria / Grade 7
  if (
    /1[ºª.]?\s*(eso|secundaria)/i.test(clean) ||
    /\b(grade\s*7|7th\s*grade|7[ºª]?\s*(grado|grade)?)\b/i.test(clean)
  ) {
    return "grade-7";
  }

  // 2º ESO / 2º Secundaria / Grade 8
  if (
    /2[ºª.]?\s*(eso|secundaria)/i.test(clean) ||
    /\b(grade\s*8|8th\s*grade|8[ºª]?\s*(grado|grade)?)\b/i.test(clean)
  ) {
    return "grade-8";
  }

  // 3º ESO / 3º Secundaria / Grade 9
  if (
    /3[ºª.]?\s*(eso|secundaria)/i.test(clean) ||
    /\b(grade\s*9|9th\s*grade|9[ºª]?\s*(grado|grade)?)\b/i.test(clean)
  ) {
    return "grade-9";
  }

  // 4º ESO / 4º Secundaria / Grade 10
  if (
    /4[ºª.]?\s*(eso|secundaria)/i.test(clean) ||
    /\b(grade\s*10|10th\s*grade|10[ºª]?\s*(grado|grade)?)\b/i.test(clean)
  ) {
    return "grade-10";
  }

  // 6º Primaria / Grade 6
  if (
    /6[ºª.]?\s*(primaria|grade|grado)?/i.test(clean) ||
    /\b(grade\s*6|6th\s*grade)\b/i.test(clean)
  ) {
    return "grade-6";
  }

  for (const c of CANONICAL_COURSES) {
    if (
      new RegExp(`\\b${c.grade}\\b`).test(clean) ||
      clean === c.id.toLowerCase() ||
      clean.includes(c.labels.es.toLowerCase()) ||
      clean.includes(c.labels.en.toLowerCase()) ||
      clean.includes(c.labels.it.toLowerCase())
    ) {
      return c.id as CanonicalCourseId;
    }
  }

  return "grade-6";
}

export function getCourseList(): readonly CurriculumCourseDef[] {
  return CANONICAL_COURSES;
}

export function getCourseById(courseId: string): CurriculumCourseDef | undefined {
  return CANONICAL_COURSES.find((c) => c.id === courseId);
}

export function formatCourseLabel(
  courseIdOrGrade?: string | number | null,
  locale: Locale = "es",
): string {
  if (courseIdOrGrade === null || courseIdOrGrade === undefined || courseIdOrGrade === "") {
    return "";
  }
  const raw = String(courseIdOrGrade).trim();
  const directMatch = CANONICAL_COURSES.find(
    (c) => c.id.toLowerCase() === raw.toLowerCase() || c.grade === Number(raw),
  );
  if (directMatch) {
    return directMatch.labels[locale] || directMatch.labels.es;
  }

  const clean = raw.toLowerCase();
  const isRecognizedPattern =
    /\b(eso|secundaria|primaria|primary|grade\s*[6-9]|grade\s*10|6th|7th|8th|9th|10th|[1-4][ºª.]?\s*(eso|secundaria)|6[ºª.]?\s*primaria)\b/i.test(
      clean,
    ) || /(?:^|[^\d])(?:[1-3]\s*[ºª°a.]?\s*media|[1-2]\s*[ºª°a.]?\s*superior(?:e|i)?)\b/i.test(clean);

  if (isRecognizedPattern) {
    const resolvedId = resolveCourseIdFromGrade(raw);
    const resolvedCourse = CANONICAL_COURSES.find((c) => c.id === resolvedId);
    if (resolvedCourse) {
      return resolvedCourse.labels[locale] || resolvedCourse.labels.es;
    }
  }

  return raw;
}

export function formatCourseOptionLabel(
  course: CurriculumCourseDef,
  locale: Locale = "es",
): string {
  const primary = course.labels[locale] || course.labels.es;
  const secondary = locale === "es" ? course.labels.en : course.labels.es;
  return `${primary} (${secondary})`;
}

export function relationId(relation: unknown): string {
  if (!relation) return "";
  if (typeof relation === "string") return relation.trim();
  if (typeof relation === "object" && relation !== null && "id" in relation) {
    return String((relation as { id: unknown }).id).trim();
  }
  return String(relation).trim();
}

export function getCoursesForDomain(
  domainId: string,
  courseDomains: readonly CurriculumCourseDomain[],
): string[] {
  const cleanId = domainId.trim();
  if (!cleanId) return [];
  const courses = new Set<string>();
  for (const cd of courseDomains) {
    if (relationId(cd.domain_id) === cleanId) {
      const cId = relationId(cd.course_id);
      if (cId) courses.add(cId);
    }
  }
  return Array.from(courses);
}

export function getDomainsForCourse(
  courseId: string,
  courseDomains: readonly CurriculumCourseDomain[],
): string[] {
  const cleanCourse = courseId.trim();
  if (!cleanCourse) return [];
  const domains = new Set<string>();
  for (const cd of courseDomains) {
    if (relationId(cd.course_id) === cleanCourse) {
      const dId = relationId(cd.domain_id);
      if (dId) domains.add(dId);
    }
  }
  return Array.from(domains);
}

export function domainBelongsToCourse(
  domainId: string,
  courseId: string,
  courseDomains: readonly CurriculumCourseDomain[],
): boolean {
  const cleanDomain = domainId.trim();
  const cleanCourse = courseId.trim();
  if (!cleanDomain || !cleanCourse) return false;
  return courseDomains.some(
    (cd) => relationId(cd.domain_id) === cleanDomain && relationId(cd.course_id) === cleanCourse,
  );
}

export function getCategoryForDomain(
  domainId: string,
  domains: readonly CurriculumDomain[],
): string | null {
  const cleanDomain = domainId.trim();
  if (!cleanDomain) return null;
  const match = domains.find((d) => d.id === cleanDomain || d.code === cleanDomain);
  if (!match) return null;
  return relationId(match.category_id) || null;
}

export function getCategoriesForCourse(
  courseId: string,
  catalog: {
    categories: readonly CurriculumCategory[];
    domains: readonly CurriculumDomain[];
    courseDomains: readonly CurriculumCourseDomain[];
  },
): CurriculumCategory[] {
  const cleanCourse = courseId.trim();
  if (!cleanCourse || cleanCourse === "all") return [...catalog.categories];

  const courseDomainIds = new Set(getDomainsForCourse(cleanCourse, catalog.courseDomains));
  const categoryIdsInCourse = new Set<string>();

  for (const d of catalog.domains) {
    if (courseDomainIds.has(d.id) || courseDomainIds.has(d.code)) {
      const catId = relationId(d.category_id);
      if (catId) categoryIdsInCourse.add(catId);
    }
  }

  return catalog.categories.filter((c) => categoryIdsInCourse.has(c.id) || categoryIdsInCourse.has(c.code));
}

export function getDomainsForCourseAndCategory(
  courseId: string,
  categoryId: string,
  catalog: {
    domains: readonly CurriculumDomain[];
    courseDomains: readonly CurriculumCourseDomain[];
  },
): CurriculumDomain[] {
  const cleanCourse = courseId.trim();
  const cleanCat = categoryId.trim();

  let candidateDomains = catalog.domains;

  if (cleanCat && cleanCat !== "all") {
    candidateDomains = candidateDomains.filter(
      (d) => relationId(d.category_id) === cleanCat || d.code.startsWith(cleanCat),
    );
  }

  if (cleanCourse && cleanCourse !== "all") {
    const courseDomainIds = new Set(getDomainsForCourse(cleanCourse, catalog.courseDomains));
    candidateDomains = candidateDomains.filter(
      (d) => courseDomainIds.has(d.id) || courseDomainIds.has(d.code),
    );
  }

  return [...candidateDomains];
}

export function formatCategoryName(
  category: CurriculumCategory | { id?: string; code?: string; name?: unknown } | string | undefined | null,
  locale: Locale = "es",
): string {
  if (!category) return "";
  if (typeof category === "string") {
    return locale === "it" ? ITALIAN_CATEGORY_NAMES[category] || category : category;
  }
  if (typeof category === "object" && category !== null) {
    const rawName = category.name;
    if (rawName && typeof rawName === "object") {
      const localized = (rawName as Record<string, string>)[locale];
      if (localized) return localized;
    }
    if (locale === "it") {
      const italianName = ITALIAN_CATEGORY_NAMES[category.code || category.id || ""];
      if (italianName) return italianName;
    }
    if (rawName && typeof rawName === "object") {
      const fallback = (rawName as Record<string, string>).es || (rawName as Record<string, string>).en;
      if (fallback) return fallback;
    }
    return category.code || category.id || "";
  }
  return "";
}

export function formatDomainName(
  domain: CurriculumDomain | { id?: string; code?: string; name?: unknown } | string | undefined | null,
  locale: Locale = "es",
): string {
  if (!domain) return "";

  if (typeof domain === "string") {
    if (locale === "it" && ITALIAN_DOMAIN_NAMES[domain]) return ITALIAN_DOMAIN_NAMES[domain];
    const fallback = DOMAIN_NAME_FALLBACKS[domain];
    if (fallback) return fallback[locale === "it" ? "es" : locale] || fallback.es;
    return domain;
  }

  if (typeof domain === "object" && domain !== null) {
    const domainId = domain.id || domain.code;
    const rawName = domain.name;
    if (rawName && typeof rawName === "object") {
      const localized = (rawName as Record<string, string>)[locale];
      if (localized) return localized;
    }
    if (locale === "it" && domainId && ITALIAN_DOMAIN_NAMES[domainId]) {
      return ITALIAN_DOMAIN_NAMES[domainId];
    }
    if (rawName && typeof rawName === "object") {
      const fallback = (rawName as Record<string, string>).es || (rawName as Record<string, string>).en;
      if (fallback) return fallback;
    }

    if (domainId && DOMAIN_NAME_FALLBACKS[domainId]) {
      return DOMAIN_NAME_FALLBACKS[domainId][locale === "it" ? "es" : locale] || DOMAIN_NAME_FALLBACKS[domainId].es;
    }

    if (domain.code) return domain.code;
    if (domain.id) return domain.id;
  }

  return "";
}

export function questionMatchesCourse(
  question: QuestionBankItem | { domain_id: unknown; cluster_id?: unknown; standard_id?: unknown },
  courseId: string,
  courseDomains: readonly CurriculumCourseDomain[],
): boolean {
  if (!courseId || courseId === "all") return true;
  const domainId = relationId(question.domain_id);
  if (!domainId) return false;
  return domainBelongsToCourse(domainId, courseId, courseDomains);
}
