/**
 * TypeDoc plugin for customizing the generated API documentation
 *
 * This plugin adds helpful navigation and context to the auto-generated
 * API documentation, making it easier for developers to find what they need.
 */
export function load(app) {
  // Add description and quick links at the beginning of the index page
  app.renderer.markdownHooks.on("index.page.begin", () => {
    return `> Auto-generated from TSDoc using [TypeDoc](https://typedoc.org/)

## Quick Links

| Guide | Description |
|-------|-------------|
| **[Troubleshooting](../get-started/troubleshooting.md)** | Common issues and solutions |
| **[Quickstart: Primitives](../quickstart/primitives.md)** | Complete working example with primitives |
| **[Quickstart: Managers](../quickstart/managers.md)** | Complete working example with managers |

## Modules Overview

| Module | Level | Description |
|--------|-------|-------------|
| **[primitives](primitives.md)** | Level 1 | Pure functions with no wallet dependencies |
| **[managers](managers.md)** | Level 2 | High-level wallet orchestration classes |
| **services** | — | Vault activation, deposit validation, peg-in protocol state, pegout state, HTLC utilities |
| **utils** | — | UTXO selection, reservation, availability checking, fee calculation |

> \`services\` is available from \`@babylonlabs-io/ts-sdk/tbv/core/services\` (also re-exported from \`/tbv/core\`); \`utils\` from \`@babylonlabs-io/ts-sdk/tbv/core/utils\` (also re-exported from \`/tbv/core\`). Source files are the reference docs — see [services/](https://github.com/babylonlabs-io/babylon-toolkit/tree/main/packages/babylon-ts-sdk/src/tbv/core/services) and [utils/](https://github.com/babylonlabs-io/babylon-toolkit/tree/main/packages/babylon-ts-sdk/src/tbv/core/utils).

---

`;
  });
}
