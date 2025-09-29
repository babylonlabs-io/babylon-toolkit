# Routes

This folder contains route packages that define React components for different application routes. Unlike other packages in the monorepo, route packages are consumed as **source code** rather than built artifacts.

## Key Differences compared to `packages/`

| Aspect | `packages/` | `routes/` |
|--------|-------------|-----------|
| **Purpose** | Reusable libraries published to npm | Route-specific React components |
| **Consumption** | Built artifacts (dist/) | Source code (src/) |
| **Build Process** | Individual build step required | No build - bundled by consuming service |
| **Hot Reloading** | Requires rebuild for changes | Instant hot reload in development |
| **Distribution** | Published to npm registry | Internal workspace only |

## Architecture

```
routes/
├── README.md              # This file
├── vault/                 # Vault route package
│   ├── package.json       # Source code exports
│   ├── tsconfig.json      # TypeScript config (no path mapping)
│   ├── eslint.config.mjs  # Shared ESLint config
│   └── src/
│       ├── index.ts       # Main exports
│       └── VaultLayout.tsx # Route components
└── [future-route]/        # Additional routes...
```

## Usage

### Adding a New Route

1. **Create route package structure:**
   ```bash
   mkdir routes/my-route
   cd routes/my-route
   ```

2. **Setup package.json with source exports:**
   ```json
   {
     "name": "@routes/my-route",
     "main": "src/index.ts",
     "types": "src/index.ts",
     "exports": {
       ".": {
         "types": "./src/index.ts",
         "default": "./src/index.ts"
       }
     }
   }
   ```

3. **Add to service dependencies:**
   ```json
   // services/simple-staking/package.json
   {
     "dependencies": {
       "@routes/my-route": "*"
     }
   }
   ```

4. **Import and use:**
   ```typescript
   // services/simple-staking/src/ui/router.tsx
   import { MyRouteLayout } from "@routes/my-route";

   <Route path="my-route" element={<MyRouteLayout />} />
   ```

### Important Notes

- Route packages should use **relative imports** (no path mapping like `@/*`)
- No build step is needed - services bundle the source code directly