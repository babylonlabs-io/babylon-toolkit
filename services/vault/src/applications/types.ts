import type { ComponentType } from "react";

export type ApplicationType = "Lending" | "Staking" | "DEX";

export interface ApplicationMetadata {
  id: string;
  name: string;
  type: ApplicationType;
  description: string;
  logoUrl: string;
  websiteUrl: string;
}

export interface ApplicationRegistration {
  metadata: ApplicationMetadata;
  Routes: ComponentType;
}
