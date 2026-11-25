import { beforeEach, describe, expect, it, vi } from "vitest";

const directusMock = vi.hoisted(() => ({
  request: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock("./directus", () => ({ directus: directusMock }));

import { authService } from "./auth";

function directusUser(role: string) {
  return {
    id: "user-1",
    email: "learner@example.com",
    first_name: "Ada",
    last_name: "Lovelace",
    role: { id: "role-1", name: role },
  };
}

describe("authService profile validation", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
    directusMock.login.mockReset();
    directusMock.logout.mockReset();
    directusMock.setToken.mockReset();
  });

  it.each([
    ["Student", "student", "/items/student_profiles"],
    ["Teacher", "teacher", "/items/teacher_profiles"],
    ["Director", "director", "/items/teacher_profiles"],
  ] as const)(
    "accepts a provisioned %s account through the correct profile collection",
    async (directusRole, appRole, profilePath) => {
      directusMock.request
        .mockResolvedValueOnce(directusUser(directusRole))
        .mockResolvedValueOnce([{ id: "profile-1" }]);

      await expect(authService.getCurrentUser()).resolves.toEqual({
        id: "user-1",
        email: "learner@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        role: appRole,
      });

      expect(directusMock.request).toHaveBeenCalledTimes(2);
      const profileCommand = directusMock.request.mock.calls[1]?.[0];
      expect(typeof profileCommand).toBe("function");
      expect(profileCommand()).toEqual({
        method: "GET",
        path: profilePath,
        params: {
          fields: ["id"],
          filter: {
            directus_user_id: { _eq: "user-1" },
            active: { _eq: true },
            school_id: { active: { _eq: true } },
          },
          limit: 1,
        },
      });
    },
  );

  it("rejects a supported user without an active profile and active school", async () => {
    directusMock.request
      .mockResolvedValueOnce(directusUser("Student"))
      .mockResolvedValueOnce([]);

    await expect(authService.getCurrentUser()).rejects.toMatchObject({
      name: "AuthServiceError",
      code: "profileNotProvisioned",
    });
  });

  it("clears a freshly issued token when sign-in finds an unprovisioned profile", async () => {
    directusMock.login.mockResolvedValueOnce(undefined);
    directusMock.setToken.mockResolvedValueOnce(undefined);
    directusMock.request
      .mockResolvedValueOnce(directusUser("Teacher"))
      .mockResolvedValueOnce([]);

    await expect(
      authService.signIn({ email: "  learner@example.com  ", password: "secret" }),
    ).rejects.toMatchObject({ code: "profileNotProvisioned" });

    expect(directusMock.login).toHaveBeenCalledWith({
      email: "learner@example.com",
      password: "secret",
    });
    expect(directusMock.setToken).toHaveBeenCalledWith(null);
  });
});
