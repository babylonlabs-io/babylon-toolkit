/**
 * Test/E2E-only entry — `@babylonlabs-io/ledger-vault-signer/testing`.
 *
 * A separate `exports` subpath so the transport seam never sits on the main
 * production surface: ordinary consumers import `.` and cannot reach it by
 * accident, while harnesses (the vault dApp's env-gated Speculos bootstrap,
 * this package's own e2e) opt in explicitly. The seam's runtime guard —
 * refuse once a DMK exists — lives with the implementation in `dmkSession`.
 *
 * @module ledger-vault-signer/testing
 */

export { setDmkTransportOverride, type DmkTransportOverride } from "./dmkSession";
