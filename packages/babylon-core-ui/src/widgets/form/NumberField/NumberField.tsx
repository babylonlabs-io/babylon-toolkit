import { ChangeEventHandler, ReactNode } from "react";

import { FormControl, Input } from "@/components/Form";
import type { FieldProps } from "@/widgets/form/types";
import { useField } from "@/widgets/form/hooks";

export interface NumberFieldProps extends FieldProps {
  type?: "text" | "hidden" | "number" | "password" | "tel" | "url" | "email";
  suffix?: ReactNode;
  prefix?: JSX.Element;
}

const NUMBER_REG_EXP = /^-?\d*\.?\d*$/;

export function NumberField({
  name,
  id = name,
  label,
  hint,
  className,
  controlClassName,
  disabled,
  autoFocus,
  defaultValue,
  placeholder,
  type,
  suffix,
  prefix,
  shouldUnregister,
  state,
  validateOnMount,
}: NumberFieldProps) {
  const {
    ref,
    value = "",
    error,
    invalid,
    onChange,
    onBlur,
  } = useField({ name, defaultValue, autoFocus, shouldUnregister, validateOnMount });

  const fieldState = invalid ? "error" : state;
  const fieldHint = invalid ? error : hint;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    if (NUMBER_REG_EXP.test(e.target.value)) {
      onChange(e.target.value);
    }
  };

  return (
    <FormControl label={label} className={controlClassName} state={fieldState} hint={fieldHint}>
      <Input
        inputMode="decimal"
        pattern="^-?\d*\.?\d*$"
        ref={ref}
        value={value}
        id={id}
        name={name}
        type={type}
        className={className}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        suffix={suffix}
        prefix={prefix}
        state={fieldState}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormControl>
  );
}
