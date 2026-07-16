interface XIconProps {
  size?: number;
  className?: string;
  title?: string;
}

// Exact geometry from Figma Sidebar social row (node 10084:23112).
export function XIcon({ size = 16, className, title }: XIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <path d="M11.025 0H13.172L8.482 5.0826L14 12H9.68L6.294 7.80549L2.424 12H0.275L5.291 6.56179L0 0.000945763H4.43L7.486 3.83417L11.025 0ZM10.27 10.7818H11.46L3.78 1.15479H2.504L10.27 10.7818Z" fill="currentColor" />
    </svg>
  );
}
