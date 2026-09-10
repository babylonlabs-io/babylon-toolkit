# Wallet consent rule

Status: jonybur authorized this rule on 9 September 2026 for [#2354](https://github.com/babylonlabs-io/babylon-toolkit/issues/2354). The user overrode the issue's prior Product and Legal approval requirement and will contact Legal separately.

## Decision

- A wallet connection does not confirm consent. The user must select the final **Connect** button.
- The shared wallet dialog checks the live wallet identities before it calls `acceptTermsOfService`, if supplied. It confirms the session only after that callback succeeds.
- The callback receives the live address and public key of the first required chain. It also receives the connected wallets. It does not use the order in which wallets connected.
- Vault requires BTC then ETH. Bitcoin staking requires BTC then BBN. BABY staking requires BBN. Thus the callback identity is BTC, BTC, and BBN, respectively.
- Neither app supplies a consent callback or has a consent service endpoint. Both use the shared dialog and its saved approval record.
- A current saved approval restores the session only after live checks match the required wallet, address, public key, and network. A valid restore does not repeat the callback.
- A missing, old, or invalid approval requires the final **Connect** action again. A saved wallet choice alone is not approval.
- Page and action gates use the confirmed session. Wallet presence can supply read data but cannot replace consent.

This decision keeps the current wallet requirements. It does not enable Ethereum-first mode.

## User and support note

The **Connect** button confirms the connected wallets and the terms shown in the dialog. A connected wallet can still need this final step.

If the app asks the user to connect again, ask them to check the wallet account and network, then select **Connect**. A saved approval can be absent, expired, or no longer valid for that wallet. Closing the dialog does not confirm it. A valid saved approval does not need another confirmation.

## Evidence

The provider tests in each app fix the required chain order and shared consent settings. The Vault page tests and staking action-gate tests check confirmed-session access. The wallet dialog and restore tests cover both app configurations with existing account inputs. [Session journey evidence remains in #2355](https://github.com/babylonlabs-io/babylon-toolkit/issues/2355).
