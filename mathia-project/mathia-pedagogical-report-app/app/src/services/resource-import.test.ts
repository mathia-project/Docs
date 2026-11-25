import { describe, expect, it } from "vitest";
import type { CurriculumCatalog } from "./question-bank";
import { parseResourceImport } from "./resource-import";

const timestamps = { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

const mockCatalog: CurriculumCatalog = {
  categories: [
    { id: "A", code: "A", name: { en: "Algebra", es: "Álgebra" }, active: true, ...timestamps },
    { id: "G", code: "G", name: { en: "Geometry", es: "Geometría" }, active: true, ...timestamps },
  ],
  courses: [
    {
      id: "grade-6",
      grade_level: 6,
      name: { en: "Grade 6", es: "6º Primaria" },
      spanish_equivalent: null,
      italian_equivalent: null,
      pathway: {},
      source: {},
      active: true,
      ...timestamps,
    },
    {
      id: "grade-7",
      grade_level: 7,
      name: { en: "Grade 7", es: "1º ESO" },
      spanish_equivalent: null,
      italian_equivalent: null,
      pathway: {},
      source: {},
      active: true,
      ...timestamps,
    },
  ],
  domains: [
    {
      id: "6.EE",
      category_id: "A",
      code: "6.EE",
      name: { en: "Expressions & Equations", es: "Expresiones y Ecuaciones" },
      category_assignment: "project_crosswalk",
      source: {},
      active: true,
      ...timestamps,
    },
    {
      id: "6.G",
      category_id: "G",
      code: "6.G",
      name: { en: "Geometry", es: "Geometría" },
      category_assignment: "project_crosswalk",
      source: {},
      active: true,
      ...timestamps,
    },
  ],
  courseDomains: [
    { id: "cd-1", course_id: "grade-6", domain_id: "6.EE", ...timestamps },
    { id: "cd-2", course_id: "grade-6", domain_id: "6.G", ...timestamps },
  ],
  clusters: [
    {
      id: "6.EE.A",
      domain_id: "6.EE",
      code: "6.EE.A",
      name: { en: "Apply and extend", es: "Aplicar y extender" },
      source: {},
      active: true,
      ...timestamps,
    },
  ],
  standards: [
    {
      id: "6.EE.A.1",
      cluster_id: "6.EE.A",
      code: "6.EE.1",
      ccss_id: "CCSS.MATH.CONTENT.6.EE.A.1",
      description: { en: "Write expressions", es: "Escribir expresiones" },
      markers: {},
      source: {},
      notes: [],
      active: true,
      ...timestamps,
    },
  ],
  substandards: [],
  aliases: [
    {
      alias: "6.EE.1",
      item_kind: "standard",
      standard_id: "6.EE.A.1",
      substandard_id: null,
      ...timestamps,
    },
  ],
};

const CSV_HEADER =
  "title,description,resource_type,status,language,course_id,category_id,domain_id,cluster_id,standard_id,target_level,url,body,metadata";

describe("resource-import parser and validation", () => {
  it("parses valid CSV with a single resource", () => {
    const csv = [
      CSV_HEADER,
      '"Guía de expresiones","Material introductorio","document","draft","es","grade-6","A","6.EE","6.EE.A","6.EE.1","reinforcement","","# Expresiones algebraicas","{""estimated_minutes"":20}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result).toHaveLength(1);
    expect(result[0]!.errors).toEqual([]);
    expect(result[0]!.input).toMatchObject({
      title: "Guía de expresiones",
      description: "Material introductorio",
      resource_type: "document",
      status: "draft",
      language: "es",
      course_id: "grade-6",
      category_id: "A",
      domain_id: "6.EE",
      cluster_id: "6.EE.A",
      standard_id: "6.EE.A.1",
      target_level: "reinforcement",
      url: null,
      body: "# Expresiones algebraicas",
      metadata: { estimated_minutes: 20 },
      published_at: null,
    });
  });

  it("parses valid CSV with multiple resources", () => {
    const csv = [
      CSV_HEADER,
      '"Recurso 1","Desc 1","document","draft","es","grade-6","A","6.EE","","","reinforcement","","# Doc 1","{}"',
      '"Recurso 2","Desc 2","video","published","es","grade-6","A","6.EE","","","practice","https://example.com/v2","","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result).toHaveLength(2);
    expect(result[0]!.errors).toEqual([]);
    expect(result[0]!.input?.title).toBe("Recurso 1");
    expect(result[1]!.errors).toEqual([]);
    expect(result[1]!.input?.title).toBe("Recurso 2");
    expect(result[1]!.input?.status).toBe("published");
    expect(result[1]!.input?.published_at).toBeTruthy();
  });

  it("parses valid AI JSON", () => {
    const json = JSON.stringify({
      schema_version: "1.0",
      resources: [
        {
          title: "Guía de expresiones algebraicas",
          description: "Material introductorio",
          resource_type: "document",
          status: "draft",
          language: "es",
          course_id: "grade-6",
          category_id: "A",
          domain_id: "6.EE",
          cluster_id: null,
          standard_id: null,
          target_level: "reinforcement",
          url: null,
          body: "# Expresiones algebraicas",
          metadata: {
            estimated_minutes: 20,
            tags: ["álgebra"],
          },
        },
      ],
    });

    const result = parseResourceImport(json, "ai_json", mockCatalog);
    expect(result).toHaveLength(1);
    expect(result[0]!.errors).toEqual([]);
    expect(result[0]!.input?.title).toBe("Guía de expresiones algebraicas");
    expect(result[0]!.input?.metadata).toEqual({
      estimated_minutes: 20,
      tags: ["álgebra"],
    });
  });

  it("handles UTF-8 BOM and CRLF line breaks properly", () => {
    const csvWithBomAndCrlf =
      "\uFEFF" +
      [
        CSV_HEADER,
        '"Guía con BOM","Desc","document","draft","es","grade-6","A","6.EE","","","practice","","# Contenido","{}"',
      ].join("\r\n");

    const result = parseResourceImport(csvWithBomAndCrlf, "csv", mockCatalog);
    expect(result).toHaveLength(1);
    expect(result[0]!.errors).toEqual([]);
    expect(result[0]!.input?.title).toBe("Guía con BOM");
  });

  it("stores generation provenance and structured exercise content in metadata", () => {
    const json = JSON.stringify({
      schema_version: "1.0",
      resources: [
        {
          external_id: "exercise-001",
          title: "Práctica distributiva",
          resource_type: "exercise",
          status: "draft",
          language: "es",
          course_id: "grade-6",
          category_id: "A",
          domain_id: "6.EE",
          target_level: "practice",
          body: "# Práctica",
          generation: {
            mode: "generated",
            prompt: "Crea tres ejercicios graduados.",
            model: "test-model"
          },
          exercise: {
            format: "guided_practice",
            instructions: "Resuelve los ejercicios.",
            items: [
              {
                id: "item-1",
                prompt: "3(2x + 4)",
                answer: "6x + 12",
                solution: "Distribuye el 3 en ambos términos."
              }
            ]
          }
        }
      ]
    });

    const result = parseResourceImport(json, "ai_json", mockCatalog);
    expect(result[0]!.errors).toEqual([]);
    expect(result[0]!.input?.metadata).toMatchObject({
      external_id: "exercise-001",
      generation: { mode: "generated", model: "test-model" },
      exercise: { format: "guided_practice" }
    });
  });

  it("requires search provenance for web-discovered videos", () => {
    const json = JSON.stringify({
      schema_version: "1.0",
      resources: [
        {
          title: "Video sin trazabilidad",
          resource_type: "video",
          language: "es",
          target_level: "practice",
          url: "https://example.com/video",
          generation: { mode: "web_search" }
        }
      ]
    });

    const result = parseResourceImport(json, "ai_json", mockCatalog);
    expect(result[0]!.errors).toContain("generation.search");
  });

  it("handles commas and escaped quotes inside CSV fields", () => {
    const csv = [
      CSV_HEADER,
      '"Operaciones: suma, resta y multiplicación","Contiene ""comillas"" y comas, etc.","document","draft","es","grade-6","A","6.EE","","","reinforcement","","# Markdown con, comas y ""citas""","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result).toHaveLength(1);
    expect(result[0]!.errors).toEqual([]);
    expect(result[0]!.input?.title).toBe("Operaciones: suma, resta y multiplicación");
    expect(result[0]!.input?.description).toBe('Contiene "comillas" y comas, etc.');
    expect(result[0]!.input?.body).toBe('# Markdown con, comas y "citas"');
  });

  it("detects empty or whitespace-only title", () => {
    const csv = [
      CSV_HEADER,
      '"   ","Desc","document","draft","es","grade-6","A","6.EE","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("title");
    expect(result[0]!.input).toBeNull();
  });

  it("detects invalid resource_type", () => {
    const csv = [
      CSV_HEADER,
      '"Título","Desc","interactive_game","draft","es","grade-6","A","6.EE","","","practice","https://example.com","","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("resource_type");
    expect(result[0]!.input).toBeNull();
  });

  it("detects invalid status", () => {
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","invalid_status","es","grade-6","A","6.EE","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("status");
  });

  it("detects invalid target_level", () => {
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-6","A","6.EE","","","expert","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("target_level");
  });

  it("detects invalid metadata (malformed JSON string in CSV)", () => {
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-6","A","6.EE","","","practice","","# Body","{malformed_json}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("metadata");
  });

  it("detects metadata that is an array", () => {
    const json = JSON.stringify({
      schema_version: "1.0",
      resources: [
        {
          title: "Título con array metadata",
          resource_type: "document",
          target_level: "practice",
          body: "Contenido",
          metadata: ["tag1", "tag2"],
        },
      ],
    });

    const result = parseResourceImport(json, "ai_json", mockCatalog);
    expect(result[0]!.errors).toContain("metadata");
  });

  it("detects invalid URL protocol", () => {
    const csv = [
      CSV_HEADER,
      '"Vídeo","Desc","video","draft","es","grade-6","A","6.EE","","","practice","ftp://example.com/video.mp4","","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("url");
  });

  it("detects video resource without URL", () => {
    const csv = [
      CSV_HEADER,
      '"Vídeo sin URL","Desc","video","draft","es","grade-6","A","6.EE","","","practice","","","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("url");
  });

  it("detects document resource without body or URL", () => {
    const csv = [
      CSV_HEADER,
      '"Doc vacío","Desc","document","draft","es","grade-6","A","6.EE","","","practice","","","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("body");
  });

  it("detects nonexistent course_id", () => {
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","nonexistent-course","A","6.EE","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("course_id");
  });

  it("detects nonexistent domain_id", () => {
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-6","A","UNKNOWN.DOMAIN","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("domain_id");
  });

  it("detects domain that does not belong to category", () => {
    // 6.EE belongs to category A, but G is specified
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-6","G","6.EE","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("domain_parent");
  });

  it("detects domain not available in the course", () => {
    // grade-7 has no courseDomains in mockCatalog
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-7","A","6.EE","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("domain_course");
  });

  it("detects cluster that does not belong to domain", () => {
    // 6.EE.A belongs to 6.EE, but 6.G is specified as domain
    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-6","G","6.G","6.EE.A","","","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", mockCatalog);
    expect(result[0]!.errors).toContain("cluster_parent");
  });

  it("detects standard that does not belong to cluster", () => {
    // Standard 6.EE.A.1 belongs to cluster 6.EE.A
    const alteredCatalog: CurriculumCatalog = {
      ...mockCatalog,
      clusters: [
        ...mockCatalog.clusters,
        {
          id: "6.G.A",
          domain_id: "6.G",
          code: "6.G.A",
          name: { en: "Area", es: "Área" },
          source: {},
          active: true,
          ...timestamps,
        },
      ],
    };

    const csv = [
      CSV_HEADER,
      '"Título","Desc","document","draft","es","grade-6","G","6.G","6.G.A","6.EE.A.1","practice","","# Body","{}"',
    ].join("\n");

    const result = parseResourceImport(csv, "csv", alteredCatalog);
    expect(result[0]!.errors).toContain("standard_parent");
  });

  it("rejects unsupported schema_version in AI JSON", () => {
    const json = JSON.stringify({
      schema_version: "2.0",
      resources: [],
    });

    expect(() => parseResourceImport(json, "ai_json", mockCatalog)).toThrow("schema_version");
  });

  it("ensures no input is generated when a row has validation errors", () => {
    const csv = [
      CSV_HEADER,
      '"","Desc","document","draft","es","grade-6","A","6.EE","","","practice","","# Body","{}"',
    ].join("\n");

    const [row] = parseResourceImport(csv, "csv", mockCatalog);
    expect(row?.errors.length).toBeGreaterThan(0);
    expect(row?.input).toBeNull();
  });
});
