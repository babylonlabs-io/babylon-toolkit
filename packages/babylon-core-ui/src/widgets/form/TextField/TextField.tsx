import { ReactNode } from "react";

import { FormControl, Input } from "@/components/Form";
import type { FieldProps } from "@/widgets/form/types";
import { useField } from "@/widgets/form/hooks";

export interface TextFieldProps extends FieldProps {
  type?: "text" | "hidden" | "number" | "password" | "tel" | "url" | "email";
  suffix?: ReactNode;
  prefix?: JSX.Element;
}

export function TextField({
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
}: TextFieldProps) {
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

  return (
    <FormControl label={label} className={controlClassName} state={fieldState} hint={fieldHint}>
      <Input
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
        onChange={onChange}
        onBlur={onBlur}
      />
    </FormControl>
  );
}
