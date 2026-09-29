/** Case-insensitive equality for hex strings (ids, hashes, addresses). */
export function sameHex(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
