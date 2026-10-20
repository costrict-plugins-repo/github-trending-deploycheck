import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DockerHubProvider } from "./docker-hub.js";

describe("DockerHubProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches latest image tag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [
              { name: "v1.2.3", last_updated: "2026-01-02", digest: "sha:abc" },
              { name: "v1.2.2", last_updated: "2026-01-01", digest: "sha:def" },
            ],
          }),
      }),
    );

    const provider = new DockerHubProvider("test-token");
    const tag = await provider.getImageTag("myapp/api");
    expect(tag).toBe("v1.2.3");
  });

  it("fetches multiple tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [
              { name: "v1.2.3", last_updated: "2026-01-02", digest: "sha:abc" },
              { name: "v1.2.2", last_updated: "2026-01-01", digest: "sha:def" },
            ],
          }),
      }),
    );

    const provider = new DockerHubProvider("test-token");
    const tags = await provider.getImageTags("myapp/api", 2);
    expect(tags).toEqual(["v1.2.3", "v1.2.2"]);
  });

  it("handles single-part image name (library namespace)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          count: 1,
          results: [
            { name: "latest", last_updated: "2026-01-01", digest: "sha:abc" },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new DockerHubProvider();
    await provider.getImageTag("nginx");

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/library/nginx/");
  });

  it("throws on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not Found"),
      }),
    );

    const provider = new DockerHubProvider();
    await expect(provider.getImageTag("nonexistent/image")).rejects.toThrow(
      "Docker image not found",
    );
  });

  it("throws when no tags exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ count: 0, results: [] }),
      }),
    );

    const provider = new DockerHubProvider();
    await expect(provider.getImageTag("myapp/api")).rejects.toThrow(
      "No tags found",
    );
  });
});
