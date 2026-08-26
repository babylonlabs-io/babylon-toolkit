import { IoOpenOutline } from "react-icons/io5";

interface ExplorerLinkProps {
  /**
   * Target URL, typically from a `getVpExplorer*Url` builder. When `undefined`
   * (explorer base unset or no id) the component renders nothing — so callers
   * can pass the builder result straight through without their own guard.
   */
  href?: string;
  /** Accessible name + tooltip (e.g. "View vault on explorer"). */
  label: string;
  /** Icon size in px. */
  size?: number;
  className?: string;
}

/**
 * Icon-only external link to the Babylon BTC Vault explorer. Opens in a new tab
 * with `rel="noopener noreferrer"`. Renders nothing without an `href`.
 */
export function ExplorerLink({
  href,
  label,
  size = 16,
  className = "text-accent-secondary transition-colors hover:text-accent-primary",
}: ExplorerLinkProps) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={className}
    >
      <IoOpenOutline size={size} />
    </a>
  );
}
