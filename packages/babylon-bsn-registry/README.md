# @babylonlabs-io/bsn-registry

A registry of BSN information for the Babylon Super App, supporting both testnet and mainnet environments.

## Installation

```bash
npm install @babylonlabs-io/bsn-registry
```

## Usage

```typescript
import {
  testnetRegistry,
  mainnetRegistry,
  getRegistry,
  BSNRegistry,
  BSNEntry
} from '@babylonlabs-io/bsn-registry';

// Access testnet BSN entries
const testnetBsnDevnet1: BSNEntry = testnetRegistry['bsn-devnet-1'];
console.log(testnetBsnDevnet1.rpcUrl); // "https://rpc.bsn-devnet.babylonlabs.io/"

// Access mainnet BSN entries
const mainnetBsnBbn1: BSNEntry = mainnetRegistry['bbn-1'];
console.log(mainnetBsnBbn1.rpcUrl); // "https://rpc-dapp.babylonlabs.io"

// Use the helper function to get registry by environment
const registry = getRegistry('testnet'); // or 'mainnet'
const bsnEntry = registry['bsn-devnet-1'];

// Iterate over all BSNs in a specific environment
Object.entries(testnetRegistry).forEach(([bsnId, entry]) => {
  console.log(`Testnet BSN ${bsnId}: ${entry.rpcUrl}`);
});
```

## Data Structure

Each BSN entry contains:
- `logoUrl`: URL to the BSN's logo image (GitHub raw URL)
- `rpcUrl`: RPC endpoint URL for the BSN (environment-specific)

## Environments

- **Testnet**: Use `testnetRegistry` or `getRegistry('testnet')` for testnet BSNs
- **Mainnet**: Use `mainnetRegistry` or `getRegistry('mainnet')` for mainnet BSNs

## Contributing

We welcome contributions to add new BSN entries to the registry! To add a new BSN:

### Adding a New BSN Entry

1. **Register your BSN** with the Babylon node first to get your official BSN ID
2. **Fork the repository** and create a new branch
3. **Add your icon to the repository**:
   - Place your logo at `packages/babylon-bsn-registry/images/<your-official-bsn-id>/logo.svg` (preferred) or `logo.png`.
   - SVG preferred; if PNG, use at least 256x256.
4. **Edit the registry files**: Update `src/testnet.json` and/or `src/mainnet.json` to add your BSN entry.
5. **Use GitHub raw URL for logoUrl**:
   ```json
   "your-official-bsn-id": {
     "logoUrl": "https://raw.githubusercontent.com/babylonlabs-io/babylon-toolkit/main/packages/babylon-bsn-registry/images/your-official-bsn-id/logo.svg",
     "rpcUrl": "https://rpc.your-bsn.com"
   }
   ```
6. **Use your official BSN ID**: The BSN ID must match exactly what was assigned during Babylon node registration
7. **Provide environment-specific URLs**: Ensure RPC URLs are correct for each environment
8. **Run validation** locally before opening a PR:
   ```bash
   npm --prefix packages/babylon-bsn-registry run validate-images
   ```
9. **Submit a Pull Request** with a clear description of the BSN being added

### Guidelines

- **BSN ID**: Must be the official BSN ID assigned during Babylon node registration (e.g., `bsn-001`, `bsn-company-name`).
- **Logo Requirements**:
  - Store the image in this repo under `packages/babylon-bsn-registry/images/<bsn-id>/`.
  - Use `logo.svg` (preferred) or `logo.png`.
  - PNG should be ≥ 256x256. Keep file size reasonable (< 100KB if possible).
  - `logoUrl` must use GitHub raw: `https://raw.githubusercontent.com/babylonlabs-io/babylon-toolkit/main/packages/babylon-bsn-registry/images/<bsn-id>/logo.(svg|png)`.
- **RPC URL**: Must be a valid, accessible RPC endpoint (different for testnet/mainnet).
