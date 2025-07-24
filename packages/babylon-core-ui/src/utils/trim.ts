/**
 * Trims a string to a specified number of characters from the start and end
 * @param value - The string to trim
 * @param symbols - Number of characters to show from start and end (default: 8)
 * @returns Trimmed string with ellipsis in the middle
 */
export function trim(value: string, symbols: number = 8): string {
  if (!value || value.length <= symbols * 2) {
    return value;
  }
  
  const start = value.slice(0, symbols);
  const end = value.slice(-symbols);
  
  return `${start}...${end}`;
}
