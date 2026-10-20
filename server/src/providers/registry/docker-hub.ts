import type { RegistryProvider } from "../../types.js";

const DOCKER_HUB_API = "https://hub.docker.com/v2";

/** Raw tag shape returned by the Docker Hub Tags API. */
type DockerHubTag = {
  name: string;
  last_updated: string;
  digest: string;
};

/** Envelope for the GET /repositories/{namespace}/{repo}/tags endpoint. */
type DockerHubTagsResponse = {
  count: number;
  results: DockerHubTag[];
};

/**
 * Registry provider that queries Docker Hub for image tags via the v2 REST API.
 *
 * Authentication is optional — public images can be queried without a token.
 * For private repositories, supply a token explicitly or set DOCKER_HUB_TOKEN.
 */
export class DockerHubProvider implements RegistryProvider {
  private token: string | undefined;

  /**
   * @param token - Docker Hub API token. Falls back to the DOCKER_HUB_TOKEN
   *               environment variable. May be undefined for public images.
   */
  constructor(token?: string) {
    this.token = token ?? process.env.DOCKER_HUB_TOKEN;
  }

  /**
   * Returns the most recently updated tag name for the given image.
   *
   * Convenience wrapper around {@link getImageTags} that fetches a single tag.
   *
   * @param image - Image name in "[namespace/]repository" format.
   * @returns The tag name string (e.g. "latest", "v1.2.3").
   * @throws If no tags exist for the image.
   */
  async getImageTag(image: string): Promise<string> {
    const tags = await this.getImageTags(image, 1);
    if (tags.length === 0) {
      throw new Error(`No tags found for image: ${image}`);
    }
    return tags[0];
  }

  /**
   * Fetches the most recently updated tag names for the given image.
   *
   * Results are ordered by `last_updated` descending, so the first entry
   * is the most recently pushed tag.
   *
   * @param image - Image name in "[namespace/]repository" format.
   *               Single-segment names (e.g. "nginx") are treated as official
   *               library images under the "library" namespace.
   * @param count - Maximum number of tags to return (default 10).
   * @returns An array of tag name strings.
   * @throws If the image is not found (404) or the API request fails.
   */
  async getImageTags(image: string, count: number = 10): Promise<string[]> {
    const { namespace, repository } = parseImageName(image);
    const url = `${DOCKER_HUB_API}/repositories/${namespace}/${repository}/tags?page_size=${count}&ordering=last_updated`;

    const headers: Record<string, string> = {
      "User-Agent": "deploycheck",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Docker image not found: ${namespace}/${repository}`);
      }
      const body = await response.text();
      throw new Error(`Docker Hub API error (${response.status}): ${body}`);
    }

    const data = (await response.json()) satisfies DockerHubTagsResponse;

    if (data.count === 0 || data.results.length === 0) {
      throw new Error(`No tags found for image: ${namespace}/${repository}`);
    }

    return data.results.map((tag: DockerHubTag) => tag.name);
  }
}

/**
 * Splits a Docker image name into its namespace and repository components.
 *
 * - Single-segment names (e.g. "nginx") are treated as official library images
 *   and mapped to the "library" namespace.
 * - Two-segment names (e.g. "myorg/myapp") use the first segment as the namespace.
 * - Anything with more than two segments is rejected — registry-prefixed names
 *   (e.g. "ghcr.io/org/repo") are not supported by Docker Hub.
 */
function parseImageName(image: string): {
  namespace: string;
  repository: string;
} {
  const parts = image.split("/");
  if (parts.length === 1) {
    return { namespace: "library", repository: parts[0] };
  }
  if (parts.length === 2) {
    return { namespace: parts[0], repository: parts[1] };
  }
  throw new Error(
    `Invalid Docker image name: ${image}. Expected format: [namespace/]repository`,
  );
}
