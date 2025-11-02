import { Deposit } from "../entities/Deposit";

/**
 * Repository interface for Deposit entities.
 * This interface defines the contract for data access without specifying implementation details.
 */
export interface IDepositRepository {
  /**
   * Save a deposit to the repository.
   */
  save(deposit: Deposit): Promise<void>;

  /**
   * Find a deposit by its ID.
   */
  findById(id: string): Promise<Deposit | null>;

  /**
   * Find all deposits for a specific depositor (by ETH address).
   */
  findByDepositor(ethAddress: string): Promise<Deposit[]>;

  /**
   * Find all deposits for a specific vault.
   */
  findByVault(vaultId: string): Promise<Deposit[]>;

  /**
   * Find deposits by their status.
   */
  findByStatus(status: string): Promise<Deposit[]>;

  /**
   * Find deposits by BTC transaction ID.
   */
  findByBtcTransaction(txId: string): Promise<Deposit | null>;

  /**
   * Update an existing deposit.
   */
  update(deposit: Deposit): Promise<void>;

  /**
   * Delete a deposit (soft delete recommended).
   */
  delete(id: string): Promise<void>;

  /**
   * Find deposits that need confirmation updates.
   */
  findPendingConfirmations(): Promise<Deposit[]>;
}
