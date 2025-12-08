import type { ComponentType } from "react";

export interface ApplicationMetadata {
  id: string;
  name: string;
  type: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
}

export interface ApplicationRegistration {
  metadata: ApplicationMetadata;
  Routes: ComponentType;
}
