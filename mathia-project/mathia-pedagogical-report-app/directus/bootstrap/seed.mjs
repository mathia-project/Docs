#!/usr/bin/env node

/**
 * Development seed script for Mathia Pedagogical Report.
 * Populates realistic initial test data for all roles:
 * - 1 Teacher: teacher@example.com / teacher123 (Sofía Martínez)
 * - 1 Class: 1º Secundaria A (1SEC-A, 2025-2026)
 * - 2 Students: student@example.com / student123 (Lucas García)
 *               student2@example.com / student123 (Emma Rodríguez)
 * - Class assignments (teacher assigned, students enrolled)
 */

const DEFAULT_URL = process.env.DIRECTUS_URL || process.env.DIRECTUS_PUBLIC_URL || "http://localhost:8055";
const ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD || "mathia-local-admin-password";
const SEED_MODE = process.env.SEED_MODE || "demo";
if (!new Set(["demo", "initial"]).has(SEED_MODE)) {
  throw new Error("SEED_MODE must be demo or initial");
}

const config = {
  school: {
    name: process.env.SEED_SCHOOL_NAME || "Mathia School",
    code: process.env.SEED_SCHOOL_CODE || "MATHIA",
    slug: process.env.SEED_SCHOOL_SLUG || "mathia-school",
    language: process.env.SEED_DEFAULT_LANGUAGE || "es",
    timeZone: process.env.SEED_TIME_ZONE || "Europe/Madrid",
    educationalSystem: process.env.SEED_EDUCATIONAL_SYSTEM || "ES",
  },
  director: {
    email: process.env.SEED_DIRECTOR_EMAIL || "director@example.com",
    password: process.env.SEED_DIRECTOR_PASSWORD || "director123",
    firstName: process.env.SEED_DIRECTOR_FIRST_NAME || "Ana",
    lastName: process.env.SEED_DIRECTOR_LAST_NAME || "Directora",
    employeeId: process.env.SEED_DIRECTOR_EMPLOYEE_ID || "DIR-001",
  },
  teacher: {
    email: process.env.SEED_TEACHER_EMAIL || "teacher@example.com",
    password: process.env.SEED_TEACHER_PASSWORD || "teacher123",
    firstName: process.env.SEED_TEACHER_FIRST_NAME || "Sofía",
    lastName: process.env.SEED_TEACHER_LAST_NAME || "Martínez",
    employeeId: process.env.SEED_TEACHER_EMPLOYEE_ID || "EMP-001",
  },
  class: {
    name: process.env.SEED_CLASS_NAME || "1º Secundaria A",
    code: process.env.SEED_CLASS_CODE || "1SEC-A",
    academicYear: process.env.SEED_CLASS_ACADEMIC_YEAR || "2025-2026",
    gradeLevel: process.env.SEED_CLASS_GRADE_LEVEL || "grade-7",
  },
};

if (SEED_MODE === "initial") {
  for (const key of [
    "SEED_SCHOOL_NAME", "SEED_SCHOOL_CODE", "SEED_SCHOOL_SLUG",
    "SEED_DIRECTOR_EMAIL", "SEED_DIRECTOR_PASSWORD",
    "SEED_DIRECTOR_FIRST_NAME", "SEED_DIRECTOR_LAST_NAME",
  ]) {
    if (!process.env[key]) throw new Error(`${key} is required for initial setup`);
  }
  if (config.director.password.length < 32 || config.director.email.endsWith("@example.com")) {
    throw new Error("Initial director account needs a real email and a strong password");
  }
}

function readStudents() {
  const fallback = [
    { email: "student@example.com", password: "student123", firstName: "Lucas", lastName: "García", externalId: "ALU-001", sex: "male" },
    { email: "student2@example.com", password: "student123", firstName: "Emma", lastName: "Rodríguez", externalId: "ALU-002", sex: "female" },
  ];
  const raw = process.env.SEED_STUDENTS_JSON;
  if (!raw) return fallback;
  const students = JSON.parse(raw);
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error("SEED_STUDENTS_JSON must be a non-empty JSON array");
  }
  for (const student of students) {
    for (const field of ["email", "password", "firstName", "lastName", "externalId"]) {
      if (!student[field]) throw new Error(`SEED_STUDENTS_JSON entry is missing ${field}`);
    }
  }
  return students;
}

class SeedClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = null;
  }

  async request(path, { method = "GET", body = undefined } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      const msg = data?.errors?.map((e) => e.message).join("; ") || response.statusText;
      throw new Error(`${method} ${path} failed (${response.status}): ${msg}`);
    }

    return data?.data !== undefined ? data.data : data;
  }

  async login(email, password) {
    const res = await this.request("/auth/login", {
      method: "POST",
      body: { email, password, mode: "json" },
    });
    this.token = res.access_token;
  }
}

async function runSeed() {
  console.log(`Connecting to Directus at ${DEFAULT_URL}...`);
  const client = new SeedClient(DEFAULT_URL);
  await client.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("Authenticated as Admin.");

  // 1. Get School
  const schools = await client.request(
    `/items/schools?filter[slug][_eq]=${encodeURIComponent(config.school.slug)}&limit=1`,
  );
  let school = schools?.[0];
  if (!school) {
    school = await client.request("/items/schools", {
      method: "POST",
      body: {
        name: config.school.name,
        code: config.school.code,
        slug: config.school.slug,
        default_language: config.school.language,
        time_zone: config.school.timeZone,
        educational_system: config.school.educationalSystem,
        active: true,
      },
    });
    console.log(`Created school: ${school.name} (${school.code}) [${school.id}].`);
  }
  console.log(`Found school: ${school.name} (${school.code}) [${school.id}]`);

  // 2. Get Roles
  const roles = await client.request("/roles?limit=-1");
  const directorRole = roles.find((r) => r.name === "Director");
  const teacherRole = roles.find((r) => r.name === "Teacher");
  const studentRole = roles.find((r) => r.name === "Student");
  if (!directorRole || !teacherRole || !studentRole) {
    throw new Error("Required Director, Teacher, or Student role not found in Directus.");
  }

  // 3. Helper: find or create Directus user
  async function ensureUser({ email, password, firstName, lastName, roleId }) {
    const existingUsers = await client.request(
      `/users?filter[email][_eq]=${encodeURIComponent(email)}&limit=1`,
    );
    if (existingUsers && existingUsers.length > 0) {
      await client.request(`/users/${existingUsers[0].id}`, {
        method: "PATCH",
        body: {
          email,
          first_name: firstName,
          last_name: lastName,
          role: roleId,
          school_id: school.id,
          status: "active",
        },
      });
      console.log(`User ${email} already exists; password preserved.`);
      return existingUsers[0];
    }

    const created = await client.request("/users", {
      method: "POST",
      body: {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role: roleId,
        school_id: school.id,
        status: "active",
      },
    });
    console.log(`Created user ${email} [${created.id}].`);
    return created;
  }

  // 4. Ensure Director User and Profile
  const directorUser = await ensureUser({
    email: config.director.email,
    password: config.director.password,
    firstName: config.director.firstName,
    lastName: config.director.lastName,
    roleId: directorRole.id,
  });
  const existingDirectorProfiles = await client.request(
    `/items/teacher_profiles?filter[directus_user_id][_eq]=${directorUser.id}&limit=1`,
  );
  if (!existingDirectorProfiles[0]) {
    await client.request("/items/teacher_profiles", {
      method: "POST",
      body: {
        school_id: school.id,
        directus_user_id: directorUser.id,
        first_name: config.director.firstName,
        last_name: config.director.lastName,
        email: config.director.email,
        employee_id: config.director.employeeId,
        preferred_language: config.school.language,
        active: true,
      },
    });
    console.log(`Created director profile for ${config.director.firstName} ${config.director.lastName}.`);
  }

  if (SEED_MODE === "initial") {
    console.log("Initial setup completed: school and director are ready. Other users and classes can be added by the director.");
    return;
  }

  // 5. Ensure Teacher User and Profile
  const teacherUser = await ensureUser({
    email: config.teacher.email,
    password: config.teacher.password,
    firstName: config.teacher.firstName,
    lastName: config.teacher.lastName,
    roleId: teacherRole.id,
  });

  const existingTeacherProfiles = await client.request(
    `/items/teacher_profiles?filter[directus_user_id][_eq]=${teacherUser.id}&limit=1`,
  );
  let teacherProfile = existingTeacherProfiles[0];
  if (!teacherProfile) {
    teacherProfile = await client.request("/items/teacher_profiles", {
      method: "POST",
      body: {
        school_id: school.id,
        directus_user_id: teacherUser.id,
        first_name: config.teacher.firstName,
        last_name: config.teacher.lastName,
        email: config.teacher.email,
        employee_id: config.teacher.employeeId,
        preferred_language: config.school.language,
        active: true,
      },
    });
    console.log(`Created teacher profile for Sofía Martínez [${teacherProfile.id}].`);
  } else {
    console.log(`Teacher profile for Sofía Martínez already exists [${teacherProfile.id}].`);
  }

  // 6. Ensure Class (1º Secundaria A)
  const existingClasses = await client.request(
    `/items/classes?filter[school_id][_eq]=${school.id}&filter[code][_eq]=${encodeURIComponent(config.class.code)}&limit=1`,
  );
  let classRecord = existingClasses[0];
  if (!classRecord) {
    classRecord = await client.request("/items/classes", {
      method: "POST",
      body: {
        school_id: school.id,
        name: config.class.name,
        code: config.class.code,
        academic_year: config.class.academicYear,
        grade_level: config.class.gradeLevel,
        active: true,
      },
    });
    console.log(`Created class: 1º Secundaria A [${classRecord.id}].`);
  } else {
    console.log(`Class 1º Secundaria A already exists [${classRecord.id}].`);
  }

  // 7. Assign Teacher to Class
  const existingClassTeachers = await client.request(
    `/items/class_teachers?filter[class_id][_eq]=${classRecord.id}&filter[teacher_id][_eq]=${teacherProfile.id}&limit=1`,
  );
  if (!existingClassTeachers || existingClassTeachers.length === 0) {
    await client.request("/items/class_teachers", {
      method: "POST",
      body: {
        school_id: school.id,
        class_id: classRecord.id,
        teacher_id: teacherProfile.id,
        active: true,
      },
    });
    console.log(`Assigned Sofía Martínez to 1º Secundaria A.`);
  } else {
    console.log(`Sofía Martínez is already assigned to 1º Secundaria A.`);
  }

  // 8. Ensure Students
  const studentsData = readStudents();

  for (const st of studentsData) {
    const studentUser = await ensureUser({
      email: st.email,
      password: st.password,
      firstName: st.firstName,
      lastName: st.lastName,
      roleId: studentRole.id,
    });

    const existingStudentProfiles = await client.request(
      `/items/student_profiles?filter[directus_user_id][_eq]=${studentUser.id}&limit=1`,
    );
    let studentProfile = existingStudentProfiles[0];
    if (!studentProfile) {
      studentProfile = await client.request("/items/student_profiles", {
        method: "POST",
        body: {
          school_id: school.id,
          directus_user_id: studentUser.id,
          first_name: st.firstName,
          last_name: st.lastName,
          email: st.email,
          external_id: st.externalId,
          preferred_language: config.school.language,
          sex: st.sex || null,
          active: true,
        },
      });
      console.log(`Created student profile for ${st.firstName} ${st.lastName} [${studentProfile.id}].`);
    } else {
      console.log(`Student profile for ${st.firstName} ${st.lastName} already exists.`);
    }

    // Enroll in class
    const existingEnrollments = await client.request(
      `/items/class_students?filter[class_id][_eq]=${classRecord.id}&filter[student_id][_eq]=${studentProfile.id}&limit=1`,
    );
    if (!existingEnrollments || existingEnrollments.length === 0) {
      await client.request("/items/class_students", {
        method: "POST",
        body: {
          school_id: school.id,
          class_id: classRecord.id,
          student_id: studentProfile.id,
          active: true,
        },
      });
      console.log(`Enrolled ${st.firstName} in 1º Secundaria A.`);
    } else {
      console.log(`${st.firstName} already enrolled in 1º Secundaria A.`);
    }
  }

  console.log("\nSeed completed successfully!");
}

runSeed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});

