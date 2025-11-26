export interface Application {
  id: string;
  name: string | null;
  registeredAt: string;
  blockNumber: string;
  transactionHash: string;
}

export interface ApplicationsResponse {
  applications: {
    items: Application[];
  };
}
