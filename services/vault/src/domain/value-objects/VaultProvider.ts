/**
 * Value object representing a vault provider.
 */
export class VaultProvider {
  constructor(
    private readonly id: string,
    private readonly btcPublicKey: string,
    private readonly name: string,
    private readonly description?: string,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error("Vault provider ID cannot be empty");
    }
    if (!this.btcPublicKey || this.btcPublicKey.trim().length === 0) {
      throw new Error("Vault provider BTC public key cannot be empty");
    }
    if (!this.name || this.name.trim().length === 0) {
      throw new Error("Vault provider name cannot be empty");
    }
    // Basic validation for BTC public key format (hex string)
    if (!/^[a-fA-F0-9]{64,66}$/.test(this.btcPublicKey.replace(/^0x/, ""))) {
      throw new Error("Invalid BTC public key format");
    }
  }

  getId(): string {
    return this.id;
  }

  getBtcPublicKey(): string {
    return this.btcPublicKey;
  }

  getName(): string {
    return this.name;
  }

  getDescription(): string | undefined {
    return this.description;
  }

  equals(other: VaultProvider): boolean {
    return this.id === other.id && this.btcPublicKey === other.btcPublicKey;
  }
}
