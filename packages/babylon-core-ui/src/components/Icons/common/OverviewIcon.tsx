interface OverviewIconProps {
  size?: number;
  className?: string;
}

// TODO(#2015): replace with the exact Figma nav-icon geometry
// (https://www.figma.com/design/NgDfn7fVnkQZP0XH9Uki63/TBV-v.3--Premium-Design-?node-id=10084-22951).
export function OverviewIcon({ size = 20, className }: OverviewIconProps) {
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
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
