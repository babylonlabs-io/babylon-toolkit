import {
  type ChangeEvent,
  type DetailedHTMLProps,
  type FocusEventHandler,
  type HTMLAttributes,
  type JSX,
  forwardRef,
} from "react";
import { twJoin } from "tailwind-merge";
import "./Toggle.css";

import { Text } from "@/components/Text";
import { useControlledState } from "@/hooks/useControlledState";

export interface ToggleProps {
  id?: string;
  name?: string;
  label?: string | JSX.Element;
  inputType: "radio" | "checkbox";
  orientation?: "left" | "right";
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  inputProps?: Omit<
    DetailedHTMLProps<HTMLAttributes<HTMLInputElement>, HTMLInputElement>,
    "id" | "name" | "value" | "checked" | "defaultChecked" | "disabled" | "ref"
  > & {
    pattern?: string;
  };
  renderIcon: (checked: boolean) => JSX.Element;
  onChange?: (value?: boolean) => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  {
    label,
    checked,
    defaultChecked = false,
    inputProps,
    orientation = "left",
    disabled = false,
    className,
    inputType,
    labelClassName,
    renderIcon,
    onChange,
    ...restProps
  },
  ref,
) {
  const [checkedState = false, setCheckedState] = useControlledState({
    value: checked,
    defaultValue: defaultChecked,
    onStateChange: onChange,
  });

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setCheckedState(e.currentTarget.checked);
    inputProps?.onChange?.(e);
  }

  const toggle = (
    <span className={twJoin("bbn-switcher", disabled && "bbn-switcher-disabled", className)}>
      {renderIcon(checkedState)}

      <input
        ref={ref}
        type={inputType}
        disabled={disabled}
        className="bbn-switcher-input"
        {...restProps}
        {...inputProps}
        checked={checkedState}
        onChange={handleChange}
      />
    </span>
  );

  if (label) {
    return (
      <Text
        as="label"
        variant="body1"
        className={twJoin(
          "bbn-switcher-label",
          orientation === "left" ? "bbn-switcher-left" : "bbn-switcher-right",
          labelClassName,
        )}
      >
        {toggle}
        {label}
      </Text>
    );
  }

  return toggle;
});
