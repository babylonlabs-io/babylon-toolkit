import { IconProps } from "../index";
import { ThemedIcon } from "../ThemedIcon";

export const LinkWalletIcon = ({
  className = "",
  size = 24,
  variant = "primary",
}: IconProps) => {
  return (
    <ThemedIcon variant={variant} background rounded className={className}>
      <svg
        style={{ width: size, height: size }}
        viewBox="0 0 20 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M15 0H11V2H15C16.65 2 18 3.35 18 5C18 6.65 16.65 8 15 8H11V10H15C17.76 10 20 7.76 20 5C20 2.24 17.76 0 15 0ZM9 8H5C3.35 8 2 6.65 2 5C2 3.35 3.35 2 5 2H9V0H5C2.24 0 0 2.24 0 5C0 7.76 2.24 10 5 10H9V8ZM6 4H14V6H6V4Z" />
      </svg>
    </ThemedIcon>
  );
};
