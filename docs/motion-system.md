# Motion System — standard for animations

> The single source of truth for how motion is implemented across `babylon-toolkit`.
> **Any PR that adds or changes an animation must follow this.** Derived from the
> TBV motion spec (Figma "TBV × Master File", node `7831-25100`).

## Principles

1. **Tokens, not magic numbers.** All timing/easing/distance live as CSS custom
   properties (`--motion-*`). No inline `200ms`/`ease-out` literals in components.
2. **Knobs in core-ui, values in the app.** `@babylonlabs-io/core-ui` declares
   animations that read `var(--motion-…, <legacy default>)`. The per-component
   fallback preserves current behavior for every consumer; an app **opts in** by
   *defining* the token in its global stylesheet. core-ui must **not** define
   app-spec tokens in `:root` (divergent legacy defaults can't share one default).
3. **No animation library.** Exit animations use the existing mount/unmount seam
   (`onAnimationEnd` + `useModalManager`). Don't add framer-motion/react-spring.
4. **Enter ease-out, exit ease-in.** Subtle distances (4–8px), short durations
   (120–220ms; 1.2s only for the looping spinner). Never shift surrounding layout.
5. **Respect `prefers-reduced-motion`** — see the dedicated section; this is a
   hard requirement, not optional.
6. **Never animate `transform` on a popper-positioned element** (react-popper /
   react-tooltip set an inline `transform` to position it). Animate `opacity` on
   the positioned element and put any `translate` on an inner wrapper.

## Token reference (Figma values)

| Category | Token group | Enter | Exit |
|---|---|---|---|
| Modals | `modal` / `backdrop` | opacity 0→1, translateY 8→0, **220ms ease-out** | opacity 1→0, translateY 0→4, **180ms ease-in** |
| Dropdowns / Expandable | `dropdown` | opacity 0→1, translateY 4→0, **180ms ease-out** + height | opacity 1→0, **160ms ease-in** |
| Progressive Reveal | `reveal` | opacity 0→1, translateY 6→0, **180ms ease-out** | — |
| Tooltips / Info | `tooltip` | opacity 0→1, translateY 4→0, **140ms ease-out** | opacity 1→0, **120ms ease-in** |
| Loading / Skeleton | `skeleton` | shimmer sweep ~1.5s; **preserve final layout** | — |
| State Transition (pending→done) | reuses `reveal` | opacity 0→1, translateY 6→0, **180ms ease-out** | — |
| Icons — spinner | `spinner` | rotate 0→360°, **1.2s linear infinite** (functional) | — |
| Icons — chevron / plus→minus | `icon` | rotate / morph, **180ms ease-out** | — |

Token names: `--motion-duration-{modal,modal-out,backdrop,dropdown,tooltip,tooltip-out,reveal,icon,spinner,skeleton}`,
`--motion-ease-{modal-in,modal-out,backdrop,dropdown-in,reveal,icon}`,
`--motion-shift-{modal-in,modal-out,dropdown,reveal}`.

> Values above are from each Figma **section node** via `get_design_context` (authoritative);
> the overview screenshot differs in places. Re-pull the section node before changing a value.

## Reduced motion (required)

Drive reduced-motion through **`:root` token zeroing**, not per-rule overrides —
variable resolution is order-independent, so it can't be defeated by CSS source
order (a base rule defined later would otherwise beat a same-specificity override).

- core-ui `index.css` has a `@media (prefers-reduced-motion: reduce) { :root { … 0.01ms / 0px } }` block.
- **Each app must repeat the zeroing** in its own stylesheet **after** its token
  definitions (the app's `:root` loads after core-ui and would otherwise win).
- **Exceptions:** the **spinner stays running** (functional indicator — do not
  zero `--motion-duration-spinner`). The **skeleton shimmer is stopped** with
  `animation: none !important` (decorative + looping → also avoids repaints).
- JS-driven motion must read `useReducedMotion()` (core-ui) and render the final
  state on first paint (initialize state from `reduced`, don't fade in post-mount).

## How to add a new animation (checklist for PRs)

1. Get the exact values from the Figma section node (`get_design_context`).
2. Add a keyframe/transition in core-ui driven by `var(--motion-…, <legacy default>)`
   — the fallback must reproduce current behavior so other consumers don't change.
3. If it's a popper/tooltip element, animate opacity on it and translate on a wrapper.
4. Define the spec token value in the consuming app's `globals.css` `:root`.
5. Add the token to **both** reduced-motion `:root` blocks (core-ui + app); decide
   functional (keep) vs decorative (stop).
6. Verify: `pnpm --filter @babylonlabs-io/core-ui build`, app tests/lint, and a
   manual `prefers-reduced-motion` pass. Confirm no behavior change for non-opted-in
   consumers (defaults intact).

## Where it lives

- Tokens + reduced-motion block + shared utilities: `packages/babylon-core-ui/src/index.css`
- Per-component animations: `packages/babylon-core-ui/src/components/**/*.css`, `tailwind.config.js`
- Hook: `packages/babylon-core-ui/src/hooks/useReducedMotion.ts`
- Vault opt-in: `services/vault/src/globals.css` (`:root` + reduced-motion block)
