# Vault allowlists

The vault app has two separate lists that limit new deposits.

```
New deposit
  │
  ├─ 1. Which vault providers can be picked?   → VP allowlist
  │       set by: web / DevOps (build variable)
  │
  └─ 2. Which Ethereum wallets can deposit?    → Depositor allow-list
          set by: contract admin (on-chain call)
```

|              | VP allowlist                  | Depositor allow-list                                            |
| ------------ | ----------------------------- | --------------------------------------------------------------- |
| Limits       | Providers shown in the picker | Wallets allowed to deposit                                      |
| Lives in     | GitHub environment variable   | `AllowListPolicy` contract                                      |
| Enforced by  | This frontend only            | The contract (app checks early)                                 |
| Default      | Unset: no allowlist applies   | On: nobody can deposit                                          |
| Change needs | Rebuild and redeploy          | One admin transaction                                           |
| Takes effect | After the deploy              | On chain at once; in the app when the deposit dialog next opens |

Existing vaults are never affected by either list.

## 1. VP allowlist

Set `NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS` to the Ethereum addresses of
the vault providers to offer.

```bash
# Commas or spaces, any letter case.
NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS=0x1111...1111,0x2222...2222
```

### Change it

1. Open GitHub → repository Settings → Environments → pick the deployment
   (e.g., `vault-testnet-3`) → Variables.
2. Add or edit `NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS`.
3. In GitHub Actions, run the `vault-publish` workflow
   (`.github/workflows/service-release-vault.yml`) with `ENVIRONMENT` set
   to that deployment. The workflow builds and publishes the branch or tag
   it is run from, so run it from the ref that deployment runs. A run from
   a feature branch fails for `vault-testnet-3`, and
   `vault-real-money-devnet` publishes from `main` only.
4. After the published build is rolled out, open the app, start a deposit,
   and confirm the picker lists only the intended providers.

> **Note**: The workflow publishes the build to S3. It does not roll the
> build out; see [Open items](#open-items).

> ⚠️ **Important**: Set the variable on the environment, not on the
> repository. Provider addresses differ per network, so a repository-level
> value empties the picker on every network it does not match.

### What each value does

| Value                     | Result                                                         |
| ------------------------- | -------------------------------------------------------------- |
| Unset or empty            | No allowlist. Every provider the proxy has not disabled shows. |
| All addresses match       | Only those providers show.                                     |
| Some addresses match      | Matching ones show. The rest are ignored.                      |
| No address matches (typo) | Picker is empty. No one can start a deposit.                   |

> **Note**: This list only hides providers in this app. The contract still
> accepts a deposit to any registered provider sent from another client.

> **Note**: A provider the proxy marks as disabled stays hidden even when
> it is on the list.

## 2. Depositor allow-list

The `AllowListPolicy` contract holds one list per application. The gate is
on by default with nobody listed. Only the Ethereum address is checked; the
Bitcoin wallet does not matter.

### Addresses needed

| Name        | Where to find it                                                         |
| ----------- | ------------------------------------------------------------------------ |
| Registry    | `contracts.btcVaultRegistry` in `services/vault/networks/<network>.json` |
| Application | `contracts.aaveAdapter` in the same file                                 |
| Policy      | Read from the registry (first command below)                             |
| Depositor   | The user's Ethereum address (a Safe's own address for a Safe)            |

### Check a wallet

```bash
# Find the policy contract.
cast call <registry> 'allowListPolicy()(address)' --rpc-url <rpc>

# true = this wallet can deposit. This is the same call the app makes.
cast call <policy> 'checkAllowed(address,address)(bool)' \
  <application> <depositor> --rpc-url <rpc>
```

### Add or remove wallets

The caller must hold the `TBV_PROTOCOL_ADMIN` role on the policy contract.

| Action            | Call                                                 |
| ----------------- | ---------------------------------------------------- |
| Add one wallet    | `setDepositorAllowed(application, depositor, true)`  |
| Remove one wallet | `setDepositorAllowed(application, depositor, false)` |
| Add many wallets  | `setDepositorsAllowed(application, [wallets], true)` |
| Open to everyone  | `disableAllowList(application)`                      |
| Turn the gate on  | `enableAllowList(application)`                       |

1. Send the call from the admin account.
2. Run the `checkAllowed` command above and confirm the result.
3. Ask the user to reopen the deposit dialog or reload the app. No
   redeploy is needed.

> **Note**: Adding or removing a wallet reverts with `AllowListDisabled`
> while the gate is off. Turn the gate on first. Wallets listed earlier
> stay listed across an off/on cycle.

> **Note**: Removing a wallet blocks its new deposits only. Vaults it
> already registered continue as normal.

### What the user sees

| Situation                                       | In the app                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Wallet listed, or gate off                      | Normal `Deposit` button                                                                                  |
| Wallet not listed                               | Disabled button: `Ethereum wallet not on the allow list`                                                 |
| Not listed, and the app could not read the list | Signing prompts appear, then `Wallet not on the allow list`.<br/>Nothing is broadcast and no funds move. |

See `docs/PROTOCOL_CONFIGURATION.md` section 1.5 in
`vault-contracts-aave-v4` for the contract reference.

## Open items

> **Note**: This document does not yet name the holder of
> `TBV_PROTOCOL_ADMIN` on each network, or how that holder sends the call
> (Safe or script). The contracts team owns that answer.

> **Note**: The release workflow has no mainnet environment and
> `services/vault/networks/` has no mainnet profile yet. Add the VP
> allowlist variable to the mainnet environment when it is created;
> an unset variable applies no allowlist.

> **Note**: This document does not yet say how a build published by
> `vault-publish` is rolled out to each deployment, which ref each
> deployment runs, or who triggers the rollout.
> The DevOps team owns that answer.
