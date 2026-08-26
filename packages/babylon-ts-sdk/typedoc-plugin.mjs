/**
 * TypeDoc plugin for customizing the generated API documentation
 *
 * This plugin adds helpful navigation and context to the auto-generated
 * API documentation, making it easier for developers to find what they need,
 * and strips line numbers from source references.
 */
import { MarkdownPageEvent } from "typedoc-plugin-markdown";

/** `Defined in: [path/foo.ts:53](url/foo.ts#L53)` — line number in both halves. */
const LINKED_SOURCE_REF =
  /^(Defined in: \[[^\]]+?):\d+(\]\([^)]+?)#L\d+(\))$/gm;

/** `Defined in: .../dist/index.d.ts:100` — unlinked, since `dist/` is gitignored. */
const UNLINKED_SOURCE_REF = /^(Defined in: (?!\[)\S+?):\d+$/gm;

const SOURCE_REF_WITH_LINE = /^Defined in:.*?:\d+.*$/gm;

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
| **[deposit-terms](deposit-terms.md)** | \`@babylonlabs-io/ts-sdk/tbv/core\` | Deposit terms + approval capability for intent-based signing wallets |
| **[clients](clients.md)** | \`@babylonlabs-io/ts-sdk/tbv/core/clients\` | On-chain readers, mempool client, vault-provider RPC client |
| **[wallets](wallets.md)** | \`@babylonlabs-io/ts-sdk/shared\` | \`BitcoinWallet\` interface + signing options |
| **[integrations/aave](integrations/aave.md)** | \`@babylonlabs-io/ts-sdk/tbv/integrations/aave\` | Aave v4 integration (borrow, repay, position reads) |

---

`;
  });

  /**
   * Drop line numbers from source references, keeping the file link.
   *
   * `docs/api/` is committed, so line numbers made any code movement restale
   * 1,401 lines of it (#2196). The throw below is because these patterns depend
   * on typedoc-plugin-markdown's output format: if that changes, fail loudly
   * rather than silently letting the churn back in.
   */
  app.renderer.on(MarkdownPageEvent.END, (page) => {
    if (typeof page.contents !== "string") return;

    page.contents = page.contents
      .replace(LINKED_SOURCE_REF, "$1$2$3")
      .replace(UNLINKED_SOURCE_REF, "$1");

    const stale = page.contents.match(SOURCE_REF_WITH_LINE);
    if (stale) {
      throw new Error(
        `typedoc-plugin.mjs: ${stale.length} source reference(s) in ${page.url} ` +
          `still carry a line number (e.g. ${stale[0]}) — the patterns above no ` +
          `longer match what typedoc-plugin-markdown emits.`,
      );
    }
  });
}
