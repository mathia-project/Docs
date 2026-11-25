import { afterEach, describe, expect, it, vi } from "vitest";
import { getStudentReportDocument, getStudentReportPdf, type ReportPresentation } from "./report-document";

vi.mock("./directus", () => ({ directus: { getToken: vi.fn(async () => "user-token") } }));

afterEach(() => vi.unstubAllGlobals());

describe("saved report downloads", () => {
  it("sends the user's token and the exact preview revision without caching", async () => {
    const fetchMock = vi.fn(async () => new Response("%PDF", { headers: { "Content-Type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getStudentReportPdf({ report_id: "report-1", revision: "abc123" } as ReportPresentation);
    expect(result.type).toBe("application/pdf");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/report-1/pdf?revision=abc123"), {
      headers: { Authorization: "Bearer user-token" }, cache: "no-store",
    });
  });

  it("asks to refresh instead of downloading a silently changed version", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "report_revision_changed" }), { status: 409 })));
    await expect(getStudentReportPdf({ report_id: "1", revision: "old" } as ReportPresentation)).rejects.toMatchObject({ code: "changed" });
  });

  it("does not save an HTML error page as a PDF", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } })));
    await expect(getStudentReportPdf({ report_id: "1", revision: "old" } as ReportPresentation)).rejects.toMatchObject({ code: "failed" });
  });

  it.each([[401, "authentication"], [404, "unavailable"], [409, "unsupported"], [503, "failed"]])("maps status %s to a localized error", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: Number(status) })));
    await expect(getStudentReportDocument("report-1")).rejects.toMatchObject({ code });
  });
});
