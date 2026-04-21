/**
 * TypeDoc plugin for customizing the generated API documentation
 *
 * This plugin adds helpful navigation and context to the auto-generated
 * API documentation, making it easier for developers to find what they need.
 */
export function load(app) {
  // Add description and quick links at the beginning of the index page
  app.renderer.markdownHooks.on("index.page.begin", () => {
    return `> Auto-generated from TSDoc using [TypeDoc](https://typedoc.org/). New to the SDK? Start with [Get Started](../get-started/README.md).

## Quick Links

| Guide | Description |
|-------|-------------|
| **[Get Started](../get-started/README.md)** | Orientation, trust model, four-layer architecture, glossary |
| **[Quickstart: Managers](../quickstart/managers.md)** | End-to-end peg-in flow with wallets |
| **[Quickstart: Primitives](../quickstart/primitives.md)** | Custom signing / KMS / HSM |
| **[Aave Integration](../integrations/aave/README.md)** | Use vaults as Aave collateral |
| **[Troubleshooting](../get-started/troubleshooting.md)** | Buffer / WASM / bundler issues |

## Modules Overview

| Module | Public import path | Description |
|--------|--------------------|-------------|
| **[primitives](primitives.md)** | \`@babylonlabs-io/ts-sdk/tbv/core/primitives\` | Pure PSBT builders and script helpers |
| **[utils](utils.md)** | \`@babylonlabs-io/ts-sdk/tbv/core/utils\` | UTXO, fee, funding, BTC/script, signing helpers |
| **[services](services.md)** | \`@babylonlabs-io/ts-sdk/tbv/core/services\` | Stateless orchestration (activation, refund, payout polling, protocol state) |
| **[managers](managers.md)** | \`@babylonlabs-io/ts-sdk/tbv/core\` | Stateful wallet orchestration (PeginManager, PayoutManager) |
| **[clients](clients.md)** | \`@babylonlabs-io/ts-sdk/tbv/core/clients\` | On-chain readers, mempool client, vault-provider RPC client |
| **[wallets](wallets.md)** | \`@babylonlabs-io/ts-sdk/shared\` | \`BitcoinWallet\` interface + signing options |
| **[integrations/aave](integrations/aave.md)** | \`@babylonlabs-io/ts-sdk/tbv/integrations/aave\` | Aave v4 integration (borrow, repay, position reads) |

---

`;
  });
}
