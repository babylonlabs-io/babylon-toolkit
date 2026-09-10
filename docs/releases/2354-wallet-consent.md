# Wallet consent

Vault pages now wait for the same confirmed wallet session as the wallet menu. Wallet connection alone does not open the connected pages.

Both Vault and simple staking use the final **Connect** action to confirm the session. A valid saved approval restores after live wallet checks. A missing, old, or invalid approval requires **Connect** again. No new consent service or callback was added.

See the [consent rule and support note](../decisions/2354-wallet-consent.md). Tracks [#2354](https://github.com/babylonlabs-io/babylon-toolkit/issues/2354).
