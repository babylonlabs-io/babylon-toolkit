import { twJoin } from "tailwind-merge";

interface ThemedIconProps {
  children: React.ReactNode;
  className?: string;
  size?: number;
  variant?: "default" | "primary" | "secondary" | "error" | "success" | "accent-primary" | "accent-secondary";
  background?: boolean;
  rounded?: boolean;
}

export const ThemedIcon = ({
  children,
  className = "",
  size = 40,
  variant = "default",
  background = false,
  rounded = false,
}: ThemedIconProps) => {
  const variants = {
    default: "text-accent-secondary",
    primary: "text-primary-light",
    secondary: "text-accent-secondary",
    error: "text-error-main",
    success: "text-success-main",
    "accent-primary": "text-accent-primary",
    "accent-secondary": "text-accent-secondary",
  };

  const backgroundStyles = {
    default: "bg-accent-secondary/10",
    primary: "bg-primary-light/10 dark:bg-[#47484A]",
    secondary: "bg-accent-secondary/10",
    error: "bg-error-main/10",
    success: "bg-success-main/10",
    "accent-primary": "bg-accent-primary/10",
    "accent-secondary": "bg-accent-secondary/10",
  };

  return (
    <div
      className={twJoin(
        "flex items-center justify-center",
        background && backgroundStyles[variant],
        rounded && "rounded-full",
        background
          ? "[&_svg]:h-4 [&_svg]:w-auto"
          : "[&_svg]:w-full [&_svg]:h-full",
        "[&_svg_path]:fill-current",
        background && "dark:[&_svg_path]:fill-white",
        variants[variant],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
};
