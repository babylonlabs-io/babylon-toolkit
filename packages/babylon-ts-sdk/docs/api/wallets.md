[@babylonlabs-io/ts-sdk](README.md) / wallets

# wallets

Framework-agnostic BTC wallet interface. ETH uses viem's `WalletClient` directly.

See the [Wallet Interfaces Guide](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/guides/wallet-interfaces.md)
for adapter patterns and the planned `deriveContextHash` method.

## Type Aliases

### Hash

```ts
type Hash = `0x${string}`;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/EthereumWallet.ts:5](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/EthereumWallet.ts#L5)

Ethereum transaction hash type (hex string with 0x prefix).
Alias for viem's Hex type, provided for convenience.

## References

### BitcoinNetwork

Re-exports [BitcoinNetwork](managers.md#bitcoinnetwork)

***

### BitcoinWallet

Re-exports [BitcoinWallet](managers.md#bitcoinwallet)

***

### SignInputOptions

Re-exports [SignInputOptions](managers.md#signinputoptions)

***

### SignPsbtOptions

Re-exports [SignPsbtOptions](managers.md#signpsbtoptions)

## Variables

### BitcoinNetworks

```ts
const BitcoinNetworks: object;
```

Defined in: [packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts:10](../../packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts#L10)

Bitcoin network constants

#### Type Declaration

##### MAINNET

```ts
readonly MAINNET: "mainnet" = "mainnet";
```

##### TESTNET

```ts
readonly TESTNET: "testnet" = "testnet";
```

##### SIGNET

```ts
readonly SIGNET: "signet" = "signet";
```
