import { type CheckboxProps, Checkbox } from "@/components/Form/Checkbox";
import { useField } from "@/widgets/form/hooks";

export interface CheckboxFieldProps extends CheckboxProps {
  name: string;
}

export function CheckboxField({
  name,
  id = name,
  label,
  className,
  disabled,
  value,
  defaultChecked,
  labelClassName,
  orientation,
}: CheckboxFieldProps) {
  const { ref, value: checked = false, onChange, onBlur } = useField<boolean>({ name });

  return (
    <Checkbox
      ref={ref}
      name={name}
      checked={checked}
      id={id}
      label={label}
      className={className}
      disabled={disabled}
      value={value}
      defaultChecked={defaultChecked}
      labelClassName={labelClassName}
      orientation={orientation}
      inputProps={{ onChange, onBlur }}
    />
  );
}
