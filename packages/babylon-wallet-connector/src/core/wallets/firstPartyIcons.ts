import okxLogo from "./icons/okx.svg";
import { MONOCHROME_MARK_BACKGROUND } from "./constants";

/**
 * AppKit reports the connected ETH wallet's own name and icon, and for wallets
 * we also support on Bitcoin that artwork differs from the asset we ship — OKX
 * returns a square tile where our Bitcoin asset is the circular mark, so one
 * wallet reads as two in the connected-wallet menu. Prefer our own asset for
 * those, keyed by name because that is the only identity AppKit exposes.
 */
const FIRST_PARTY_ICONS: { match: RegExp; icon: string; iconBackground?: string }[] = [
  { match: /okx/i, icon: okxLogo, iconBackground: MONOCHROME_MARK_BACKGROUND },
];

export function resolveFirstPartyIcon(walletName: string) {
  return FIRST_PARTY_ICONS.find(({ match }) => match.test(walletName));
}
