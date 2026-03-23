# Contributing

bbn-toolkit repository follows the same contributing rules as
[Babylon node](https://github.com/babylonlabs-io/babylon/blob/main/CONTRIBUTING.md)
repository.

# Getting Started

## Prerequisites
- Node.js (version 24.2.0 - see `.nvmrc`)
- pnpm (managed via Corepack)

### Setup

1. **Enable Corepack** (if using Node.js 24 or earlier, Corepack is bundled):
   ```bash
   corepack enable
   ```

2. **For Node.js 25+** (Corepack is not bundled), install it first:
   ```bash
   npm install -g corepack
   corepack enable
   ```

3. **Install dependencies** (must be run from the workspace root):
   ```bash
   pnpm install
   ```

**Important:** Always run `pnpm install` from the workspace root, not from individual package directories. The project will automatically enforce this.

### Build

To build the whole repository, run:

```bash
pnpm run build
```

### Linting

To run the linter, use the following command:

```bash
pnpm run lint
```

### Testing

To run tests for all packages:

```bash
pnpm run test
```

## Use nx command to learn the project dependency graph and available commands

```bash
pnpm exec nx graph
```

## Running build of a specific package

To build a specific package, use the following command:
```bash
pnpm exec nx build @babylonlabs-io/core-ui
```

Similarly, you can run tests or lint for a specific package:

```bash
pnpm exec nx test @babylonlabs-io/core-ui
pnpm exec nx lint @babylonlabs-io/core-ui
```

## Release

We use conventional commits to manage releases. To make sure a release happens, you need to follow the commit message format. For more information, refer to the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

Note: When we squash commits on Github, there is no way for us to validate the commit message. So please make sure you follow the commit message format before you squash and merge commits.

### Release tag for new package

In order to release a new package or migrated package, a release tag will need to be added and pushed to remote so that the release process can figure out the next version to release.
This is only a one time setup for each newly added package. Release process will continue creating new release tags after that.

For a new package, do
```
git tag @babylonlabs-io/my-package/0.0.1
git push origin @babylonlabs-io/my-package/0.0.1
```

For a migrated package, make sure the tag version matches the released version in NPM
```
git tag @babylonlabs-io/my-package/1.2.3
git push origin @babylonlabs-io/my-package/1.2.3
```

### SDK Release Workflow

The `@babylonlabs-io/ts-sdk` and `@babylonlabs-io/babylon-tbv-rust-wasm` packages follow an independent release cycle, decoupled from the vault frontend.

#### How releases work

| Trigger | What happens | npm tag |
|---------|-------------|---------|
| Push to `main` with conventional commit | CI auto-publishes next stable version (e.g., `0.2.0`) | `latest` |
| Manual workflow dispatch from a branch | Publishes a release candidate (e.g., `0.2.0-rc.0`) | `next` |

#### Stable releases (automatic)

Merging a PR to `main` that touches `packages/babylon-ts-sdk/` or `packages/babylon-tbv-rust-wasm/` with a conventional commit prefix (`feat:`, `fix:`) triggers the CI pipeline to publish a new stable version automatically.

#### Release candidates (manual)

Use RCs to test SDK changes against the vault frontend before merging to `main`:

1. Create a feature branch and make your SDK changes
2. Go to **Actions → "Package RC Release" → Run workflow**
3. Select the branch, package, and pre-release identifier (default: `rc`)
4. The RC is published to npm with the `next` tag (e.g., `0.2.0-rc.0`)
5. In the vault frontend, temporarily pin to the RC version to test:
   ```json
   "@babylonlabs-io/ts-sdk": "0.2.0-rc.0"
   ```
6. Run `pnpm install` and verify the integration
7. Once validated, merge the SDK branch to `main` → CI publishes stable `0.2.0`
8. Update vault to the stable version

#### Consuming SDK in the vault frontend

The vault frontend pins to a specific SDK version (not `workspace:*`). To upgrade:

1. Update the version in `services/vault/package.json`
2. Run `pnpm install` to update the lockfile
3. Test and submit a PR
