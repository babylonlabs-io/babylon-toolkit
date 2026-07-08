interface LiquidationsIconProps {
  size?: number;
  className?: string;
}

// TODO(#2015): replace with the exact Figma nav-icon geometry
// (https://www.figma.com/design/NgDfn7fVnkQZP0XH9Uki63/TBV-v.3--Premium-Design-?node-id=10084-22951).
export function LiquidationsIcon({ size = 20, className }: LiquidationsIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M10 3.5 17 16H3L10 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 8.5v3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}
