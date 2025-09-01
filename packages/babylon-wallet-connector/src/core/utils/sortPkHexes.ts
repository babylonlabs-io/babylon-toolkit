export const sortPkHexes = (pkHexes: string[]): string[] => {
  return pkHexes
    .map((pk) => Buffer.from(pk, "hex"))
    .sort(Buffer.compare)
    .map((pk) => pk.toString("hex"));
};
