# Ledger Provider

Ledger hardware wallet integration for Babylon BTC staking.

## Requirements

- **Ledger Babylon App firmware version 2.0 or higher**
- WebUSB or WebHID support in browser
- Ledger device connected via USB

## Usage Examples

### Default Native SegWit (purpose 84), index = 0

```typescript
const provider = new LedgerProvider(wallet, config);
await provider.connectWallet();
```

### Native SegWit with custom address index

```typescript
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ addressIndex: 5 });
await provider.connectWallet();
```

### Taproot (purpose 86), index = 0

```typescript
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ purpose: 86 });
await provider.connectWallet();
```

### Taproot with custom address index

```typescript
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ purpose: 86, addressIndex: 2 });
await provider.connectWallet();
```

## API Reference

### `setDerivationConfig(config: Partial<DerivationConfig>)`

Set the derivation configuration before connecting.

**Parameters:**
- `purpose`: `84` (Native SegWit) or `86` (Taproot). Default: `84`
- `addressIndex`: The address index to use. Default: `0`

### `getDerivationConfig(): DerivationConfig`

Get the current derivation configuration.

**Returns:**
- `{ purpose: 84 | 86, addressIndex: number }`

## Derivation Paths

| Purpose | Address Type | Path Format | Example (Mainnet) |
|---------|--------------|-------------|-------------------|
| 84 | Native SegWit (wpkh) | m/84'/0'/0' | m/84'/0'/0'/0/0 |
| 86 | Taproot (tr) | m/86'/0'/0' | m/86'/0'/0'/0/0 |

---

## Testing

### Unit Tests

Unit tests verify the derivation path logic and contract validation without requiring hardware.

```bash
# Run unit tests
pnpm run test:unit

# Run specific Ledger tests
pnpm exec playwright test tests/unit/ledger --project=unit
```

**What's tested:**
- Derivation path generation for different networks and purposes
- DerivationConfig getter/setter behavior
- Policy template selection (wpkh vs tr)
- Contract parameter extraction and validation
- Firmware version validation logic

### Hardware Testing (Manual)

Hardware tests require a physical Ledger device with the Babylon app installed.

#### Prerequisites

1. **Ledger Device**: Nano X, Nano S+, Stax, or Flex
2. **Babylon App**: Version 2.0+ installed via Ledger Live
3. **Browser**: Chrome or Edge with WebUSB/WebHID support
4. **Test Environment**: Local development server running

#### Hardware Test Checklist

##### 1. Connection Test

```typescript
// Test: Device connects and firmware version is detected
const provider = new LedgerProvider(wallet, config);
await provider.connectWallet();
const address = await provider.getAddress();
console.log("Connected address:", address);
```

**Expected:**
- Device prompts for approval
- Address is displayed on device and returned
- No errors thrown

##### 2. Native SegWit Address Test

```typescript
// Test: Native SegWit address generation
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ purpose: 84 });
await provider.connectWallet();
const address = await provider.getAddress();
// Address should start with 'bc1q' (mainnet) or 'tb1q' (testnet)
```

##### 3. Taproot Address Test

```typescript
// Test: Taproot address generation
const provider = new LedgerProvider(wallet, config);
provider.setDerivationConfig({ purpose: 86 });
await provider.connectWallet();
const address = await provider.getAddress();
// Address should start with 'bc1p' (mainnet) or 'tb1p' (testnet)
```

##### 4. Message Signing Test

```typescript
// Test: Sign a message
const provider = new LedgerProvider(wallet, config);
await provider.connectWallet();
const signature = await provider.signMessage("Test message for Babylon");
console.log("Signature:", signature);
```

**Expected:**
- Device shows message for approval
- Signature is returned in base64 format

##### 5. PSBT Signing Test

```typescript
// Test: Sign a staking transaction PSBT
const provider = new LedgerProvider(wallet, config);
await provider.connectWallet();
const signedPsbt = await provider.signPsbt(psbtHex, {
  contracts: [stakingContract],
  action: { name: ActionName.SIGN_BTC_STAKING_TRANSACTION },
});
console.log("Signed PSBT:", signedPsbt);
```

**Expected:**
- Device shows transaction details for approval
- Signed PSBT hex is returned

##### 6. Firmware Version Check Test

```typescript
// Test: Reject firmware version below 2
// Use a device with Babylon app v1.x (if available)
const provider = new LedgerProvider(wallet, config);
try {
  await provider.connectWallet();
} catch (error) {
  // Should throw: "Ledger firmware version too low"
}
```

#### Using Speculos Emulator (Advanced)

For automated hardware testing without a physical device, use the [Speculos](https://github.com/LedgerHQ/speculos) emulator:

```bash
# Install Speculos
pip install speculos

# Run emulator with Babylon app
speculos --model nanox ./path/to/babylon-app.elf --api-port 5000

# Configure provider to use emulator (development only)
# Note: Requires custom transport implementation
```

#### Test Results Documentation

When performing hardware tests, document:

| Test Case | Device Model | App Version | Network | Result | Notes |
|-----------|--------------|-------------|---------|--------|-------|
| Connection | Nano X | 2.0.0 | Testnet | ✅ Pass | |
| Native SegWit | Nano X | 2.0.0 | Testnet | ✅ Pass | tb1q... |
| Taproot | Nano X | 2.0.0 | Testnet | ✅ Pass | tb1p... |
| Sign Message | Nano X | 2.0.0 | Testnet | ✅ Pass | |
| Sign PSBT | Nano X | 2.0.0 | Testnet | ✅ Pass | |

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Ledger firmware version too low" | App version < 2.0 | Update Babylon app via Ledger Live |
| "Could not connect to Ledger device" | USB/HID connection failed | Check USB connection, try different port |
| "Transport is required to sign psbt" | Device disconnected | Reconnect device and retry |
| "Contracts are required to sign psbt" | Missing contract data | Ensure contracts are passed in options |

### Browser Compatibility

| Browser | WebUSB | WebHID | Notes |
|---------|--------|--------|-------|
| Chrome | ✅ | ✅ | Recommended |
| Edge | ✅ | ✅ | Works well |
| Firefox | ❌ | ❌ | Not supported |
| Safari | ❌ | ❌ | Not supported |
