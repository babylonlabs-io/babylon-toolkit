import { vaultApiClient } from "../../clients/vault-api";
import { Deposit } from "../../domain/entities/Deposit";
import { IDepositRepository } from "../../domain/repositories/IDepositRepository";
import { BtcAmount } from "../../domain/value-objects/BtcAmount";
import { DepositStatus } from "../../domain/value-objects/DepositStatus";
import { VaultProvider } from "../../domain/value-objects/VaultProvider";

/**
 * Implementation of IDepositRepository using the Vault API and local storage.
 * In a production environment, this would connect to a database or API.
 */
export class DepositRepository implements IDepositRepository {
  // In-memory storage for demonstration
  // In production, this would be replaced with database calls
  private deposits: Map<string, Deposit> = new Map();

  async save(deposit: Deposit): Promise<void> {
    // In production: save to database or API
    this.deposits.set(deposit.getId(), deposit);

    // You could also call the vault API here to persist
    // await vaultApiClient.createDeposit(DepositMapper.toDTO(deposit));
  }

  async findById(id: string): Promise<Deposit | null> {
    // Check in-memory storage first
    const deposit = this.deposits.get(id);
    if (deposit) {
      return deposit;
    }

    // In production: query database or API
    try {
      const vault = await vaultApiClient.getVault(id);
      if (!vault) {
        return null;
      }

      // Convert API response to domain entity
      // Note: This is simplified - you'd need to map the vault data properly
      return this.convertVaultToDeposit(vault);
    } catch (error) {
      console.error(`Failed to find deposit ${id}:`, error);
      return null;
    }
  }

  async findByDepositor(ethAddress: string): Promise<Deposit[]> {
    // Filter in-memory deposits
    const deposits: Deposit[] = [];
    this.deposits.forEach((deposit) => {
      if (deposit.getDepositorEthAddress() === ethAddress) {
        deposits.push(deposit);
      }
    });

    // In production: query database or API
    // const apiDeposits = await vaultApiClient.getDepositsByDepositor(ethAddress);
    // return apiDeposits.map(this.convertToDeposit);

    return deposits;
  }

  async findByVault(vaultId: string): Promise<Deposit[]> {
    const deposits: Deposit[] = [];
    this.deposits.forEach((deposit) => {
      if (deposit.getVaultId() === vaultId) {
        deposits.push(deposit);
      }
    });
    return deposits;
  }

  async findByStatus(status: string): Promise<Deposit[]> {
    const deposits: Deposit[] = [];
    this.deposits.forEach((deposit) => {
      if (deposit.getStatus().getState() === status) {
        deposits.push(deposit);
      }
    });
    return deposits;
  }

  async findByBtcTransaction(txId: string): Promise<Deposit | null> {
    for (const deposit of this.deposits.values()) {
      if (deposit.getBtcTransactionId() === txId) {
        return deposit;
      }
    }
    return null;
  }

  async update(deposit: Deposit): Promise<void> {
    this.deposits.set(deposit.getId(), deposit);

    // In production: update in database or API
    // await vaultApiClient.updateDeposit(deposit.getId(), DepositMapper.toDTO(deposit));
  }

  async delete(id: string): Promise<void> {
    this.deposits.delete(id);

    // In production: soft delete in database
    // await vaultApiClient.deleteDeposit(id);
  }

  async findPendingConfirmations(): Promise<Deposit[]> {
    const pending: Deposit[] = [];
    this.deposits.forEach((deposit) => {
      const status = deposit.getStatus();
      if (status.isPending() || status.isConfirming()) {
        pending.push(deposit);
      }
    });
    return pending;
  }

  /**
   * Helper method to convert vault API response to Deposit entity.
   * This is a simplified version - in production you'd have proper mapping.
   */
  private convertVaultToDeposit(vault: any): Deposit {
    // This would need proper implementation based on actual API response
    // For now, creating a mock deposit
    const mockProvider = new VaultProvider(
      "provider-1",
      "0x1234567890abcdef1234567890abcdef12345678",
      "Default Provider",
      "Default vault provider",
    );

    return new Deposit(
      vault.id,
      vault.id, // Using vault ID as both
      vault.depositor,
      "bc1q...", // Would need actual BTC address
      new BtcAmount(BigInt(vault.vbtc_amount || 0)),
      [mockProvider],
      DepositStatus.confirmed(),
      vault.id, // BTC tx ID
      undefined, // ETH tx hash
      new Date(),
      new Date(),
    );
  }
}
