/**
 * EmptyStateIcon
 * Document-with-magnifier illustration shared by every v3 empty state
 * (Vaults / Loans / Activity — Figma 10049:6109, 10049:6115, 11716:54555).
 * Geometry is the Figma export; strokes use `currentColor` so the icon picks up
 * `text/secondary` in both themes (#666666 light, #B0B0B0 dark).
 */

interface EmptyStateIconProps {
  className?: string;
}

export function EmptyStateIcon({ className = "" }: EmptyStateIconProps) {
  return (
    <svg
      width="94"
      height="101"
      viewBox="0 0 93.9047 101.367"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`text-accent-secondary ${className}`}
      aria-hidden="true"
    >
      <path
        d="M77.5659 82.1165V100.867H0.5V1.34677L56.3528 1.00735L77.4249 22.0504L77.5659 59.6165V21.9927L56.4106 0.866506L0.358965 1.20593M56.4106 0.866506V21.9927H77.5659M10.8768 34.6614H63.4658M10.8768 80.526H40.1887M10.8768 50.1795H46.204M10.8768 65.5252H38.9817M56.5517 1.20593L77.226 21.8519H56.5517V1.20593Z"
        stroke="currentColor"
        strokeMiterlimit="10"
      />
      <path
        d="M67.0478 55.5332C75.5324 55.5334 82.4102 62.4119 82.4102 70.8965C82.41 79.3809 75.5323 86.2586 67.0478 86.2588C58.5633 86.2588 51.6848 79.381 51.6846 70.8965C51.6846 62.4117 58.5631 55.5332 67.0478 55.5332Z"
        stroke="currentColor"
      />
      <path d="M79.8065 79.862L93.5512 93.6068" stroke="currentColor" />
    </svg>
  );
}
