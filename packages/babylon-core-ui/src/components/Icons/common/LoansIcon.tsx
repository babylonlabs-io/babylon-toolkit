interface LoansIconProps {
  size?: number;
  className?: string;
}

// TODO(#2015): replace with the exact Figma nav-icon geometry
// (https://www.figma.com/design/NgDfn7fVnkQZP0XH9Uki63/TBV-v.3--Premium-Design-?node-id=10084-22951).
export function LoansIcon({ size = 20, className }: LoansIconProps) {
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
        d="M10 6.5v7M12.25 8.25c0-.97-1.007-1.75-2.25-1.75s-2.25.78-2.25 1.75.879 1.35 2.25 1.5c1.371.15 2.25.53 2.25 1.5S11.243 13.25 10 13.25s-2.25-.78-2.25-1.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
