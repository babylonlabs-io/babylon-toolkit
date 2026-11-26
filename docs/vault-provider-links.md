# Vault provider links

A vault provider link opens the vault app with one vault provider already
chosen in the deposit form. A partner such as a vault provider operator shares
it with the depositors it brings in.

```
https://<vault app host>/?vp=<vault provider Ethereum address>
```

The link names the provider by its Ethereum address, not its name. Names are
set by each provider and are not unique, so a name could point at someone
else's provider.

## Get a link

1. Open the vault app on the network the link is for.
2. Start a deposit and expand the vault provider picker.
3. Click the copy icon on the provider's row.

The copied link points at the app you copied it from, so a link copied on
testnet opens testnet. Provider addresses differ per network, so each network
needs its own link.

> **Note**: The picker is inside the deposit dialog. Opening it needs a
> connected wallet, and the Deposit button on the Vaults page is disabled
> while deposits are blocked, for example while the protocol is soft-paused.
> If you cannot reach the picker, build the link by hand from the format
> above with the provider's Ethereum address on that network.

## What the depositor sees

| Situation                                        | In the app                                               |
| ------------------------------------------------ | -------------------------------------------------------- |
| Opened the link                                  | The provider is first in the picker and already selected |
| Reloads, or opens the app in another tab         | Same, for 30 days after they last opened the link        |
| Picks another provider and starts a deposit      | The link stops applying                                  |
| Opens a link to a different provider             | The newer link replaces the older one                    |
| The provider is unhealthy or its metadata failed | The link is ignored; the picker shows its normal order   |
| The provider is not listed (see below)           | The link is ignored; the picker shows its normal order   |

Every listed provider stays visible, so the depositor can still choose
another one. Disconnecting or switching wallets does not affect the link: it
belongs to the browser.

## The provider must be listed

A link only selects a provider the picker already shows. It cannot add one.
The provider must be:

- registered for the application, and
- on `NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS` when that allowlist is set
  for the deployment (see [Vault allowlists](vault-allowlists.md)), and
- not disabled by the vault-provider proxy.

> **Note**: Check this before sending a link. A link to a provider that is not
> listed opens the app normally, with nothing selected, and shows no error.

## Notes

- The app removes `vp` from the address bar once it has read it. Other
  parameters, such as `utm_source`, stay.
- The link is kept in the browser's local storage. It is never sent anywhere.
- Nothing records that a deposit came through a link. Each vault is bound to
  its provider on-chain, so deposits per provider can be counted from chain
  data.
