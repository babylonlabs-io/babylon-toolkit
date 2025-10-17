/**
 * Vault Indexer API Client
 *
 * REST API client for querying vault and market information from the Babylon vault indexer.
 *
 */

import { RestClient } from '../../utils/rest-client';
import type {
  Vault,
  VaultProvider,
  MorphoMarket,
} from './types';

export class VaultApiClient {
  private client: RestClient;

  constructor(baseUrl: string, timeout: number = 30000) {
    this.client = new RestClient({
      baseUrl,
      timeout,
    });
  }

  /**
   * Get all Morpho markets
   *
   * Fetches the list of available Morpho lending markets on Ethereum mainnet.
   * Markets define collateral/loan pairs (e.g., vBTC/USDC) with their parameters.
   *
   * @returns Array of Morpho market configurations
   * @throws RestClientError if request fails or times out
   *
   * @example
   * ```typescript
   * const client = new VaultApiClient('https://vault-api.example.com');
   * const markets = await client.getMarkets();
   *
   * markets.forEach(market => {
   *   console.log(`${market.collateralAsset.symbol}/${market.loanAsset.symbol}`);
   *   console.log(`LLTV: ${market.lltv}`);
   * });
   * ```
   */
  async getMarkets(): Promise<MorphoMarket[]> {
    return this.client.get<MorphoMarket[]>('/v1/markets');
  }

  /**
   * Get all registered vault providers
   *
   * Fetches the list of all vault providers that have registered with the system.
   * Each provider has a BTC public key and RPC URL for presigning operations.
   *
   * @returns Array of vault provider information
   * @throws RestClientError if request fails or times out
   *
   * @example
   * ```typescript
   * const client = new VaultApiClient('https://vault-api.example.com');
   * const providers = await client.getProviders();
   *
   * providers.forEach(provider => {
   *   console.log(`Provider: ${provider.id}`);
   *   console.log(`URL: ${provider.url}`);
   *   console.log(`BTC PubKey: ${provider.btc_pub_key}`);
   * });
   * ```
   */
  async getProviders(): Promise<VaultProvider[]> {
    return this.client.get<VaultProvider[]>('/v1/providers');
  }

  /**
   * Get vault details by ID
   *
   * Fetches detailed information about a specific vault including depositor,
   * borrowed amount, and minted vBTC amount.
   *
   * @param id - Vault ID (pegin transaction hash)
   * @returns Vault information
   * @throws RestClientError if vault not found or request fails
   *
   * @example
   * ```typescript
   * const client = new VaultApiClient('https://vault-api.example.com');
   * const vault = await client.getVault('0xabc123...');
   *
   * console.log(`Depositor: ${vault.depositor}`);
   * console.log(`vBTC: ${vault.vbtc_amount}`);
   * console.log(`Borrowed: ${vault.borrow_amount}`);
   * ```
   */
  async getVault(id: string): Promise<Vault> {
    return this.client.get<Vault>(`/v1/vault/${id}`);
  }
}
