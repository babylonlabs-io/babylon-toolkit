import { type RadioProps, Radio } from "@/components/Form/Radio";
import { useField } from "@/widgets/form/hooks";

export interface RadioFieldProps extends RadioProps {
  name: string;
  value: string;
}

export function RadioField({
  name,
  id = name,
  label,
  className,
  disabled,
  value,
  defaultChecked,
  labelClassName,
  orientation,
}: RadioFieldProps) {
  const {
    ref,
    value: selectedValue,
    onChange,
    onBlur,
  } = useField({ name, disabled, defaultValue: defaultChecked ? value : undefined });

  return (
    <Radio
      ref={ref}
      name={name}
      id={id}
      label={label}
      className={className}
      disabled={disabled}
      checked={selectedValue === value}
      value={value}
      labelClassName={labelClassName}
      orientation={orientation}
      inputProps={{ onChange, onBlur }}
    />
  );
}
