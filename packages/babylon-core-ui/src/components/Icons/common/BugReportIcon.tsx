import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const BugReportIcon = ({ 
  className = "", 
  size = 16, 
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];

  return (
    <svg
      style={{ width: size, height: size }}
      viewBox="0 0 16 16.5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path
        d="M11.865 5.5H4.135L0.5 9.135V11.865L4.135 15.5H11.865L15.5 11.865V9.135L11.865 5.5ZM8 13.15C7.28 13.15 6.85 12.72 6.85 12C6.85 11.28 7.28 10.85 8 10.85C8.72 10.85 9.15 11.28 9.15 12C9.15 12.72 8.72 13.15 8 13.15ZM9 10.5H7V7.5H9V10.5Z"
        fill="currentColor"
      />
    </svg>
  );
};
