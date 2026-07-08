interface VaultsIconProps {
  size?: number;
  className?: string;
}

// TODO(#2015): replace with the exact Figma nav-icon geometry
// (https://www.figma.com/design/NgDfn7fVnkQZP0XH9Uki63/TBV-v.3--Premium-Design-?node-id=10084-22951).
export function VaultsIcon({ size = 20, className }: VaultsIconProps) {
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
        x="4"
        y="9"
        width="12"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.5 9V6.5a3.5 3.5 0 1 1 7 0V9"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
