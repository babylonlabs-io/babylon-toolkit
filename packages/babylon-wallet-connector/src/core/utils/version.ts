/**
 * Compares two semantic version strings.
 * @param version1 - The first version string to compare (e.g., "3.54.12")
 * @param version2 - The second version string to compare (e.g., "3.54.12")
 * @returns A number indicating the comparison result:
 *          - Returns 1 if version1 > version2
 *          - Returns -1 if version1 < version2
 *          - Returns 0 if version1 === version2
 */
export const compareVersions = (version1: string, version2: string): number => {
  const parts1 = version1.split(".").map((part) => {
    const num = parseInt(part, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid version format: ${version1}`);
    }
    return num;
  });
  const parts2 = version2.split(".").map((part) => {
    const num = parseInt(part, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid version format: ${version2}`);
    }
    return num;
  });

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
};
