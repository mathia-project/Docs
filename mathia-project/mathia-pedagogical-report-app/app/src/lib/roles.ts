export const APP_ROLES = ["student", "teacher", "director"] as const;

export type AppRole = (typeof APP_ROLES)[number];

const HOME_ROUTES: Record<AppRole, string> = {
  student: "/student",
  teacher: "/teacher",
  director: "/director",
};

export function isAppRole(value: string): value is AppRole {
  return APP_ROLES.some((role) => role === value);
}

export function normalizeRoleName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function roleFromName(value: string): AppRole | null {
  const normalized = normalizeRoleName(value);

  if (normalized === "student") return "student";
  if (normalized === "teacher") return "teacher";
  if (normalized === "director") return "director";

  return null;
}

export function defaultRouteForRole(role: AppRole): string {
  return HOME_ROUTES[role];
}

export function canAccess(userRole: AppRole, allowedRoles: readonly AppRole[]): boolean {
  return allowedRoles.includes(userRole);
}
