import type { AvatarProps } from "./Avatar";
import { Avatar } from "./Avatar";
import { Text } from "../Text";

/**
 * Props for the ProviderAvatar component.
 */
export interface ProviderAvatarProps extends Omit<AvatarProps, "children"> {
  /**
   * The provider name or address. If the name contains "0x", the initial
   * will be derived from the first character after the prefix.
   * @example "MyProvider" displays "M"
   * @example "0xe650..." displays "E"
   * @example "Provider 0x3c6f..." displays "3"
   */
  name: string;
}

/**
 * Extracts the initial character from a provider name or address.
 * Handles multiple formats:
 * - "0x3c6f..." → "3" (direct address)
 * - "Provider 0x3c6f..." → "3" (fallback name with address)
 * - "Acme Vault" → "A" (human-readable name)
 * @param name - The provider name or address
 * @returns The uppercase initial character, or "?" if name is empty
 */
function getProviderInitial(name: string): string {
  if (!name) return "?";

  const addressMatch = name.match(/0x([0-9a-fA-F])/);
  if (addressMatch) {
    return addressMatch[1].toUpperCase();
  }

  return name.charAt(0).toUpperCase();
}

/**
 * Avatar component specifically designed for vault providers.
 * Displays the provider's image if a URL is provided, otherwise shows
 * an initial derived from the provider name or address.
 *
 * @example
 * // With a named provider
 * <ProviderAvatar name="Acme Vault" size="small" />
 *
 * @example
 * // With an address (shows "E" as the initial)
 * <ProviderAvatar name="0xe650c9bd9be8755cf1df382f668741ab3d1ff11c" size="small" />
 *
 * @example
 * // With a custom image
 * <ProviderAvatar name="Provider" url="/images/provider-logo.png" size="large" />
 */
export function ProviderAvatar({ url, name, variant = "circular", size = "large", ...props }: ProviderAvatarProps) {
  return (
    <Avatar {...props} url={url} alt={name} variant={variant} size={size}>
      <Text
        as="span"
        className="inline-flex h-full w-full items-center justify-center bg-primary-main font-semibold text-white"
      >
        {getProviderInitial(name)}
      </Text>
    </Avatar>
  );
}
