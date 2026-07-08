interface ExploreIconProps {
  size?: number;
  className?: string;
}

// TODO(#2015): replace with the exact Figma nav-icon geometry
// (https://www.figma.com/design/NgDfn7fVnkQZP0XH9Uki63/TBV-v.3--Premium-Design-?node-id=10084-22951).
export function ExploreIcon({ size = 20, className }: ExploreIconProps) {
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
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.5 7.5 11 11l-3.5 1.5L9 9l3.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
