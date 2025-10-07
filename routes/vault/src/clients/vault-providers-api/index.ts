/**
 * Vault Provider API Client
 * 
 * This module handles fetching vault provider data.
 * Currently returns mock data, but structured to support GraphQL integration.
 */

export interface VaultProvider {
  id: string;
  name: string;
  icon: string;
  apy?: number;
  tvl?: string;
  description?: string;
}

export interface VaultProvidersResponse {
  providers: VaultProvider[];
}

/**
 * Fetch vault providers from backend
 * TODO: Implement GraphQL query when backend is ready
 * 
 * @returns Promise<VaultProvidersResponse>
 */
export async function getVaultProviders(): Promise<VaultProvidersResponse> {
  // TODO: Replace with actual GraphQL endpoint
  // Example GraphQL query:
  // query GetVaultProviders {
  //   vaultProviders {
  //     id
  //     name
  //     icon
  //     apy
  //     tvl
  //     description
  //   }
  // }

  // Mock data - will be replaced by GraphQL query
  const mockProviders: VaultProvider[] = [
    {
      id: "ironclad",
      name: "Ironclad BTC",
      icon: "/icons/ironclad.svg",
      apy: 8.5,
      tvl: "1.2M",
      description: "Secure Bitcoin custody with institutional-grade security"
    },
    {
      id: "atlas",
      name: "Atlas Custody",
      icon: "/icons/atlas.svg",
      apy: 7.8,
      tvl: "2.5M",
      description: "Regulated custody solution for digital assets"
    },
    {
      id: "stonewall",
      name: "Stonewall Capital",
      icon: "/icons/stonewall.svg",
      apy: 9.2,
      tvl: "850K",
      description: "High-yield Bitcoin vault provider"
    },
    {
      id: "redwood",
      name: "Redwood BTC",
      icon: "/icons/redwood.svg",
      apy: 8.0,
      tvl: "1.8M",
      description: "Enterprise-grade Bitcoin vault infrastructure"
    },
  ];

  return {
    providers: mockProviders,
  };
}