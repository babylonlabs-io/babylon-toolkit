# Packages

This folder contains reusable library packages that are **built as distributable artifacts** and published to npm. These packages provide shared functionality across the Babylon ecosystem.

## Package Architecture

```
packages/
├── README.md                           # This file
├── babylon-core-ui/                    # Shared UI components
│   ├── package.json                    # Build artifacts exports
│   ├── tsconfig.json                    # Library build config for your IDE
│   ├── tsconfig.lib.json                # Library build config for the build process and type checking
│   ├── vite.config.ts                   # Bundle configuration
│   ├── src/                            # Source code
│   └── dist/                           # Built artifacts (generated)
├── babylon-wallet-connector/           # Wallet integration
└── babylon-proto-ts/                   # Protocol definitions
```

## Usage

### Consuming Packages

```typescript
// In services or other packages
import { Card, Button } from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import type { StakingParams } from "@babylonlabs-io/babylon-proto-ts";
```

### Adding Dependencies

```json
// services/simple-staking/package.json
{
  "dependencies": {
    "@babylonlabs-io/core-ui": "workspace:*",
    "@babylonlabs-io/wallet-connector": "workspace:*"
  }
}
```

### Development Workflow

1. **Make changes** to package source code
2. **Build package**: `npm run build` (generates dist/)
3. **Test locally**: Changes will need to be rebuilt to be reflected in consuming packages
4. **Release**: Semantic release handles versioning and npm publishing

### Creating a New Package

1. **Create package structure:**
   ```bash
   mkdir packages/my-package
   cd packages/my-package
   ```

2. **Setup package.json with build exports:**
   ```json
   {
     "name": "@babylonlabs-io/my-package",
     "main": "dist/index.cjs.js",
     "types": "dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "require": "./dist/index.cjs.js",
         "import": "./dist/index.es.js"
       }
     }
   }
   ```

3. **Configure build process** (Vite, TypeScript, etc.)

4. **Add to nx release configuration** for publishing

### Important Notes

- Packages export **built artifacts** from `dist/` directory
- Follow semantic versioning for breaking changes
- Each package should have its own build and test configuration
- Packages can depend on other packages in the monorepo