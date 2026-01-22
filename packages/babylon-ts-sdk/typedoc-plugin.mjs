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
| **[Primitives Guide](../guides/primitives.md)** | Pure functions for Bitcoin transaction building |
| **[Managers Guide](../guides/managers.md)** | High-level wallet orchestration |
| **[Installation](../get-started/installation.md)** | Setup instructions |
| **[Quickstart: Primitives](../quickstart/primitives.md)** | Complete working example with primitives |
| **[Quickstart: Managers](../quickstart/managers.md)** | Complete working example with managers |

## Modules Overview

| Module | Level | Description |
|--------|-------|-------------|
| **[primitives](primitives.md)** | Level 1 | Pure functions with no wallet dependencies |
| **[managers](managers.md)** | Level 2 | High-level wallet orchestration classes |

---

`;
  });
}
