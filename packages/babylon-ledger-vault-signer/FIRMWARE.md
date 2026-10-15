# Firmware pin

The host code in this package, the wallet-connector `ledger-vault` provider and the
ts-sdk delegated-claim service mirror rules of the Ledger Babylon Vault app. Every
statement about device behaviour in their comments was checked against this revision.

| | |
| --- | --- |
| App | Babylon Vault 0.11.0 |
| Firmware | `LedgerHQ/app-babylon-vault-dev` (private), `develop` @ `b89dd580`, release tags `*_0.11.0_sdk_v27.1.2` |
| Base Bitcoin app | `bitcoin_app_base` submodule, `LedgerHQ/app-bitcoin` branch `baseapp` @ `78243239` |
| Ledger secure SDK | `v27.1.2` |
| Speculos ELF | `compiled_app_binaries_testnet` of CI run 37902155561 (expires 2027-01-07), `nanos2/bin/app.elf` |
| Vendored `ledger-bitcoin` vectors | see `src/vendor/ledger-bitcoin/README.md` |

Comments name firmware functions and constants (`_validate_display_refund`,
`SW_CAP_EXCEEDED`), never file lines or commit hashes: lines move every release and
nothing checks them. The Speculos suite against the pinned ELF is what fails when
device behaviour moves; this file is provenance, not a correctness check.

## Bumping the pin

1. Update this table, `MIN_APP_VERSION` and `FIRST_UNSUPPORTED_APP_VERSION` in the
   provider, and `PINNED_APP_VERSION` in `src/__tests__/e2e/speculos.e2e.test.ts`.
2. Read the firmware diff between the two revisions for the mirrored rules:
   `src/sign_psbt_validate.c`, `src/sign_psbt_validate_helpers.c`,
   `src/sign_custom_inputs.c`, `src/vault_tlv.c`, `src/vault_constants.h`,
   `src/apdu_handler.c` and `docs/apdu.md`; in the base app, `src/handler/sign_psbt/`
   and `src/boilerplate/sw.h`. Re-check every value in `src/deviceCaps.ts`.
3. Run the Speculos suite against the new ELF.
4. If the base app moved, regenerate the vendored vectors per the vendor README.
