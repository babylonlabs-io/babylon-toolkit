import { IconProps, iconColorVariants } from "../index";
import { twJoin } from "tailwind-merge";

export const InfoIcon = ({ 
  className = "", 
  size = 14, 
  variant = "default",
  color
}: IconProps) => {
  const colorClass = color || iconColorVariants[variant];
  const ASPECT_RATIO = 1; // 14/14 = 1
  
  return (
    <svg
      style={{ width: size, height: size * ASPECT_RATIO }}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin("transition-opacity duration-200", colorClass, className)}
    >
      <path
        d="M6.33325 3.66634H7.66659V4.99967H6.33325V3.66634ZM6.33325 6.33301H7.66659V10.333H6.33325V6.33301ZM6.99992 0.333008C3.31992 0.333008 0.333252 3.31967 0.333252 6.99967C0.333252 10.6797 3.31992 13.6663 6.99992 13.6663C10.6799 13.6663 13.6666 10.6797 13.6666 6.99967C13.6666 3.31967 10.6799 0.333008 6.99992 0.333008ZM6.99992 12.333C4.05992 12.333 1.66659 9.93967 1.66659 6.99967C1.66659 4.05967 4.05992 1.66634 6.99992 1.66634C9.93992 1.66634 12.3333 4.05967 12.3333 6.99967C12.3333 9.93967 9.93992 12.333 6.99992 12.333Z"
        fill="currentColor"
      />
    </svg>
  );
};
