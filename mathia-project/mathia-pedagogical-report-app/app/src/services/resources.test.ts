import { beforeEach, describe, expect, it, vi } from "vitest";

const directusMock = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("./directus", () => ({ directus: directusMock }));

import { resourceService } from "./resources";

describe("resourceService", () => {
  beforeEach(() => {
    directusMock.request.mockReset();
  });

  it("lists resources with curricular and target level filters", async () => {
    const mockResources = [
      {
        id: "res-1",
        title: "Guía de Ecuaciones",
        course_id: "grade-6",
        domain_id: "6.EE",
        target_level: "reinforcement",
        resource_type: "document",
        status: "published",
      },
    ];
    directusMock.request.mockResolvedValueOnce(mockResources);

    const res = await resourceService.listResources({
      course_id: "grade-6",
      domain_id: "6.EE",
      target_level: "reinforcement",
      search: "Ecuaciones",
    });

    expect(res).toEqual(mockResources);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("creates a new resource with curricular metadata", async () => {
    const mockCreated = {
      id: "res-new",
      title: "Video Proporciones",
      course_id: "grade-6",
      domain_id: "6.RP",
      target_level: "practice",
      resource_type: "video",
      url: "https://youtube.com/watch?v=123",
      status: "published",
    };
    directusMock.request.mockResolvedValueOnce(mockCreated);

    const res = await resourceService.createResource({
      title: "Video Proporciones",
      course_id: "grade-6",
      domain_id: "6.RP",
      target_level: "practice",
      resource_type: "video",
      url: "https://youtube.com/watch?v=123",
      status: "published",
    });

    expect(res).toEqual(mockCreated);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  it("updates an existing resource", async () => {
    const mockUpdated = {
      id: "res-1",
      title: "Guía de Ecuaciones v2",
      target_level: "enrichment",
    };
    directusMock.request.mockResolvedValueOnce(mockUpdated);

    const res = await resourceService.updateResource("res-1", {
      title: "Guía de Ecuaciones v2",
      target_level: "enrichment",
    });

    expect(res).toEqual(mockUpdated);
    expect(directusMock.request).toHaveBeenCalledTimes(1);
  });

  describe("importBatch", () => {
    it("rejects an empty import batch", async () => {
      await expect(resourceService.importBatch({ items: [] })).rejects.toThrow(
        "No items to import",
      );
      expect(directusMock.request).not.toHaveBeenCalled();
    });

    it("pre-validates all items before making any Directus request", async () => {
      const items = [
        {
          title: "Valid resource",
          resource_type: "document" as const,
          target_level: "practice" as const,
          body: "# Markdown",
        },
        {
          title: "   ", // Invalid title
          resource_type: "document" as const,
          target_level: "practice" as const,
          body: "# Markdown",
        },
      ];

      await expect(resourceService.importBatch({ items })).rejects.toThrow("missing title");
      expect(directusMock.request).not.toHaveBeenCalled();
    });

    it("creates all resources in the batch and verifies payload and published_at", async () => {
      directusMock.request
        .mockResolvedValueOnce({ id: "res-1" })
        .mockResolvedValueOnce({ id: "res-2" });

      const items = [
        {
          title: "Guía 1",
          description: "Desc 1",
          resource_type: "document" as const,
          status: "draft" as const,
          language: "es",
          course_id: "grade-6",
          domain_id: "6.EE",
          target_level: "reinforcement" as const,
          body: "# Doc",
          metadata: { tags: ["algebra"] },
        },
        {
          title: "Vídeo 2",
          resource_type: "video" as const,
          status: "published" as const,
          language: "es",
          course_id: "grade-6",
          domain_id: "6.EE",
          target_level: "practice" as const,
          url: "https://example.com/video",
        },
      ];

      const result = await resourceService.importBatch({ items });

      expect(result).toEqual({
        total: 2,
        imported: 2,
        createdIds: ["res-1", "res-2"],
      });

      expect(directusMock.request).toHaveBeenCalledTimes(2);

      // Verify payload of first item (draft: published_at must be null, no school_id)
      const firstCall = directusMock.request.mock.calls[0]![0]();
      expect(firstCall.method).toBe("POST");
      expect(firstCall.path).toBe("/items/resources");
      const firstBody = JSON.parse(firstCall.body);
      expect(firstBody).toMatchObject({
        title: "Guía 1",
        status: "draft",
        published_at: null,
        metadata: { tags: ["algebra"] },
      });
      expect(firstBody.school_id).toBeUndefined();

      // Verify payload of second item (published: published_at must be non-null)
      const secondCall = directusMock.request.mock.calls[1]![0]();
      expect(secondCall.method).toBe("POST");
      expect(secondCall.path).toBe("/items/resources");
      const secondBody = JSON.parse(secondCall.body);
      expect(secondBody).toMatchObject({
        title: "Vídeo 2",
        status: "published",
        published_at: expect.any(String),
      });
    });

    it("triggers compensation rollback when creation fails midway", async () => {
      // First item succeeds, second item fails
      directusMock.request
        .mockResolvedValueOnce({ id: "res-created-1" })
        .mockRejectedValueOnce(new Error("Directus DB constraint error"))
        .mockResolvedValueOnce({}); // deleteItem rollback mock

      const items = [
        {
          title: "Item 1",
          resource_type: "document" as const,
          target_level: "practice" as const,
          body: "# Item 1",
        },
        {
          title: "Item 2",
          resource_type: "document" as const,
          target_level: "practice" as const,
          body: "# Item 2",
        },
      ];

      await expect(resourceService.importBatch({ items })).rejects.toThrow(
        /Resource batch import failed and was rolled back.*Directus DB constraint error/,
      );

      // Verify compensation attempted to delete res-created-1
      expect(directusMock.request).toHaveBeenCalledTimes(3);
      const deleteCall = directusMock.request.mock.calls[2]![0]();
      expect(deleteCall).toMatchObject({
        method: "DELETE",
        path: "/items/resources/res-created-1",
      });
    });
  });
});

