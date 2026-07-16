interface OverviewIconProps {
  size?: number;
  className?: string;
}

// Exact geometry from Figma Sidebar node 10084:23112 (GridViewOutlined).
// The glyph is inset 12.5% (3px) on every side of the 24px icon slot —
// translate keeps that padding instead of stretching the 18x18 glyph edge
// to edge, which would render it ~33% too heavy.
export function OverviewIcon({ size = 24, className }: OverviewIconProps) {
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
      <g transform="translate(3, 3)">
        <path d="M0 0V8H8V0H0ZM6 6H2V2H6V6ZM0 10V18H8V10H0ZM6 16H2V12H6V16ZM10 0V8H18V0H10ZM16 6H12V2H16V6ZM10 10V18H18V10H10ZM16 16H12V12H16V16Z" fill="currentColor" />
      </g>
    </svg>
  );
}
