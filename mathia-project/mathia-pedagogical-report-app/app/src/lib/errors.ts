export function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { errors?: unknown[]; detail?: unknown; message?: unknown };
    const details = Array.isArray(candidate.errors)
      ? candidate.errors
      : Array.isArray(candidate.detail)
        ? candidate.detail
        : undefined;
    if (details) {
      const messages = details
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (typeof item === "object" && item !== null) {
            const value = item as { message?: unknown; msg?: unknown };
            const message = value.message ?? value.msg;
            return typeof message === "string" ? message.trim() : "";
          }
          return "";
        })
        .filter(Boolean);
      if (messages.length > 0) return messages.join(". ");
    }
    if (typeof candidate.detail === "string" && candidate.detail.trim()) {
      return candidate.detail.trim();
    }
    if (typeof candidate.message === "string") {
      const msg = candidate.message.trim();
      if (msg) return msg;
    }
  }
  return fallback;
}

