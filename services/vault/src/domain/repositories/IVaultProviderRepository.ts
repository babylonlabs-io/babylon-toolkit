import { VaultProvider } from "../value-objects/VaultProvider";

/**
 * Repository interface for VaultProvider entities.
 */
export interface IVaultProviderRepository {
  /**
   * Find all available vault providers.
   */
  findAll(): Promise<VaultProvider[]>;

  /**
   * Find a vault provider by ID.
   */
  findById(id: string): Promise<VaultProvider | null>;

  /**
   * Find vault providers by BTC public key.
   */
  findByBtcPublicKey(publicKey: string): Promise<VaultProvider | null>;

  /**
   * Find active vault providers.
   */
  findActive(): Promise<VaultProvider[]>;
}
