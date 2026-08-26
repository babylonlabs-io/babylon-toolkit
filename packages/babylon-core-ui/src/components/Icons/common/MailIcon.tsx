interface MailIconProps {
  size?: number;
  className?: string;
  title?: string;
}

// Exact geometry from Figma Sidebar social row (node 10084:23112).
export function MailIcon({ size = 16, className, title }: MailIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <path d="M2.66732 13.3332C2.30065 13.3332 1.98687 13.2027 1.72598 12.9418C1.4651 12.6809 1.33443 12.3669 1.33398 11.9998V3.99984C1.33398 3.63317 1.46465 3.31939 1.72598 3.0585C1.98732 2.79761 2.3011 2.66695 2.66732 2.6665H13.334C13.7007 2.6665 14.0147 2.79717 14.276 3.0585C14.5373 3.31984 14.6678 3.63362 14.6673 3.99984V11.9998C14.6673 12.3665 14.5369 12.6805 14.276 12.9418C14.0151 13.2032 13.7011 13.3336 13.334 13.3332H2.66732ZM8.00065 8.6665L13.334 5.33317V3.99984L8.00065 7.33317L2.66732 3.99984V5.33317L8.00065 8.6665Z" fill="currentColor" />
    </svg>
  );
}
