import { beforeEach, describe, expect, it, vi } from "vitest";

const directusMock = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("./directus", () => ({ directus: directusMock }));

import { directorService, parseStudentCsv } from "./director";

describe("directorService.assignTeacherToClass", () => {
  beforeEach(() => { directusMock.request.mockReset(); });

  const input = { class_id: "class-1", teacher_id: "teacher-1", assigned_on: "2026-10-01" };
  const assignment = {
    id: "assignment-1", school_id: "school-1", class_id: "class-1",
    teacher_id: "teacher-1", assigned_on: "2026-09-01", unassigned_on: null, active: true,
  };
  const commands = () => directusMock.request.mock.calls.map(([command]) => command());

  it("reuses the same relation after unassigning, clearing its end date", async () => {
    const withdrawn = { ...assignment, active: false, unassigned_on: "2026-10-13" };
    const restored = { ...assignment, assigned_on: input.assigned_on };
    directusMock.request
      .mockResolvedValueOnce(withdrawn)
      .mockResolvedValueOnce([{ id: "school-1" }])
      .mockResolvedValueOnce([withdrawn])
      .mockResolvedValueOnce(restored);

    await directorService.removeTeacherFromClass(assignment.id);
    await expect(directorService.assignTeacherToClass(input)).resolves.toEqual(restored);

    const requests = commands();
    expect(JSON.parse(requests[0].body).active).toBe(false);
    expect(requests[2].params.filter).toEqual({
      school_id: { _eq: "school-1" }, class_id: { _eq: "class-1" }, teacher_id: { _eq: "teacher-1" },
    });
    expect(requests[3].method).toBe("PATCH");
    expect(requests[3].path).toBe("/items/class_teachers/assignment-1");
    expect(JSON.parse(requests[3].body)).toEqual({
      assigned_on: "2026-10-01", unassigned_on: null, active: true,
    });
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("leaves an already active assignment unchanged on repeated submissions", async () => {
    directusMock.request.mockResolvedValueOnce([{ id: "school-1" }]).mockResolvedValueOnce([assignment]);
    await expect(directorService.assignTeacherToClass(input)).resolves.toEqual(assignment);
    expect(commands().every((request) => request.method === "GET")).toBe(true);
  });

  it("creates an assignment when the class/teacher pair has never been linked", async () => {
    directusMock.request.mockResolvedValueOnce([{ id: "school-1" }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce(assignment);
    await directorService.assignTeacherToClass(input);
    const request = commands()[2];
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/items/class_teachers");
    expect(JSON.parse(request.body)).toEqual({ school_id: "school-1", ...input, active: true });
  });

  it("uses today's date when reactivating without an explicit assignment date", async () => {
    directusMock.request.mockResolvedValueOnce([{ id: "school-1" }])
      .mockResolvedValueOnce([{ ...assignment, active: false }]).mockResolvedValueOnce(assignment);
    await directorService.assignTeacherToClass({ class_id: input.class_id, teacher_id: input.teacher_id });
    expect(JSON.parse(commands()[2].body).assigned_on).toBe(new Date().toISOString().split("T")[0]);
  });

  it("propagates read errors without attempting a duplicate insert", async () => {
    directusMock.request.mockResolvedValueOnce([{ id: "school-1" }])
      .mockRejectedValueOnce(new Error("Connection lost"));
    await expect(directorService.assignTeacherToClass(input)).rejects.toThrow("Connection lost");
    expect(commands().every((request) => request.method === "GET")).toBe(true);
  });
});

describe("directorService.assignStudentsToClass", () => {
  beforeEach(() => { directusMock.request.mockReset(); });

  const prepare = (ids: string[], assignments: unknown[] = [], schoolId = "school-1", active = true) => {
    directusMock.request
      .mockResolvedValueOnce([{ id: "school-1" }])
      .mockResolvedValueOnce([{ id: "class-1", school_id: schoolId, active }])
      .mockResolvedValueOnce(ids.map((id) => ({ id, school_id: "school-1", active: true })))
      .mockResolvedValueOnce(assignments);
  };
  const input = (ids: string[]) => ({ class_id: "class-1", student_ids: ids, enrolled_on: "2026-09-27" });
  const commands = () => directusMock.request.mock.calls.map(([command]) => command());

  it("creates 300 enrollments in one batch, deduplicating selected IDs", async () => {
    const ids = Array.from({ length: 300 }, (_, index) => `student-${index}`);
    prepare(ids);
    directusMock.request.mockResolvedValueOnce([]);
    await directorService.assignStudentsToClass(input([...ids, ids[0]!]));
    const writes = commands().filter((command) => command.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("/items/class_students");
    const body = JSON.parse(writes[0].body);
    expect(body).toHaveLength(300);
    expect(body[0]).toEqual({ school_id: "school-1", class_id: "class-1", student_id: ids[0], enrolled_on: "2026-09-27", active: true });
  });

  it("skips active enrollments and reactivates withdrawn ones in a batch", async () => {
    prepare(["active", "withdrawn", "new"], [
      { id: "enrollment-1", student_id: { id: "active" }, active: true },
      { id: "enrollment-2", student_id: "withdrawn", active: false },
    ]);
    directusMock.request.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await directorService.assignStudentsToClass(input(["active", "withdrawn", "new"]));
    const writes = commands().filter((command) => command.method !== "GET");
    expect(JSON.parse(writes[0].body).map((item: { student_id: string }) => item.student_id)).toEqual(["new"]);
    expect(writes[1].method).toBe("PATCH");
    expect(JSON.parse(writes[1].body)).toEqual({ keys: ["enrollment-2"], data: { enrolled_on: "2026-09-27", left_on: null, active: true } });
  });

  it("can retry after a partial failure without recreating saved enrollments", async () => {
    prepare(["new", "withdrawn"], [{ id: "enrollment-2", student_id: "withdrawn", active: false }]);
    directusMock.request.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Connection lost"));
    await expect(directorService.assignStudentsToClass(input(["new", "withdrawn"]))).rejects.toThrow("Connection lost");
    directusMock.request.mockReset();
    prepare(["new", "withdrawn"], [
      { id: "enrollment-1", student_id: "new", active: true },
      { id: "enrollment-2", student_id: "withdrawn", active: false },
    ]);
    directusMock.request.mockResolvedValueOnce([]);
    await directorService.assignStudentsToClass(input(["new", "withdrawn"]));
    expect(commands().filter((command) => command.method !== "GET").map((command) => command.method)).toEqual(["PATCH"]);
  });

  it.each([["school-2", true], ["school-1", false]])("rejects unavailable destinations before writing (%s, %s)", async (schoolId, active) => {
    prepare(["student-1"], [], schoolId as string, active as boolean);
    await expect(directorService.assignStudentsToClass(input(["student-1"]))).rejects.toThrow("active class");
    expect(commands().every((command) => command.method === "GET")).toBe(true);
  });

  it("rejects students outside the eligible list before writing", async () => {
    prepare(["student-1"]);
    await expect(directorService.assignStudentsToClass(input(["student-1", "foreign"]))).rejects.toThrow("active students");
    expect(commands().every((command) => command.method === "GET")).toBe(true);
  });

  it("rejects empty selections without requesting Directus", async () => {
    await expect(directorService.assignStudentsToClass(input([]))).rejects.toThrow("Select at least one student");
    expect(directusMock.request).not.toHaveBeenCalled();
  });
});

describe("parseStudentCsv", () => {
  it("parses valid CSV rows with standard headers", () => {
    const csv = `first_name,last_name,email,external_id,date_of_birth,preferred_language
Ada,Lovelace,ada@example.com,STU-001,2010-12-10,en
Alan,Turing,alan@example.com,STU-002,2010-06-23,es`;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]!).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      external_id: "STU-001",
      date_of_birth: "2010-12-10",
      preferred_language: "en",
      isValid: true,
      error: undefined,
    });
    expect(result[1]!.first_name).toBe("Alan");
    expect(result[1]!.preferred_language).toBe("es");
  });

  it("handles Spanish headers (nombre, apellidos, correo)", () => {
    const csv = `nombre,apellidos,correo,codigo
Marie,Curie,marie@school.org,STU-003`;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]!.first_name).toBe("Marie");
    expect(result[0]!.last_name).toBe("Curie");
    expect(result[0]!.email).toBe("marie@school.org");
    expect(result[0]!.external_id).toBe("STU-003");
    expect(result[0]!.isValid).toBe(true);
  });

  it("marks invalid rows missing first or last name", () => {
    const csv = `first_name,last_name,email
,MissingFirst,test@example.com
Valid,Name,valid@example.com`;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]!.isValid).toBe(false);
    expect(result[0]!.error).toBeDefined();
    expect(result[1]!.isValid).toBe(true);
  });

  it("returns empty array on empty or header-only string", () => {
    expect(parseStudentCsv("")).toEqual([]);
    expect(parseStudentCsv("first_name,last_name")).toEqual([]);
  });

  it("parses student sex correctly from standard and localized values", () => {
    const csv = `first_name,last_name,sex
Lucas,García,male
Emma,Rodríguez,female
Alex,Taylor,other
David,Villa,M
Sara,Carbonero,F
Carlos,Sainz,1
Paula,Badosa,0
Roberto,Benigni,masculino
Chiara,Ferragni,femenino`;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(9);
    expect(result[0]!.sex).toBe("male");
    expect(result[1]!.sex).toBe("female");
    expect(result[2]!.sex).toBe("other");
    expect(result[3]!.sex).toBe("male");
    expect(result[4]!.sex).toBe("female");
    expect(result[5]!.sex).toBe("male");
    expect(result[6]!.sex).toBe("female");
    expect(result[7]!.sex).toBe("male");
    expect(result[8]!.sex).toBe("female");
    expect(result.every((r) => r.isValid)).toBe(true);
  });

  it("leaves sex as undefined when absent or empty without failing", () => {
    const csv = `first_name,last_name,sex
Lucas,García,
Emma,Rodríguez,   `;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]!.sex).toBeUndefined();
    expect(result[0]!.isValid).toBe(true);
    expect(result[1]!.sex).toBeUndefined();
    expect(result[1]!.isValid).toBe(true);
  });

  it("never infers sex from first name or names alone", () => {
    const csv = `first_name,last_name
María,Gómez
Juan,Pérez
Laura,Martín`;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(3);
    expect(result[0]!.sex).toBeUndefined();
    expect(result[1]!.sex).toBeUndefined();
    expect(result[2]!.sex).toBeUndefined();
  });

  it("marks rows with unknown sex values as invalid with an explicit error", () => {
    const csv = `first_name,last_name,sex
Carlos,García,invalido
Sofia,Ruiz,alien`;

    const result = parseStudentCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]!.isValid).toBe(false);
    expect(result[0]!.error).toBe('Invalid sex value: "invalido"');
    expect(result[1]!.isValid).toBe(false);
    expect(result[1]!.error).toBe('Invalid sex value: "alien"');
  });
});

describe("directorService.getActiveSchool", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  it("performs one active-school read and relies on the Directus policy for tenant scope", async () => {
    const school = {
      id: "school-1",
      name: "Mathia School",
      code: "MATH001",
      slug: "mathia-school",
      default_language: "en",
      time_zone: "UTC",
      active: true,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    directusMock.request.mockResolvedValueOnce([school]);

    await expect(directorService.getActiveSchool()).resolves.toEqual(school);

    expect(directusMock.request).toHaveBeenCalledTimes(1);
    const command = directusMock.request.mock.calls[0]?.[0];
    expect(typeof command).toBe("function");
    expect(command()).toEqual({
      method: "GET",
      path: "/items/schools",
      params: {
        filter: { active: { _eq: true } },
        limit: 1,
      },
    });
  });

  it("returns null when the policy exposes no active school", async () => {
    directusMock.request.mockResolvedValueOnce([]);

    await expect(directorService.getActiveSchool()).resolves.toBeNull();
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });
});

describe("directorService.createStudent", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  const mockSchool = {
    id: "school-1",
    name: "Mathia School",
    code: "MATH001",
    slug: "mathia-school",
    default_language: "en",
    time_zone: "UTC",
    active: true,
  };

  it("creates a student with PIN mode creating directus user with synthetic email", async () => {
    // 1. getActiveSchool
    directusMock.request.mockResolvedValueOnce([mockSchool]);
    // 2. readRoles (Student)
    directusMock.request.mockResolvedValueOnce([{ id: "student-role-id", name: "Student" }]);
    // 3. createUser
    directusMock.request.mockResolvedValueOnce({ id: "new-user-id" });
    // 4. createItem (student_profiles)
    directusMock.request.mockResolvedValueOnce({
      id: "profile-1",
      first_name: "Lucas",
      last_name: "García",
      external_id: "ALU-001",
      directus_user_id: "new-user-id",
    });

    const result = await directorService.createStudent({
      first_name: "Lucas",
      last_name: "García",
      external_id: "ALU-001",
      access_mode: "pin",
      pin: "1234",
    });

    expect(result.id).toBe("profile-1");
    // Verify createUser was called with synthetic email
    const createUserCall = directusMock.request.mock.calls[2]?.[0];
    expect(createUserCall()).toEqual({
      method: "POST",
      path: "/users",
      params: {},
      body: JSON.stringify({
        email: "math001.alu-001@student.mathia.school",
        password: "1234",
        first_name: "Lucas",
        last_name: "García",
        role: "student-role-id",
        status: "active",
      }),
    });
  });

  it("creates a student with none mode without creating directus user", async () => {
    // 1. getActiveSchool
    directusMock.request.mockResolvedValueOnce([mockSchool]);
    // 2. createItem (student_profiles)
    directusMock.request.mockResolvedValueOnce({
      id: "profile-2",
      first_name: "Emma",
      last_name: "Vázquez",
      active: true,
    });

    const result = await directorService.createStudent({
      first_name: "Emma",
      last_name: "Vázquez",
      access_mode: "none",
    });

    expect(result.id).toBe("profile-2");
    expect(directusMock.request).toHaveBeenCalledTimes(2);
  });

  it("updates an existing student without account to assign PIN access", async () => {
    // 1. readItem (current profile)
    directusMock.request.mockResolvedValueOnce({
      id: "profile-3",
      first_name: "Carlos",
      last_name: "Santana",
      external_id: "ALU-003",
      directus_user_id: null,
    });
    // 2. getActiveSchool
    directusMock.request.mockResolvedValueOnce([mockSchool]);
    // 3. readRoles
    directusMock.request.mockResolvedValueOnce([{ id: "student-role-id", name: "Student" }]);
    // 4. createUser
    directusMock.request.mockResolvedValueOnce({ id: "user-carlos" });
    // 5. updateItem
    directusMock.request.mockResolvedValueOnce({
      id: "profile-3",
      first_name: "Carlos",
      last_name: "Santana",
      external_id: "ALU-003",
      directus_user_id: "user-carlos",
    });

    const result = await directorService.updateStudent("profile-3", {
      access_mode: "pin",
      pin: "4321",
    });

    expect(result.directus_user_id).toBe("user-carlos");
    const createUserCall = directusMock.request.mock.calls[3]?.[0];
    expect(createUserCall()).toEqual({
      method: "POST",
      path: "/users",
      params: {},
      body: JSON.stringify({
        email: "math001.alu-003@student.mathia.school",
        password: "4321",
        first_name: "Carlos",
        last_name: "Santana",
        role: "student-role-id",
        status: "active",
      }),
    });
  });

  it("resets PIN for an existing student with account", async () => {
    // 1. readItem (current profile)
    directusMock.request.mockResolvedValueOnce({
      id: "profile-4",
      first_name: "Sofia",
      last_name: "López",
      external_id: "ALU-004",
      directus_user_id: "user-sofia",
    });
    // 2. updateUser
    directusMock.request.mockResolvedValueOnce({ id: "user-sofia" });
    // 3. updateItem (student_profiles)
    directusMock.request.mockResolvedValueOnce({
      id: "profile-4",
      first_name: "Sofia",
      last_name: "López",
      external_id: "ALU-004",
      directus_user_id: "user-sofia",
    });

    const result = await directorService.updateStudent("profile-4", {
      reset_pin: "9876",
    });

    expect(result.id).toBe("profile-4");
    const updateUserCall = directusMock.request.mock.calls[1]?.[0];
    expect(updateUserCall()).toEqual({
      method: "PATCH",
      path: "/users/user-sofia",
      params: {},
      body: JSON.stringify({
        password: "9876",
      }),
    });
  });

  it("creates a student with diagnosis notes and no evaluation suggestion", async () => {
    directusMock.request.mockResolvedValueOnce([
      { id: "school-1", code: "MATH001", active: true },
    ]);
    directusMock.request.mockResolvedValueOnce({
      id: "profile-diag-1",
      first_name: "Elena",
      last_name: "Ríos",
      has_diagnosis: true,
      diagnosis_notes: "ADHD / TDAH",
      needs_evaluation: false,
    });

    const student = await directorService.createStudent({
      first_name: "Elena",
      last_name: "Ríos",
      has_diagnosis: true,
      diagnosis_notes: "ADHD / TDAH",
      needs_evaluation: true, // Should be overridden to false because has_diagnosis is true
    });

    expect(student.id).toBe("profile-diag-1");
    const createCall = directusMock.request.mock.calls[1]?.[0];
    expect(createCall()).toEqual({
      method: "POST",
      path: "/items/student_profiles",
      params: {},
      body: JSON.stringify({
        first_name: "Elena",
        last_name: "Ríos",
        school_id: "school-1",
        preferred_language: "en",
        active: true,
        has_diagnosis: true,
        needs_evaluation: false,
        diagnosis_notes: "ADHD / TDAH",
      }),
    });
  });

  it("updates a student to set AI evaluation suggestion when has_diagnosis is false", async () => {
    directusMock.request.mockResolvedValueOnce({
      id: "profile-diag-2",
      first_name: "Mateo",
      last_name: "Ruiz",
      has_diagnosis: false,
      needs_evaluation: false,
    });
    directusMock.request.mockResolvedValueOnce({
      id: "profile-diag-2",
      has_diagnosis: false,
      needs_evaluation: true,
    });

    await directorService.updateStudent("profile-diag-2", {
      needs_evaluation: true,
    });

    const updateCall = directusMock.request.mock.calls[1]?.[0];
    expect(updateCall()).toEqual({
      method: "PATCH",
      path: "/items/student_profiles/profile-diag-2",
      params: {},
      body: JSON.stringify({
        needs_evaluation: true,
      }),
    });
  });
});

describe("directorService.updateSchool - educational_system", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  it("updates educational_system to 'ES' successfully", async () => {
    directusMock.request.mockResolvedValueOnce({
      id: "school-1",
      name: "Colegio Mathia",
      educational_system: "ES",
    });

    const result = await directorService.updateSchool("school-1", {
      educational_system: "ES",
    });

    expect(result.educational_system).toBe("ES");
    const updateCall = directusMock.request.mock.calls[0]?.[0];
    expect(updateCall()).toEqual({
      method: "PATCH",
      path: "/items/schools/school-1",
      params: {},
      body: JSON.stringify({ educational_system: "ES" }),
    });
  });

  it("updates educational_system to 'IT' successfully", async () => {
    directusMock.request.mockResolvedValueOnce({
      id: "school-1",
      name: "Scuola Mathia",
      educational_system: "IT",
    });

    const result = await directorService.updateSchool("school-1", {
      educational_system: "IT",
    });

    expect(result.educational_system).toBe("IT");
    const updateCall = directusMock.request.mock.calls[0]?.[0];
    expect(updateCall()).toEqual({
      method: "PATCH",
      path: "/items/schools/school-1",
      params: {},
      body: JSON.stringify({ educational_system: "IT" }),
    });
  });

  it("rejects systems other than 'ES' and 'IT'", async () => {
    await expect(
      directorService.updateSchool("school-1", {
        educational_system: "US" as any,
      }),
    ).rejects.toThrow(/Invalid educational system: "US"/);

    await expect(
      directorService.updateSchool("school-1", {
        educational_system: "FR" as any,
      }),
    ).rejects.toThrow(/Invalid educational system: "FR"/);

    await expect(
      directorService.updateSchool("school-1", {
        educational_system: "" as any,
      }),
    ).rejects.toThrow(/Invalid educational system: ""/);

    expect(directusMock.request).not.toHaveBeenCalled();
  });
});

describe("directorService student profile with sex", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  it("creates a student with explicit sex ('female')", async () => {
    directusMock.request.mockResolvedValueOnce([
      { id: "school-1", code: "MATH001", active: true },
    ]);
    directusMock.request.mockResolvedValueOnce({
      id: "profile-sex-1",
      first_name: "Emma",
      last_name: "Rodríguez",
      sex: "female",
    });

    const student = await directorService.createStudent({
      first_name: "Emma",
      last_name: "Rodríguez",
      sex: "female",
    });

    expect(student.sex).toBe("female");
    const createCall = directusMock.request.mock.calls[1]?.[0];
    expect(createCall()).toEqual({
      method: "POST",
      path: "/items/student_profiles",
      params: {},
      body: JSON.stringify({
        first_name: "Emma",
        last_name: "Rodríguez",
        school_id: "school-1",
        preferred_language: "en",
        active: true,
        has_diagnosis: false,
        needs_evaluation: false,
        diagnosis_notes: null,
        sex: "female",
      }),
    });
  });

  it("creates a student with sex null when omitted or undefined", async () => {
    directusMock.request.mockResolvedValueOnce([
      { id: "school-1", code: "MATH001", active: true },
    ]);
    directusMock.request.mockResolvedValueOnce({
      id: "profile-sex-2",
      first_name: "Alex",
      last_name: "Taylor",
      sex: null,
    });

    const student = await directorService.createStudent({
      first_name: "Alex",
      last_name: "Taylor",
    });

    expect(student.sex).toBeNull();
    const createCall = directusMock.request.mock.calls[1]?.[0];
    const payload = JSON.parse(createCall().body);
    expect(payload.sex).toBeUndefined();
  });

  it("rejects creating a student with invalid sex value", async () => {
    await expect(
      directorService.createStudent({
        first_name: "Test",
        last_name: "Student",
        sex: "invalid_sex" as any,
      }),
    ).rejects.toThrow(/Invalid student sex: "invalid_sex"/);

    expect(directusMock.request).not.toHaveBeenCalled();
  });

  it("updates a student's sex to 'male'", async () => {
    directusMock.request.mockResolvedValueOnce({
      id: "profile-sex-3",
      first_name: "Lucas",
      last_name: "García",
      sex: null,
    });
    directusMock.request.mockResolvedValueOnce({
      id: "profile-sex-3",
      first_name: "Lucas",
      last_name: "García",
      sex: "male",
    });

    const updated = await directorService.updateStudent("profile-sex-3", {
      sex: "male",
    });

    expect(updated.sex).toBe("male");
    const updateCall = directusMock.request.mock.calls[1]?.[0];
    expect(updateCall()).toEqual({
      method: "PATCH",
      path: "/items/student_profiles/profile-sex-3",
      params: {},
      body: JSON.stringify({
        sex: "male",
      }),
    });
  });

  it("rejects updating a student with invalid sex value", async () => {
    directusMock.request.mockResolvedValueOnce({
      id: "profile-sex-4",
      first_name: "Lucas",
      last_name: "García",
    });

    await expect(
      directorService.updateStudent("profile-sex-4", {
        sex: "alien" as any,
      }),
    ).rejects.toThrow(/Invalid student sex: "alien"/);
  });
});


