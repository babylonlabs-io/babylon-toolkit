// Base icon props interface
export interface BaseIconProps {
  className?: string;
  size?: number;
}

// Extended icon props with variant support
export interface IconProps extends BaseIconProps {
  variant?: "default" | "primary" | "secondary" | "error" | "success" | "accent-primary" | "accent-secondary";
  color?: string; // For custom colors via className
}

// Color variants mapping
export const iconColorVariants = {
  default: "text-accent-primary",
  primary: "text-primary-light",
  secondary: "text-accent-secondary", 
  error: "text-error-main",
  success: "text-success-main",
  "accent-primary": "text-accent-primary",
  "accent-secondary": "text-accent-secondary",
} as const;

export { ThemedIcon } from "./ThemedIcon";

// Wallet icons
export { BitcoinPublicKeyIcon } from "./wallet/BitcoinPublicKeyIcon";
export { LinkWalletIcon } from "./wallet/LinkWalletIcon";
export { UsingInscriptionIcon } from "./wallet/UsingInscriptionIcon";

// Common icons
export { CopyIcon } from "./common/CopyIcon";
export { CloseIcon } from "./common/CloseIcon";
