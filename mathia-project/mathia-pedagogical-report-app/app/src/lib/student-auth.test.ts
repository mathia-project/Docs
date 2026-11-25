import { describe, expect, it } from "vitest";
import { buildStudentSyntheticEmail, isSyntheticStudentEmail } from "./student-auth";

describe("student-auth utilities", () => {
  describe("buildStudentSyntheticEmail", () => {
    it("generates lowercase RFC compliant email from school code and student ID", () => {
      const email = buildStudentSyntheticEmail("MATH001", "ALU-102");
      expect(email).toBe("math001.alu-102@student.mathia.school");
    });

    it("sanitizes spaces and special characters", () => {
      const email = buildStudentSyntheticEmail("  MATH 001  ", "cod_123!");
      expect(email).toBe("math001.cod_123@student.mathia.school");
    });

    it("throws error if school code or student code is empty", () => {
      expect(() => buildStudentSyntheticEmail("", "123")).toThrow();
      expect(() => buildStudentSyntheticEmail("SCH", "")).toThrow();
    });
  });

  describe("isSyntheticStudentEmail", () => {
    it("returns true for student.mathia.school emails", () => {
      expect(isSyntheticStudentEmail("math001.alu-102@student.mathia.school")).toBe(true);
      expect(isSyntheticStudentEmail("MATH001.ALU-102@STUDENT.MATHIA.SCHOOL")).toBe(true);
    });

    it("returns false for regular emails or undefined", () => {
      expect(isSyntheticStudentEmail("student@example.com")).toBe(false);
      expect(isSyntheticStudentEmail(null)).toBe(false);
      expect(isSyntheticStudentEmail(undefined)).toBe(false);
    });
  });
});

