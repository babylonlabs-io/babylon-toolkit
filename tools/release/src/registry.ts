/**
 * Read-only npm registry access for the pre-publish gate. Every failure other
 * than "this package does not exist" throws, so a registry outage blocks the
 * release rather than waving a possibly-broken manifest through.
 */

/** The abbreviated packument. Public, unauthenticated, and far smaller than the full document. */
const ABBREVIATED_PACKUMENT_ACCEPT = 'application/vnd.npm.install-v1+json';

const NOT_FOUND_STATUS = 404;

/**
 * Bounds a registry that accepts the connection and then never answers. Without
 * it the release job hangs until the CI step limit kills it, with no error.
 */
const REQUEST_TIMEOUT_MS = 30_000;

export interface RegistryClient {
  /** Every published version, or null when the registry has no such package. */
  fetchPublishedVersions(packageName: string): Promise<readonly string[] | null>;
}

export const createRegistryClient = (registryUrl: string): RegistryClient => {
  const baseUrl = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`;

  /**
   * Rejections are cached as deliberately as successes: this gate fails closed,
   * so one unanswered lookup must not become a second chance on retry within
   * the same run.
   */
  const answers = new Map<string, Promise<readonly string[] | null>>();

  return {
    fetchPublishedVersions(packageName) {
      const cached = answers.get(packageName);
      if (cached) return cached;

      const pending = requestPublishedVersions(baseUrl, packageName);
      answers.set(packageName, pending);
      return pending;
    },
  };
};

const requestPublishedVersions = async (
  baseUrl: string,
  packageName: string
): Promise<readonly string[] | null> => {
  const url = `${baseUrl}${encodeURIComponent(packageName)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: ABBREVIATED_PACKUMENT_ACCEPT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new Error(
      `Could not reach ${url} to check which versions of ${packageName} are published. The release cannot verify its dependency pins, so it is stopping here.`,
      { cause }
    );
  }

  if (response.status === NOT_FOUND_STATUS) return null;

  if (!response.ok) {
    throw new Error(
      `${url} answered ${response.status} ${response.statusText} while checking which versions of ${packageName} are published. The release cannot verify its dependency pins, so it is stopping here.`
    );
  }

  let packument: unknown;
  try {
    packument = await response.json();
  } catch (cause) {
    throw new Error(
      `${url} returned a body that is not JSON while checking which versions of ${packageName} are published.`,
      { cause }
    );
  }

  const versions = (packument as { versions?: unknown }).versions;
  if (typeof versions !== 'object' || versions === null) {
    throw new Error(
      `${url} returned a packument for ${packageName} with no "versions" map, so the published versions cannot be determined.`
    );
  }

  return Object.keys(versions);
};
