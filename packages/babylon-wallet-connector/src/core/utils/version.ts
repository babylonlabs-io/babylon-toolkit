/**
 * Compares two semantic version strings to determine if the first version is less than the second.
 *
 * @param version - The version string to compare (e.g., "3.54.12")
 * @param compareTo - The version string to compare against (e.g., "3.54.13")
 * @returns true if version is less than compareTo, false otherwise
 *
 * @example
 * isVersionLessThan("3.54.11", "3.54.12") // returns true
 * isVersionLessThan("3.54.12", "3.54.12") // returns false
 */
export function isVersionLessThan(version: string, compareTo: string): boolean {
  const v1Parts = version.split(".").map((part) => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
  const v2Parts = compareTo.split(".").map((part) => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
  const maxLength = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < maxLength; i++) {
    const v1 = v1Parts[i] || 0;
    const v2 = v2Parts[i] || 0;
    if (v1 < v2) return true;
    if (v1 > v2) return false;
  }
  return false;
}
