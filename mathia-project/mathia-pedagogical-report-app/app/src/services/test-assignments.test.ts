import { describe, expect, it } from "vitest";
import { validateAssignmentInput } from "./test-assignments";

describe("test-assignments validation", () => {
  it("passes validation with valid class assignment", () => {
    const errors = validateAssignmentInput({
      test_version_id: "version-1",
      class_id: "class-1",
      student_id: null,
      available_from: "2026-09-01T08:00:00Z",
      due_at: "2026-09-10T18:00:00Z",
      max_attempts_override: 2,
    });
    expect(errors).toEqual([]);
  });

  it("passes validation with valid student assignment", () => {
    const errors = validateAssignmentInput({
      test_version_id: "version-1",
      class_id: null,
      student_id: "student-1",
    });
    expect(errors).toEqual([]);
  });

  it("fails if test_version_id is missing", () => {
    const errors = validateAssignmentInput({
      test_version_id: "",
      class_id: "class-1",
    });
    expect(errors).toContain("A published test version (test_version_id) is required.");
  });

  it("fails if both class_id and student_id are provided", () => {
    const errors = validateAssignmentInput({
      test_version_id: "version-1",
      class_id: "class-1",
      student_id: "student-1",
    });
    expect(errors).toContain(
      "Assignment must target either a class or a student, but not both or neither.",
    );
  });

  it("fails if neither class_id nor student_id is provided", () => {
    const errors = validateAssignmentInput({
      test_version_id: "version-1",
      class_id: null,
      student_id: null,
    });
    expect(errors).toContain(
      "Assignment must target either a class or a student, but not both or neither.",
    );
  });

  it("fails if due_at is before or equal to available_from", () => {
    const errors = validateAssignmentInput({
      test_version_id: "version-1",
      class_id: "class-1",
      available_from: "2026-09-10T12:00:00Z",
      due_at: "2026-09-05T12:00:00Z",
    });
    expect(errors).toContain("due_at must be strictly after available_from.");
  });

  it("fails if max_attempts_override is not positive", () => {
    const errors = validateAssignmentInput({
      test_version_id: "version-1",
      student_id: "student-1",
      max_attempts_override: 0,
    });
    expect(errors).toContain("max_attempts_override must be a positive integer.");
  });
});
