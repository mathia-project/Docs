import { describe, expect, it } from "vitest";
import type { ClassRecord, ClassStudent, StudentProfile } from "../services/schema";
import { getEnrollmentCandidates } from "./student-enrollment";

const student = (id: string, patch: Partial<StudentProfile> = {}) => ({
  id, school_id: "school-1", first_name: "Ana", last_name: id, active: true, ...patch,
}) as StudentProfile;
const classRecord = (id: string, patch: Partial<ClassRecord> = {}) => ({
  id, school_id: "school-1", academic_year: "2026-2027", active: true, ...patch,
}) as ClassRecord;
const enrollment = (studentId: string, classId: string, active = true) => ({
  id: `${studentId}-${classId}`, student_id: studentId, class_id: classId, active,
}) as ClassStudent;

describe("getEnrollmentCandidates", () => {
  const classes = [classRecord("a"), classRecord("b"), classRecord("old", { academic_year: "2025-2026" })];

  it("excludes active enrollments in this academic year, but permits prior years and withdrawn students", () => {
    const students = ["new", "same", "other", "past", "withdrawn"].map((id) => student(id));
    const assignments = [enrollment("same", "a"), enrollment("other", "b"), enrollment("past", "old"), enrollment("withdrawn", "a", false)];
    expect(getEnrollmentCandidates(students, classes, assignments, "a", true, "").map((item) => item.id))
      .toEqual(["new", "past", "withdrawn"]);
    expect(getEnrollmentCandidates(students, classes, assignments, "a", false, "").map((item) => item.id))
      .toEqual(["new", "other", "past", "withdrawn"]);
  });

  it("scopes students to the active destination school and handles expanded relations", () => {
    const students = [student("local"), student("foreign", { school_id: "school-2" }), student("inactive", { active: false })];
    expect(getEnrollmentCandidates(students, classes, [], "a", true, "").map((item) => item.id)).toEqual(["local"]);
    expect(getEnrollmentCandidates(students, [classRecord("a", { active: false })], [], "a", true, "")).toEqual([]);
    expect(getEnrollmentCandidates(students, classes, [{ ...enrollment("local", "a"), student_id: students[0]!, class_id: classes[0]! }], "a", true, "")).toEqual([]);
  });

  it("searches names without accents and student codes", () => {
    const students = [student("1", { first_name: "Ángela", last_name: "García", external_id: "STU-001" })];
    for (const query of ["angela garcia", "garcia angela", "stu-001"]) {
      expect(getEnrollmentCandidates(students, classes, [], "a", true, query)).toHaveLength(1);
    }
  });

  it("orders batch candidates by external code, with missing codes last", () => {
    const students = [
      student("name-first", { first_name: "Ada", last_name: "Zeta", external_id: "STU-010" }),
      student("name-second", { first_name: "Zoe", last_name: "Alpha", external_id: "STU-002" }),
      student("missing-code", { first_name: "Aaron", last_name: "Beta" }),
    ];
    expect(getEnrollmentCandidates(students, classes, [], "a", true, "").map((item) => item.id))
      .toEqual(["name-second", "name-first", "missing-code"]);
  });

  it("distributes 300 students into groups of 30 without selecting a student twice", () => {
    const students = Array.from({ length: 300 }, (_, index) => student(String(index).padStart(3, "0")));
    const destinations = Array.from({ length: 10 }, (_, index) => classRecord(`class-${index}`));
    const assignments: ClassStudent[] = [];
    for (const destination of destinations) {
      const batch = getEnrollmentCandidates(students, destinations, assignments, destination.id, true, "").slice(0, 30);
      expect(batch).toHaveLength(30);
      assignments.push(...batch.map((item) => enrollment(item.id, destination.id)));
    }
    expect(new Set(assignments.map((item) => item.student_id)).size).toBe(300);
    expect(getEnrollmentCandidates(students, destinations, assignments, "class-0", true, "")).toEqual([]);
  });
});
