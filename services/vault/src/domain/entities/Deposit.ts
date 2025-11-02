import {
  InvalidDepositError,
  InvalidDepositOperationError,
} from "../errors/DomainError";
import { BtcAmount } from "../value-objects/BtcAmount";
import { DepositStatus } from "../value-objects/DepositStatus";
import { VaultProvider } from "../value-objects/VaultProvider";

/**
 * Deposit entity representing a Bitcoin deposit in a vault.
 */
export class Deposit {
  constructor(
    private readonly id: string,
    private readonly vaultId: string,
    private readonly depositorEthAddress: string,
    private readonly depositorBtcAddress: string,
    private readonly amount: BtcAmount,
    private readonly providers: VaultProvider[],
    private status: DepositStatus,
    private readonly btcTransactionId?: string,
    private readonly ethTransactionHash?: string,
    private readonly createdAt: Date = new Date(),
    private updatedAt: Date = new Date(),
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new InvalidDepositError("Deposit ID cannot be empty");
    }
    if (!this.vaultId || this.vaultId.trim().length === 0) {
      throw new InvalidDepositError("Vault ID cannot be empty");
    }
    if (
      !this.depositorEthAddress ||
      this.depositorEthAddress.trim().length === 0
    ) {
      throw new InvalidDepositError("Depositor ETH address cannot be empty");
    }
    if (
      !this.depositorBtcAddress ||
      this.depositorBtcAddress.trim().length === 0
    ) {
      throw new InvalidDepositError("Depositor BTC address cannot be empty");
    }
    if (!this.amount.isPositive()) {
      throw new InvalidDepositError("Deposit amount must be positive");
    }
    if (!this.providers || this.providers.length === 0) {
      throw new InvalidDepositError("At least one vault provider is required");
    }
  }

  // Getters
  getId(): string {
    return this.id;
  }

  getVaultId(): string {
    return this.vaultId;
  }

  getDepositorEthAddress(): string {
    return this.depositorEthAddress;
  }

  getDepositorBtcAddress(): string {
    return this.depositorBtcAddress;
  }

  getAmount(): BtcAmount {
    return this.amount;
  }

  getProviders(): VaultProvider[] {
    return [...this.providers]; // Return copy to maintain immutability
  }

  getStatus(): DepositStatus {
    return this.status;
  }

  getBtcTransactionId(): string | undefined {
    return this.btcTransactionId;
  }

  getEthTransactionHash(): string | undefined {
    return this.ethTransactionHash;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // Business logic methods
  canRedeem(): boolean {
    return this.status.canRedeem();
  }

  isConfirmed(): boolean {
    return this.status.isConfirmed();
  }

  isPending(): boolean {
    return this.status.isPending();
  }

  updateConfirmations(confirmations: number): void {
    const newStatus = this.status.withConfirmations(confirmations);
    if (!newStatus.equals(this.status)) {
      this.status = newStatus;
      this.updatedAt = new Date();
    }
  }

  markAsRedeemed(): void {
    if (!this.canRedeem()) {
      throw new InvalidDepositOperationError(
        `Cannot redeem deposit in status: ${this.status.getState()}`,
      );
    }
    this.status = DepositStatus.redeemed();
    this.updatedAt = new Date();
  }

  markAsFailed(): void {
    // TODO: In the future, we might want to store the failure reason
    if (this.status.isRedeemed()) {
      throw new InvalidDepositOperationError(
        "Cannot mark redeemed deposit as failed",
      );
    }
    this.status = DepositStatus.failed();
    this.updatedAt = new Date();
  }

  hasProvider(providerId: string): boolean {
    return this.providers.some((p) => p.getId() === providerId);
  }

  equals(other: Deposit): boolean {
    return this.id === other.id;
  }

  // Factory method for creating a new deposit
  static create(params: {
    id: string;
    vaultId: string;
    depositorEthAddress: string;
    depositorBtcAddress: string;
    amountSat: bigint;
    providers: VaultProvider[];
    btcTransactionId?: string;
    ethTransactionHash?: string;
  }): Deposit {
    return new Deposit(
      params.id,
      params.vaultId,
      params.depositorEthAddress,
      params.depositorBtcAddress,
      new BtcAmount(params.amountSat),
      params.providers,
      DepositStatus.pending(),
      params.btcTransactionId,
      params.ethTransactionHash,
    );
  }
}
