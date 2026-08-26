interface LiquidationsIconProps {
  size?: number;
  className?: string;
}

// Exact geometry from Figma Sidebar node 10084:23112 (WaterfallChartOutlined).
// Figma insets this glyph within the 24px slot: 12.5% (3px) left/right,
// 16.67% (4px) top/bottom.
export function LiquidationsIcon({ size = 24, className }: LiquidationsIconProps) {
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
      <g transform="translate(3, 4)">
        <path d="M15 0H18V16H15V0ZM0 9H3V16H0V9ZM11 0H14V3H11V0ZM7 1H10V5H7V1ZM4 6H7V10H4V6Z" fill="currentColor" />
      </g>
    </svg>
  );
}
