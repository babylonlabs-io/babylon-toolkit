/**
 * Value object representing a Bitcoin amount in satoshis.
 * Ensures the amount is valid and provides utility methods.
 */
export class BtcAmount {
  private readonly satoshis: bigint;

  constructor(satoshis: bigint | number) {
    this.satoshis = BigInt(satoshis);
    this.validate();
  }

  private validate(): void {
    if (this.satoshis < 0n) {
      throw new Error("BTC amount cannot be negative");
    }
  }

  get value(): bigint {
    return this.satoshis;
  }

  toBtc(): number {
    return Number(this.satoshis) / 100_000_000;
  }

  toFormattedBtc(decimals = 8): string {
    const btc = this.toBtc();
    return btc.toFixed(decimals);
  }

  isZero(): boolean {
    return this.satoshis === 0n;
  }

  isPositive(): boolean {
    return this.satoshis > 0n;
  }

  add(other: BtcAmount): BtcAmount {
    return new BtcAmount(this.satoshis + other.satoshis);
  }

  subtract(other: BtcAmount): BtcAmount {
    const result = this.satoshis - other.satoshis;
    if (result < 0n) {
      throw new Error("Cannot subtract: would result in negative amount");
    }
    return new BtcAmount(result);
  }

  isGreaterThan(other: BtcAmount): boolean {
    return this.satoshis > other.satoshis;
  }

  isLessThan(other: BtcAmount): boolean {
    return this.satoshis < other.satoshis;
  }

  equals(other: BtcAmount): boolean {
    return this.satoshis === other.satoshis;
  }

  static fromBtc(btc: number): BtcAmount {
    return new BtcAmount(Math.floor(btc * 100_000_000));
  }

  static zero(): BtcAmount {
    return new BtcAmount(0n);
  }
}
