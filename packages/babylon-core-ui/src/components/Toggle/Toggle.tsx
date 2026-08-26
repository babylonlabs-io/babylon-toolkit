import { twJoin } from "tailwind-merge";
import { useControlledState } from "@/hooks/useControlledState";
import "./Toggle.css";

export interface ToggleProps {
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (value: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export const Toggle = ({
  value,
  defaultValue = false,
  onChange,
  className = '',
  disabled = false,
}: ToggleProps) => {
  const [isOn = false, setIsOn] = useControlledState<boolean>({
    value,
    defaultValue,
    onStateChange: onChange,
  });

  const handleClick = () => {
    if (!disabled) setIsOn(!isOn);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={twJoin(
        'bbn-toggle',
        isOn && 'bbn-toggle-active',
        disabled && 'bbn-toggle-disabled',
        className,
      )}
      aria-pressed={isOn}
      aria-label="Toggle"
    >
      <span
        className={twJoin(
          'bbn-toggle-control',
          isOn && 'bbn-toggle-control-active',
        )}
      ></span>
    </button>
  );
};
