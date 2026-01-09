export interface ApplicationMetadata {
  type: "Lending" | "Staking" | "DEX";
  description: string;
  logoUrl: string;
  name: string;
  websiteUrl: string;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidApplicationMetadata(
  meta: Partial<ApplicationMetadata> | null | undefined,
): meta is ApplicationMetadata {
  if (!meta) return false;

  const validTypes: Array<ApplicationMetadata["type"]> = [
    "Lending",
    "Staking",
    "DEX",
  ];

  return (
    typeof meta.name === "string" &&
    meta.name.length > 0 &&
    typeof meta.type === "string" &&
    validTypes.includes(meta.type as ApplicationMetadata["type"]) &&
    typeof meta.description === "string" &&
    meta.description.length > 0 &&
    meta.description.length <= 500 &&
    typeof meta.logoUrl === "string" &&
    isValidUrl(meta.logoUrl) &&
    typeof meta.websiteUrl === "string" &&
    isValidUrl(meta.websiteUrl)
  );
}

export const applicationMetadata: Record<string, ApplicationMetadata> = {};

export function getApplicationMetadata(
  controllerAddress: string,
): ApplicationMetadata | null {
  const normalized = controllerAddress.toLowerCase();
  const meta = applicationMetadata[normalized];
  return isValidApplicationMetadata(meta) ? meta : null;
}
