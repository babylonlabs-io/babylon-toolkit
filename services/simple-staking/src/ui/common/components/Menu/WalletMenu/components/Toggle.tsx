import { twJoin } from "tailwind-merge";

interface NewToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export const NewToggle = ({
  value,
  onChange,
  className = "",
  disabled = false,
}: NewToggleProps) => {
  const handleClick = () => {
    if (!disabled) {
      onChange(!value);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={twJoin(
        "relative inline-flex h-[31px] w-[55px] items-center rounded-full transition-colors duration-300 ease-in-out",
        "focus:outline-none focus:ring-2 focus:ring-primary-main focus:ring-offset-2",
        value ? "bg-primary-main dark:bg-primary-light" : "bg-[#78788029]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      style={{
        border: "none",
      }}
      aria-pressed={value}
      aria-label="Toggle"
    >
      <span
        className={twJoin(
          "inline-block h-[27px] w-[27px] transform rounded-full bg-white transition-transform duration-300 ease-in-out",
          "flex items-center justify-center shadow-sm",
          value ? "translate-x-[26px]" : "translate-x-[2px]",
        )}
      ></span>
    </button>
  );
};
