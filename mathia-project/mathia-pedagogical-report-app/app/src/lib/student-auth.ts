const STUDENT_SYNTHETIC_DOMAIN = "student.mathia.school";

/**
 * Builds a deterministic, RFC-compliant synthetic email for a student using their
 * school code and student ID. This allows Directus to manage authentication
 * credentials securely without requiring the student to own a real email address.
 */
export function buildStudentSyntheticEmail(schoolCode: string, studentCode: string): string {
  const cleanSchool = schoolCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanStudent = studentCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

  if (!cleanSchool) {
    throw new Error("School code is required to build student credentials");
  }
  if (!cleanStudent) {
    throw new Error("Student code is required to build student credentials");
  }

  return `${cleanSchool}.${cleanStudent}@${STUDENT_SYNTHETIC_DOMAIN}`;
}

/**
 * Checks whether an email address is a synthetic student identifier.
 */
export function isSyntheticStudentEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${STUDENT_SYNTHETIC_DOMAIN}`);
}

