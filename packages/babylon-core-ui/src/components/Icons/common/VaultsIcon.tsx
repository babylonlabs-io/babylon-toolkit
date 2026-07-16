interface VaultsIconProps {
  size?: number;
  className?: string;
}

// Exact geometry from Figma Sidebar node 10084:23112 (LockClockOutlined).
// Figma insets this glyph asymmetrically within the 24px slot
// (top/right/bottom 4.17% = 1px, left 16.67% = 4px) — not centered.
export function VaultsIcon({ size = 24, className }: VaultsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <g transform="translate(4, 1)">
        <path d="M2 19V9H14V10C14.7 10 15.37 10.1 16 10.29V9C16 7.9 15.1 7 14 7H13V5C13 2.24 10.76 0 8 0C5.24 0 3 2.24 3 5V7H2C0.9 7 0 7.9 0 9V19C0 20.1 0.9 21 2 21H8.26C7.84 20.4 7.51 19.72 7.29 19H2ZM5 5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7H5V5Z" fill="currentColor" />
        <path d="M14 12C11.24 12 9 14.24 9 17C9 19.76 11.24 22 14 22C16.76 22 19 19.76 19 17C19 14.24 16.76 12 14 12ZM15.65 19.35L13.5 17.2V14H14.5V16.79L16.35 18.64L15.65 19.35Z" fill="currentColor" />
      </g>
    </svg>
  );
}
