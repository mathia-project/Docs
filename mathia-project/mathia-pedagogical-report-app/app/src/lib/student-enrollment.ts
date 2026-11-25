import type { ClassRecord, ClassStudent, StudentProfile } from "../services/schema";

const relationId = (value: string | { id: string }) => typeof value === "string" ? value : value.id;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function getEnrollmentCandidates(
  students: StudentProfile[],
  classes: ClassRecord[],
  assignments: ClassStudent[],
  classId: string,
  unassignedOnly: boolean,
  search: string,
): StudentProfile[] {
  const target = classes.find((item) => item.id === classId && item.active);
  if (!target) return [];
  const yearClassIds = new Set(classes.filter((item) =>
    item.academic_year === target.academic_year && relationId(item.school_id) === relationId(target.school_id),
  ).map((item) => item.id));
  const excluded = new Set(assignments.filter((item) => item.active && (
    relationId(item.class_id) === classId || (unassignedOnly && yearClassIds.has(relationId(item.class_id)))
  )).map((item) => relationId(item.student_id)));
  const query = normalize(search.trim());
  return students.filter((student) => student.active &&
    relationId(student.school_id) === relationId(target.school_id) &&
    !excluded.has(student.id) &&
    normalize(`${student.last_name} ${student.first_name} ${student.first_name} ${student.last_name} ${student.external_id ?? ""}`).includes(query),
  ).sort((a, b) => {
    // Batch selection must be deterministic and follow the institution's
    // external/student code, not the student's display name.
    if (!a.external_id && b.external_id) return 1;
    if (a.external_id && !b.external_id) return -1;
    const externalIdOrder = (a.external_id ?? "").localeCompare(b.external_id ?? "", undefined, { numeric: true, sensitivity: "base" });
    if (externalIdOrder !== 0) return externalIdOrder;
    return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || a.id.localeCompare(b.id);
  });
}
