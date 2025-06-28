export interface FieldProps {
  id?: string;
  label?: string | JSX.Element;
  name: string;
  autoFocus?: boolean;
  className?: string;
  controlClassName?: string;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
  hint?: string | JSX.Element;
  shouldUnregister?: boolean;
  state?: "default" | "error" | "warning";
  validateOnMount?: boolean;
}
