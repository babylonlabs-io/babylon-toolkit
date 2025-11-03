/**
 * Value object representing the status of a deposit.
 */
export enum DepositState {
  PENDING = "PENDING",
  CONFIRMING = "CONFIRMING",
  CONFIRMED = "CONFIRMED",
  REDEEMED = "REDEEMED",
  FAILED = "FAILED",
}

export class DepositStatus {
  constructor(
    private readonly state: DepositState,
    private readonly confirmations: number = 0,
    private readonly requiredConfirmations: number = 6,
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.confirmations < 0) {
      throw new Error("Confirmations cannot be negative");
    }
    if (this.requiredConfirmations < 1) {
      throw new Error("Required confirmations must be at least 1");
    }
  }

  getState(): DepositState {
    return this.state;
  }

  getConfirmations(): number {
    return this.confirmations;
  }

  getRequiredConfirmations(): number {
    return this.requiredConfirmations;
  }

  isPending(): boolean {
    return this.state === DepositState.PENDING;
  }

  isConfirming(): boolean {
    return this.state === DepositState.CONFIRMING;
  }

  isConfirmed(): boolean {
    return this.state === DepositState.CONFIRMED;
  }

  isRedeemed(): boolean {
    return this.state === DepositState.REDEEMED;
  }

  isFailed(): boolean {
    return this.state === DepositState.FAILED;
  }

  canRedeem(): boolean {
    return this.state === DepositState.CONFIRMED;
  }

  withConfirmations(confirmations: number): DepositStatus {
    let newState = this.state;

    if (this.state === DepositState.PENDING && confirmations > 0) {
      newState = DepositState.CONFIRMING;
    } else if (confirmations >= this.requiredConfirmations) {
      newState = DepositState.CONFIRMED;
    }

    return new DepositStatus(
      newState,
      confirmations,
      this.requiredConfirmations,
    );
  }

  equals(other: DepositStatus): boolean {
    return (
      this.state === other.state &&
      this.confirmations === other.confirmations &&
      this.requiredConfirmations === other.requiredConfirmations
    );
  }

  static pending(): DepositStatus {
    return new DepositStatus(DepositState.PENDING);
  }

  static confirming(confirmations: number, required = 6): DepositStatus {
    return new DepositStatus(DepositState.CONFIRMING, confirmations, required);
  }

  static confirmed(): DepositStatus {
    return new DepositStatus(DepositState.CONFIRMED, 6, 6);
  }

  static redeemed(): DepositStatus {
    return new DepositStatus(DepositState.REDEEMED);
  }

  static failed(): DepositStatus {
    return new DepositStatus(DepositState.FAILED);
  }
}
