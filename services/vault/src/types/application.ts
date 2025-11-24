export interface Application {
  id: string;
  name: string | null;
  type: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  registeredAt: string;
}

export interface ApplicationsResponse {
  applications: {
    items: Application[];
  };
}
