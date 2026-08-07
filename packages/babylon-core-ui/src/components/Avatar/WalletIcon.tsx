import { twMerge } from "tailwind-merge";

import type { AvatarProps } from "./Avatar";
import { Avatar } from "./Avatar";

export interface WalletIconProps {
  url: string;
  alt?: string;
  /**
   * Brand fill for wallets whose mark is a single-colour glyph with no
   * background of its own (OKX, Ledger, Keystone, OneKey). Leave undefined for
   * logos that already carry their own colour, such as MetaMask or UniSat.
   */
  background?: string;
  size?: AvatarProps["size"];
  className?: string;
}

/**
 * Renders a wallet logo the way the design system specifies: a mark that needs
 * contrast sits in a circle filled with its brand colour, while a self-coloured
 * logo renders bare and is never clipped to a shape it wasn't drawn for.
 */
export function WalletIcon({ url, alt, background, size = "large", className }: WalletIconProps) {
  if (background) {
    return (
      <Avatar
        url={url}
        alt={alt}
        size={size}
        variant="circular"
        style={{ backgroundColor: background }}
        className={twMerge("bbn-avatar-inset", className)}
      />
    );
  }

  return (
    <Avatar
      url={url}
      alt={alt}
      size={size}
      variant="rounded"
      className={twMerge("!overflow-visible object-contain", className)}
    />
  );
}
