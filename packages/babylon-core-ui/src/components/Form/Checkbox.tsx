import { forwardRef } from "react";

import { type ToggleProps, Toggle } from "./components/Toggle";

export type CheckboxVariant = "default" | "primary" | "secondary";

export interface CheckboxProps extends Omit<ToggleProps, "renderIcon" | "inputType"> {
  variant?: CheckboxVariant;
  showLabel?: boolean;
}

interface CheckboxStyle {
  uncheckedBorderClass: string;
  checkedBorderClass: string;
  checkedBackgroundClass: string;
  checkmarkClass: string;
}

const VARIANT_COLORS = {
  default: {
    color: "fill-current",
    contrastColor: "fill-accent-contrast",
  },
  primary: {
    color: "fill-primary-main",
    contrastColor: "fill-white",
  },
  secondary: {
    color: "fill-secondary-main",
    contrastColor: "fill-black",
  },
} as const;

const getCheckboxStyle = (variant: CheckboxVariant): CheckboxStyle => {
  const colors = VARIANT_COLORS[variant];
  const neutralBorder = "fill-[#8C8C8C]";

  return {
    uncheckedBorderClass: neutralBorder,
    checkedBorderClass: colors.color,
    checkedBackgroundClass: colors.color,
    checkmarkClass: colors.contrastColor,
  };
};

const createIcons = (variant: CheckboxVariant): Record<string, JSX.Element> => {
  const style = getCheckboxStyle(variant);
  
  return {
    false: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          className={style.uncheckedBorderClass}
          d="M19 5V19H5V5H19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
        />
      </svg>
    ),
    true: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
        {/* Checked border */}
        <path
          className={style.checkedBorderClass}
          d="M19 5V19H5V5H19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
        />
        {/* Background fill */}
        <rect
          className={style.checkedBackgroundClass}
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
        />
        {/* Checkmark */}
        <path
          className={style.checkmarkClass}
          d="M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"
        />
      </svg>
    ),
  };
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { variant = "default", showLabel = true, label, ...props },
  ref
) {
  const icons = createIcons(variant);
  
  return (
    <Toggle
      ref={ref}
      {...props}
      label={showLabel ? label : undefined}
      inputType="checkbox"
      renderIcon={(checked) => icons[checked.toString()]}
    />
  );
});
