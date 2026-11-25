import {
  createItem,
  createItems,
  createUser,
  deleteUser,
  readItem,
  readItems,
  readRoles,
  updateItem,
  updateItems,
  updateUser,
} from "@directus/sdk";
import { buildStudentSyntheticEmail } from "../lib/student-auth";
import { directus } from "./directus";
import type {
  ClassRecord,
  ClassStudent,
  ClassTeacher,
  EducationalSystem,
  School,
  StudentProfile,
  StudentSex,
  TeacherProfile,
} from "./schema";

export interface CreateClassInput {
  name: string;
  code: string;
  academic_year: string;
  grade_level?: string | null | undefined;
  starts_on?: string | null | undefined;
  ends_on?: string | null | undefined;
  active?: boolean | undefined;
}

export type StudentAccessMode = "none" | "email" | "pin";

export interface CreateStudentInput {
  first_name: string;
  last_name: string;
  preferred_name?: string | null | undefined;
  email?: string | null | undefined;
  external_id?: string | null | undefined;
  date_of_birth?: string | null | undefined;
  preferred_language?: string | undefined;
  sex?: StudentSex | null | undefined;
  has_diagnosis?: boolean | undefined;
  needs_evaluation?: boolean | undefined;
  diagnosis_notes?: string | null | undefined;
  active?: boolean | undefined;
  access_mode?: StudentAccessMode | undefined;
  password?: string | undefined;
  pin?: string | undefined;
}

export interface UpdateStudentInput extends Partial<CreateStudentInput> {
  reset_password?: string | undefined;
  reset_pin?: string | undefined;
}

export interface CreateTeacherInput {
  first_name: string;
  last_name: string;
  email?: string | null | undefined;
  employee_id?: string | null | undefined;
  preferred_language?: string | undefined;
  password?: string | undefined;
  active?: boolean | undefined;
}

export interface AssignStudentInput {
  class_id: string;
  student_id: string;
  enrolled_on?: string | undefined;
}

export interface AssignStudentsInput {
  class_id: string;
  student_ids: string[];
  enrolled_on: string;
}

export interface AssignTeacherInput {
  class_id: string;
  teacher_id: string;
  assigned_on?: string | undefined;
}

export interface DirectorMetrics {
  classesCount: number;
  studentsCount: number;
  teachersCount: number;
}

export interface ParsedCsvStudent {
  first_name: string;
  last_name: string;
  email?: string | undefined;
  external_id?: string | undefined;
  date_of_birth?: string | undefined;
  preferred_language?: string | undefined;
  sex?: StudentSex | undefined;
  password?: string | undefined;
  pin?: string | undefined;
  isValid: boolean;
  error?: string | undefined;
}

/**
 * Parse CSV text for students import
 */
export function parseStudentCsv(csvText: string): ParsedCsvStudent[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const firstLine = lines[0];
  if (!firstLine) return [];

  const headerLine = firstLine.toLowerCase();
  const headers = headerLine.split(/[,;\t]/).map((h) => h.trim().replace(/^["']|["']$/g, ""));

  const results: ParsedCsvStudent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!currentLine) continue;

    const row = currentLine.split(/[,;\t]/).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const data: Record<string, string> = {};
    headers.forEach((h, idx) => {
      data[h] = row[idx] ?? "";
    });

    const firstName =
      data.first_name || data.firstname || data.nombre || data["first name"] || "";
    const lastName =
      data.last_name || data.lastname || data.apellidos || data["last name"] || "";
    const email = data.email || data.correo || data["e-mail"] || undefined;
    const externalId =
      data.external_id || data.externalid || data.codigo || data["student id"] || data.id || undefined;
    const dob = data.date_of_birth || data.dob || data.fecha_nacimiento || undefined;
    const lang = data.preferred_language || data.language || data.idioma || "en";
    const password = data.password || data["contraseña"] || data.contrasena || undefined;
    const pin = data.pin || (!password && data.clave ? data.clave : undefined);

    const rawSex =
      data.sex ||
      data.gender ||
      data.sexo ||
      data["sexo(m=1)"] ||
      data["sex(m=1)"] ||
      data.genero ||
      "";
    let sex: StudentSex | undefined = undefined;
    let sexError: string | undefined = undefined;
    if (rawSex && rawSex.trim() !== "") {
      const s = rawSex.trim().toLowerCase();
      if (
        s === "1" ||
        s === "1.0" ||
        s === "m" ||
        s === "male" ||
        s === "masculino" ||
        s === "hombre" ||
        s === "varon" ||
        s === "varón" ||
        s === "v" ||
        s === "h"
      ) {
        sex = "male";
      } else if (
        s === "0" ||
        s === "0.0" ||
        s === "f" ||
        s === "female" ||
        s === "femenino" ||
        s === "mujer" ||
        s === "hembra"
      ) {
        sex = "female";
      } else if (s === "other" || s === "otro" || s === "nb" || s === "non-binary") {
        sex = "other";
      } else {
        sexError = `Invalid sex value: "${rawSex.trim()}"`;
      }
    }

    const hasNames = firstName.trim().length > 0 && lastName.trim().length > 0;
    const isValid = hasNames && !sexError;
    const error = !hasNames
      ? "First name and last name are required"
      : sexError;

    results.push({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email ? email.trim() : undefined,
      external_id: externalId ? externalId.trim() : undefined,
      date_of_birth: dob ? dob.trim() : undefined,
      preferred_language: lang.trim() || "en",
      sex,
      password: password ? password.trim() : undefined,
      pin: pin ? pin.trim() : undefined,
      isValid,
      error,
    });
  }

  return results;
}

/**
 * Director service encapsulating all Directus operations
 */
const VALID_EDUCATIONAL_SYSTEMS: readonly EducationalSystem[] = ["ES", "IT"];

export const directorService = {
  async getActiveSchool(): Promise<School | null> {
    const schools = (await directus.request(
      readItems("schools", {
        filter: { active: { _eq: true } },
        limit: 1,
      }),
    )) as School[];
    return schools[0] || null;
  },

  async updateSchool(id: string, patch: Partial<School>): Promise<School> {
    if (
      patch.educational_system !== undefined &&
      !VALID_EDUCATIONAL_SYSTEMS.includes(patch.educational_system)
    ) {
      throw new Error(
        `Invalid educational system: "${patch.educational_system}". Permitted values are 'ES' and 'IT'.`,
      );
    }
    return (await directus.request(updateItem("schools", id, patch))) as School;
  },

  async getMetrics(): Promise<DirectorMetrics> {
    try {
      const [classes, students, teachers] = await Promise.all([
        directus.request(readItems("classes", { fields: ["id", "active"], limit: -1 })),
        directus.request(readItems("student_profiles", { fields: ["id", "active"], limit: -1 })),
        directus.request(readItems("teacher_profiles", { fields: ["id", "active"], limit: -1 })),
      ]);

      const classList = (classes || []) as Array<{ id: string; active?: boolean }>;
      const studentList = (students || []) as Array<{ id: string; active?: boolean }>;
      const teacherList = (teachers || []) as Array<{ id: string; active?: boolean }>;

      return {
        classesCount: classList.filter((c) => c.active !== false).length,
        studentsCount: studentList.filter((s) => s.active !== false).length,
        teachersCount: teacherList.filter((t) => t.active !== false).length,
      };
    } catch {
      return { classesCount: 0, studentsCount: 0, teachersCount: 0 };
    }
  },

  async getClasses(): Promise<ClassRecord[]> {
    return (await directus.request(
      readItems("classes", {
        sort: ["-created_at"],
        limit: -1,
      }),
    )) as ClassRecord[];
  },

  async getClass(id: string): Promise<ClassRecord | null> {
    const items = (await directus.request(
      readItems("classes", {
        filter: { id: { _eq: id } },
        limit: 1,
      }),
    )) as ClassRecord[];
    return items[0] || null;
  },

  async createClass(input: CreateClassInput): Promise<ClassRecord> {
    const school = await this.getActiveSchool();
    if (!school) throw new Error("No active school found for current director");

    const payload: Partial<ClassRecord> = {
      name: input.name,
      code: input.code,
      academic_year: input.academic_year,
      school_id: school.id,
      active: input.active ?? true,
    };
    if (input.grade_level !== undefined) payload.grade_level = input.grade_level;
    if (input.starts_on !== undefined) payload.starts_on = input.starts_on;
    if (input.ends_on !== undefined) payload.ends_on = input.ends_on;

    return (await directus.request(createItem("classes", payload))) as ClassRecord;
  },

  async updateClass(id: string, patch: Partial<CreateClassInput>): Promise<ClassRecord> {
    const payload: Partial<ClassRecord> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.code !== undefined) payload.code = patch.code;
    if (patch.academic_year !== undefined) payload.academic_year = patch.academic_year;
    if (patch.grade_level !== undefined) payload.grade_level = patch.grade_level;
    if (patch.starts_on !== undefined) payload.starts_on = patch.starts_on;
    if (patch.ends_on !== undefined) payload.ends_on = patch.ends_on;
    if (patch.active !== undefined) payload.active = patch.active;

    return (await directus.request(updateItem("classes", id, payload))) as ClassRecord;
  },

  async getStudents(): Promise<StudentProfile[]> {
    return (await directus.request(
      readItems("student_profiles", {
        sort: ["last_name", "first_name"],
        limit: -1,
      }),
    )) as StudentProfile[];
  },

  async createStudent(input: CreateStudentInput): Promise<StudentProfile> {
    if (input.sex !== undefined && input.sex !== null && (input.sex as any) !== "") {
      if (input.sex !== "male" && input.sex !== "female" && input.sex !== "other") {
        throw new Error(
          `Invalid student sex: "${input.sex}". Permitted values are 'male', 'female', 'other', or null.`,
        );
      }
    }

    const school = await this.getActiveSchool();
    if (!school) throw new Error("No active school found for current director");

    let directusUserId: string | null = null;
    let authUserCreated = false;

    const accessMode =
      input.access_mode ??
      (input.pin ? "pin" : input.email && input.password ? "email" : "none");

    if (accessMode === "email") {
      if (!input.email?.trim()) {
        throw new Error("A student email is required for email access");
      }
      if (!input.password || input.password.length < 6) {
        throw new Error("The initial password must contain at least 6 characters");
      }
      const roles = await directus.request(
        readRoles({
          filter: { name: { _eq: "Student" } },
          fields: ["id", "name"],
          limit: 1,
        }),
      );
      const studentRole = roles[0];
      if (!studentRole) throw new Error("The Student role is not configured in Directus");

      const email = input.email.trim().toLowerCase();
      const user = await directus.request(
        createUser({
          email,
          password: input.password,
          first_name: input.first_name,
          last_name: input.last_name,
          role: studentRole.id,
          status: "active",
        }),
      );
      directusUserId = user.id;
      authUserCreated = true;
    } else if (accessMode === "pin") {
      if (!input.external_id?.trim()) {
        throw new Error("A student code / ID is required for PIN access");
      }
      if (!input.pin || input.pin.trim().length < 4) {
        throw new Error("The PIN must contain at least 4 digits");
      }
      const roles = await directus.request(
        readRoles({
          filter: { name: { _eq: "Student" } },
          fields: ["id", "name"],
          limit: 1,
        }),
      );
      const studentRole = roles[0];
      if (!studentRole) throw new Error("The Student role is not configured in Directus");

      const syntheticEmail = buildStudentSyntheticEmail(school.code, input.external_id);
      const user = await directus.request(
        createUser({
          email: syntheticEmail,
          password: input.pin.trim(),
          first_name: input.first_name,
          last_name: input.last_name,
          role: studentRole.id,
          status: "active",
        }),
      );
      directusUserId = user.id;
      authUserCreated = true;
    }

    const payload: Partial<StudentProfile> = {
      first_name: input.first_name,
      last_name: input.last_name,
      school_id: school.id,
      preferred_language: input.preferred_language || "en",
      active: input.active ?? true,
      has_diagnosis: input.has_diagnosis ?? false,
      needs_evaluation: input.has_diagnosis ? false : (input.needs_evaluation ?? false),
      diagnosis_notes: input.diagnosis_notes || null,
    };
    if (directusUserId) payload.directus_user_id = directusUserId;
    if (input.preferred_name !== undefined) payload.preferred_name = input.preferred_name;
    if (input.email !== undefined) payload.email = input.email;
    if (input.external_id !== undefined) payload.external_id = input.external_id;
    if (input.date_of_birth !== undefined) payload.date_of_birth = input.date_of_birth;
    if (input.sex !== undefined) payload.sex = input.sex || null;

    try {
      return (await directus.request(createItem("student_profiles", payload))) as StudentProfile;
    } catch (profileErr) {
      if (authUserCreated && directusUserId) {
        try {
          await directus.request(deleteUser(directusUserId));
        } catch {
          // Ignore deletion error to preserve original failure
        }
      }
      throw profileErr;
    }
  },

  async updateStudent(id: string, patch: UpdateStudentInput): Promise<StudentProfile> {
    if (patch.sex !== undefined && patch.sex !== null && (patch.sex as any) !== "") {
      if (patch.sex !== "male" && patch.sex !== "female" && patch.sex !== "other") {
        throw new Error(
          `Invalid student sex: "${patch.sex}". Permitted values are 'male', 'female', 'other', or null.`,
        );
      }
    }

    const current = (await directus.request(readItem("student_profiles", id))) as StudentProfile;
    if (!current) throw new Error("Student profile not found");

    let directusUserId =
      typeof current.directus_user_id === "object" && current.directus_user_id !== null
        ? current.directus_user_id.id
        : (current.directus_user_id as string | null);

    let authUserCreated = false;

    // Case 1: Student currently has NO account, but director wants to assign one
    if (!directusUserId && (patch.access_mode === "pin" || patch.access_mode === "email")) {
      const school = await this.getActiveSchool();
      if (!school) throw new Error("No active school found for current director");

      const roles = await directus.request(
        readRoles({
          filter: { name: { _eq: "Student" } },
          fields: ["id", "name"],
          limit: 1,
        }),
      );
      const studentRole = roles[0];
      if (!studentRole) throw new Error("The Student role is not configured in Directus");

      const firstName = patch.first_name ?? current.first_name;
      const lastName = patch.last_name ?? current.last_name;

      if (patch.access_mode === "pin") {
        const externalId = (patch.external_id ?? current.external_id ?? "").trim();
        if (!externalId) {
          throw new Error("A student code / external ID is required for PIN access");
        }
        if (!patch.pin || patch.pin.trim().length < 4) {
          throw new Error("The PIN must contain at least 4 digits");
        }
        const syntheticEmail = buildStudentSyntheticEmail(school.code, externalId);
        const user = await directus.request(
          createUser({
            email: syntheticEmail,
            password: patch.pin.trim(),
            first_name: firstName,
            last_name: lastName,
            role: studentRole.id,
            status: "active",
          }),
        );
        directusUserId = user.id;
        authUserCreated = true;
      } else if (patch.access_mode === "email") {
        const email = (patch.email ?? current.email ?? "").trim().toLowerCase();
        if (!email) {
          throw new Error("A student email is required for email access");
        }
        if (!patch.password || patch.password.length < 6) {
          throw new Error("The initial password must contain at least 6 characters");
        }
        const user = await directus.request(
          createUser({
            email,
            password: patch.password,
            first_name: firstName,
            last_name: lastName,
            role: studentRole.id,
            status: "active",
          }),
        );
        directusUserId = user.id;
        authUserCreated = true;
      }
    } else if (directusUserId) {
      // Case 2: Student ALREADY has an account; update user attributes or reset password/PIN
      const newSecret = patch.reset_pin?.trim() || patch.reset_password?.trim();
      const userPatch: Record<string, any> = {};
      if (newSecret) {
        userPatch.password = newSecret;
      }
      if (patch.first_name !== undefined) userPatch.first_name = patch.first_name;
      if (patch.last_name !== undefined) userPatch.last_name = patch.last_name;

      if (Object.keys(userPatch).length > 0) {
        await directus.request(updateUser(directusUserId, userPatch));
      }
    }

    const payload: Partial<StudentProfile> = {};
    if (authUserCreated && directusUserId) payload.directus_user_id = directusUserId;
    if (patch.first_name !== undefined) payload.first_name = patch.first_name;
    if (patch.last_name !== undefined) payload.last_name = patch.last_name;
    if (patch.preferred_name !== undefined) payload.preferred_name = patch.preferred_name;
    if (patch.email !== undefined) payload.email = patch.email;
    if (patch.external_id !== undefined) payload.external_id = patch.external_id;
    if (patch.date_of_birth !== undefined) payload.date_of_birth = patch.date_of_birth;
    if (patch.preferred_language !== undefined) payload.preferred_language = patch.preferred_language;
    if (patch.sex !== undefined) payload.sex = patch.sex || null;
    if (patch.active !== undefined) payload.active = patch.active;
    if (patch.has_diagnosis !== undefined) {
      payload.has_diagnosis = patch.has_diagnosis;
      if (patch.has_diagnosis) {
        // If student has a diagnosis, evaluation suggestion is not applicable
        payload.needs_evaluation = false;
      }
    }
    if (patch.needs_evaluation !== undefined && !payload.has_diagnosis && !current.has_diagnosis) {
      payload.needs_evaluation = patch.needs_evaluation;
    }
    if (patch.diagnosis_notes !== undefined) payload.diagnosis_notes = patch.diagnosis_notes;

    try {
      return (await directus.request(updateItem("student_profiles", id, payload))) as StudentProfile;
    } catch (updateErr) {
      if (authUserCreated && directusUserId) {
        try {
          await directus.request(deleteUser(directusUserId));
        } catch {
          // Ignore deletion error to preserve original failure
        }
      }
      throw updateErr;
    }
  },

  async importStudents(students: ParsedCsvStudent[]): Promise<{ imported: number; failed: number }> {
    const school = await this.getActiveSchool();
    if (!school) throw new Error("No active school found for current director");

    let studentRoleId: string | null = null;
    try {
      const roles = await directus.request(
        readRoles({
          filter: { name: { _eq: "Student" } },
          fields: ["id"],
          limit: 1,
        }),
      );
      if (roles[0]) {
        studentRoleId = roles[0].id;
      }
    } catch {
      // Role lookup failure will skip user creation but keep profile import
    }

    let imported = 0;
    let failed = 0;

    for (const student of students) {
      if (!student.isValid) {
        failed++;
        continue;
      }
      try {
        let directusUserId: string | null = null;

        if (studentRoleId && student.email && student.password && student.password.length >= 6) {
          try {
            const user = await directus.request(
              createUser({
                email: student.email.trim().toLowerCase(),
                password: student.password,
                first_name: student.first_name,
                last_name: student.last_name,
                role: studentRoleId,
                status: "active",
              }),
            );
            directusUserId = user.id;
          } catch {
            // If user creation fails, continue without user account
          }
        } else if (studentRoleId && student.external_id && student.pin && student.pin.length >= 4) {
          try {
            const syntheticEmail = buildStudentSyntheticEmail(school.code, student.external_id);
            const user = await directus.request(
              createUser({
                email: syntheticEmail,
                password: student.pin.trim(),
                first_name: student.first_name,
                last_name: student.last_name,
                role: studentRoleId,
                status: "active",
              }),
            );
            directusUserId = user.id;
          } catch {
            // If user creation fails, continue without user account
          }
        }

        await directus.request(
          createItem("student_profiles", {
            school_id: school.id,
            directus_user_id: directusUserId,
            first_name: student.first_name,
            last_name: student.last_name,
            email: student.email || null,
            external_id: student.external_id || null,
            date_of_birth: student.date_of_birth || null,
            preferred_language: student.preferred_language || "en",
            sex: student.sex || null,
            active: true,
          }),
        );
        imported++;
      } catch {
        failed++;
      }
    }

    return { imported, failed };
  },

  async getTeachers(): Promise<TeacherProfile[]> {
    return (await directus.request(
      readItems("teacher_profiles", {
        sort: ["last_name", "first_name"],
        limit: -1,
      }),
    )) as TeacherProfile[];
  },

  async createTeacher(input: CreateTeacherInput): Promise<TeacherProfile> {
    const school = await this.getActiveSchool();
    if (!school) throw new Error("No active school found for current director");
    if (!input.email?.trim()) throw new Error("A teacher email is required");
    if (!input.password || input.password.length < 8) {
      throw new Error("The initial password must contain at least 8 characters");
    }

    const roles = await directus.request(
      readRoles({
        filter: { name: { _eq: "Teacher" } },
        fields: ["id", "name"],
        limit: 1,
      }),
    );
    const teacherRole = roles[0];
    if (!teacherRole) throw new Error("The Teacher role is not configured in Directus");

    const email = input.email.trim().toLowerCase();
    const user = await directus.request(
      createUser({
        email,
        password: input.password,
        first_name: input.first_name,
        last_name: input.last_name,
        role: teacherRole.id,
        status: "active",
      }),
    );

    const payload: Partial<TeacherProfile> = {
      first_name: input.first_name,
      last_name: input.last_name,
      school_id: school.id,
      directus_user_id: user.id,
      email,
      preferred_language: input.preferred_language || "en",
      active: input.active ?? true,
    };
    if (input.employee_id !== undefined) payload.employee_id = input.employee_id;

    try {
      return (await directus.request(createItem("teacher_profiles", payload))) as TeacherProfile;
    } catch (profileErr) {
      try {
        await directus.request(deleteUser(user.id));
      } catch {
        // Ignore deletion error to preserve original failure
      }
      throw profileErr;
    }
  },

  async updateTeacher(id: string, patch: Partial<CreateTeacherInput>): Promise<TeacherProfile> {
    const payload: Partial<TeacherProfile> = {};
    if (patch.first_name !== undefined) payload.first_name = patch.first_name;
    if (patch.last_name !== undefined) payload.last_name = patch.last_name;
    if (patch.email !== undefined) payload.email = patch.email;
    if (patch.employee_id !== undefined) payload.employee_id = patch.employee_id;
    if (patch.preferred_language !== undefined) payload.preferred_language = patch.preferred_language;
    if (patch.active !== undefined) payload.active = patch.active;

    return (await directus.request(updateItem("teacher_profiles", id, payload))) as TeacherProfile;
  },

  async getClassStudents(classId?: string): Promise<ClassStudent[]> {
    const filter = classId ? { class_id: { _eq: classId } } : {};
    return (await directus.request(
      readItems("class_students", {
        filter,
        sort: ["-created_at"],
        limit: -1,
      }),
    )) as ClassStudent[];
  },

  async assignStudentToClass(input: AssignStudentInput): Promise<ClassStudent> {
    const school = await this.getActiveSchool();
    if (!school) throw new Error("No active school found for current director");

    const today = new Date().toISOString().split("T")[0]!;
    return (await directus.request(
      createItem("class_students", {
        school_id: school.id,
        class_id: input.class_id,
        student_id: input.student_id,
        enrolled_on: input.enrolled_on ? input.enrolled_on : today,
        active: true,
      }),
    )) as ClassStudent;
  },

  async assignStudentsToClass(input: AssignStudentsInput): Promise<void> {
    const studentIds = [...new Set(input.student_ids)];
    if (!studentIds.length) throw new Error("Select at least one student");

    const [school, classRecord, students, assignments] = await Promise.all([
      this.getActiveSchool(),
      this.getClass(input.class_id),
      this.getStudents(),
      this.getClassStudents(input.class_id),
    ]);
    const relationId = (value: string | { id: string }) => typeof value === "string" ? value : value.id;
    if (!school || !classRecord?.active || relationId(classRecord.school_id) !== school.id) {
      throw new Error("Select an active class in your school");
    }
    const eligibleIds = new Set(students.filter((student) =>
      student.active && relationId(student.school_id) === school.id,
    ).map((student) => student.id));
    if (studentIds.some((id) => !eligibleIds.has(id))) {
      throw new Error("Select active students in your school");
    }

    const existing = new Map(assignments.map((assignment) => [relationId(assignment.student_id), assignment]));
    const newIds = studentIds.filter((id) => !existing.has(id));
    const inactiveIds = studentIds.flatMap((id) => {
      const assignment = existing.get(id);
      return assignment && !assignment.active ? [assignment.id] : [];
    });

    // Directus enforces school permissions; PostgreSQL also checks both school foreign keys.
    // Each request is a batch. If the second fails, a retry skips already active enrollments.
    if (newIds.length) {
      await directus.request(createItems("class_students", newIds.map((studentId) => ({
        school_id: school.id,
        class_id: input.class_id,
        student_id: studentId,
        enrolled_on: input.enrolled_on,
        active: true,
      }))));
    }
    if (inactiveIds.length) {
      await directus.request(updateItems("class_students", inactiveIds, {
        enrolled_on: input.enrolled_on,
        left_on: null,
        active: true,
      }));
    }
  },

  async removeStudentFromClass(classStudentId: string): Promise<ClassStudent> {
    const today = new Date().toISOString().split("T")[0]!;
    return (await directus.request(
      updateItem("class_students", classStudentId, {
        active: false,
        left_on: today,
      }),
    )) as ClassStudent;
  },

  async getClassTeachers(classId?: string): Promise<ClassTeacher[]> {
    const filter = classId ? { class_id: { _eq: classId } } : {};
    return (await directus.request(
      readItems("class_teachers", {
        filter,
        sort: ["-created_at"],
        limit: -1,
      }),
    )) as ClassTeacher[];
  },

  async assignTeacherToClass(input: AssignTeacherInput): Promise<ClassTeacher> {
    const school = await this.getActiveSchool();
    if (!school) throw new Error("No active school found for current director");

    // Unassigning keeps the unique class/teacher relation as an inactive record.
    const assignments = (await directus.request(
      readItems("class_teachers", {
        filter: {
          school_id: { _eq: school.id },
          class_id: { _eq: input.class_id },
          teacher_id: { _eq: input.teacher_id },
        },
        limit: 1,
      }),
    )) as ClassTeacher[];
    const existing = assignments[0];
    if (existing?.active) return existing;

    const today = new Date().toISOString().split("T")[0]!;
    if (existing) {
      return (await directus.request(
        updateItem("class_teachers", existing.id, {
          assigned_on: input.assigned_on || today,
          unassigned_on: null,
          active: true,
        }),
      )) as ClassTeacher;
    }

    return (await directus.request(
      createItem("class_teachers", {
        school_id: school.id,
        class_id: input.class_id,
        teacher_id: input.teacher_id,
        assigned_on: input.assigned_on ? input.assigned_on : today,
        active: true,
      }),
    )) as ClassTeacher;
  },

  async removeTeacherFromClass(classTeacherId: string): Promise<ClassTeacher> {
    const today = new Date().toISOString().split("T")[0]!;
    return (await directus.request(
      updateItem("class_teachers", classTeacherId, {
        active: false,
        unassigned_on: today,
      }),
    )) as ClassTeacher;
  },
};
