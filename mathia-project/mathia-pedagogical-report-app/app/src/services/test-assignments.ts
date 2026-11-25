import {
  createItem,
  readItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directus } from "./directus";
import type {
  IsoDateTime,
  TestAssignment,
  TestVersion,
} from "./schema";

export interface CreateAssignmentInput {
  test_version_id: string;
  test_id?: string;
  class_id?: string | null;
  student_id?: string | null;
  assigned_by_teacher_id?: string | null;
  available_from?: IsoDateTime | null;
  due_at?: IsoDateTime | null;
  max_attempts_override?: number | null;
  enabled?: boolean;
}

export interface UpdateAssignmentInput {
  test_version_id?: string;
  available_from?: IsoDateTime | null;
  due_at?: IsoDateTime | null;
  max_attempts_override?: number | null;
  enabled?: boolean;
}

export interface AssignmentFilter {
  class_id?: string;
  student_id?: string;
  test_id?: string;
  test_version_id?: string;
  enabled?: boolean;
}

export function validateAssignmentInput(input: CreateAssignmentInput): string[] {
  const errors: string[] = [];

  if (!input.test_version_id) {
    errors.push("A published test version (test_version_id) is required.");
  }

  const hasClass = Boolean(input.class_id);
  const hasStudent = Boolean(input.student_id);

  if ((hasClass && hasStudent) || (!hasClass && !hasStudent)) {
    errors.push("Assignment must target either a class or a student, but not both or neither.");
  }

  if (input.available_from && input.due_at) {
    const available = new Date(input.available_from).getTime();
    const due = new Date(input.due_at).getTime();
    if (due <= available) {
      errors.push("due_at must be strictly after available_from.");
    }
  }

  if (
    input.max_attempts_override !== undefined &&
    input.max_attempts_override !== null &&
    input.max_attempts_override <= 0
  ) {
    errors.push("max_attempts_override must be a positive integer.");
  }

  return errors;
}

export const testAssignmentService = {
  async getAssignableStudents() {
    return directus.request(
      readItems("student_profiles", {
        fields: ["id", "first_name", "last_name", "external_id"],
        filter: { active: { _eq: true } },
        sort: ["last_name", "first_name"],
        limit: -1,
      }),
    );
  },

  async getAssignments(filter?: AssignmentFilter): Promise<TestAssignment[]> {
    const directusFilter: Record<string, unknown> = {};

    if (filter?.class_id) {
      directusFilter.class_id = { _eq: filter.class_id };
    }
    if (filter?.student_id) {
      directusFilter.student_id = { _eq: filter.student_id };
    }
    if (filter?.test_id) {
      directusFilter.test_id = { _eq: filter.test_id };
    }
    if (filter?.test_version_id) {
      directusFilter.test_version_id = { _eq: filter.test_version_id };
    }
    if (filter?.enabled !== undefined) {
      directusFilter.enabled = { _eq: filter.enabled };
    }

    return (await directus.request(
      readItems("test_assignments", {
        filter: Object.keys(directusFilter).length > 0 ? directusFilter : undefined,
        sort: ["-created_at"],
        fields: ["*", "class_id.*", "test_id.*", "test_version_id.*"] as any,
        limit: -1,
      }),
    )) as unknown as TestAssignment[];
  },

  async getAssignment(id: string): Promise<TestAssignment | null> {
    try {
      return (await directus.request(
        readItem("test_assignments", id, {
          fields: ["*", "class_id.*", "test_id.*", "test_version_id.*"] as any,
        }),
      )) as unknown as TestAssignment;
    } catch {
      return null;
    }
  },

  async createAssignment(input: CreateAssignmentInput): Promise<TestAssignment> {
    const errors = validateAssignmentInput(input);
    if (errors.length > 0) {
      throw new Error(`Invalid assignment payload:\n- ${errors.join("\n- ")}`);
    }

    // Resolve parent test_id from the version if not provided
    let testId = input.test_id;
    if (!testId) {
      const version = (await directus.request(
        readItem("test_versions", input.test_version_id),
      )) as TestVersion;
      if (!version) {
        throw new Error(`Test version ${input.test_version_id} not found.`);
      }
      if (version.status !== "published") {
        throw new Error(`Cannot assign test version ${input.test_version_id} because its status is '${version.status}', not 'published'.`);
      }
      testId = typeof version.test_id === "object" ? version.test_id.id : version.test_id;
    }

    return (await directus.request(
      createItem("test_assignments", {
        test_id: testId,
        test_version_id: input.test_version_id,
        class_id: input.class_id ?? null,
        student_id: input.student_id ?? null,
        assigned_by_teacher_id: input.assigned_by_teacher_id ?? null,
        available_from: input.available_from ?? null,
        due_at: input.due_at ?? null,
        max_attempts_override: input.max_attempts_override ?? null,
        enabled: input.enabled ?? true,
      }),
    )) as TestAssignment;
  },

  async updateAssignment(id: string, input: UpdateAssignmentInput): Promise<TestAssignment> {
    const patch: Record<string, unknown> = {};

    if (input.test_version_id !== undefined) {
      patch.test_version_id = input.test_version_id;
    }
    if (input.available_from !== undefined) {
      patch.available_from = input.available_from;
    }
    if (input.due_at !== undefined) {
      patch.due_at = input.due_at;
    }
    if (input.max_attempts_override !== undefined) {
      patch.max_attempts_override = input.max_attempts_override;
    }
    if (input.enabled !== undefined) {
      patch.enabled = input.enabled;
    }

    return (await directus.request(updateItem("test_assignments", id, patch))) as TestAssignment;
  },

  async toggleAssignmentEnabled(id: string, enabled: boolean): Promise<TestAssignment> {
    return (await directus.request(
      updateItem("test_assignments", id, { enabled }),
    )) as TestAssignment;
  },
};
