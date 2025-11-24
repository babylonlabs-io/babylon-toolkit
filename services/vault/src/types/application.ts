export interface Application {
  id: string;
  name: string | null;
  type: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  registeredAt: string;
}

export interface ApplicationsResponse {
  applications: {
    items: Application[];
  };
}
