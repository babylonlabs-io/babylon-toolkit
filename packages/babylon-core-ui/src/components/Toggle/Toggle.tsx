import { twJoin } from "tailwind-merge";

import { useControlledState } from "@/hooks/useControlledState";
import "./Toggle.css";

export interface ToggleProps {
  value?: boolean;
  defaultValue?: boolean;
  onChange?: (value: boolean) => void;
  activeIcon?: JSX.Element;
  inactiveIcon?: JSX.Element;
}

export function Toggle(props: ToggleProps) {
  const [value = false, setValue] = useControlledState<boolean>({
    value: props.value,
    defaultValue: props.defaultValue,
    onStateChange: props.onChange,
  });

  return (
    <div className="bbn-toggle" onClick={() => void setValue(!value)}>
      <span className="bbn-toggle-bg">{props.activeIcon}</span>
      <span className={twJoin("bbn-toggle-control", value && "bbn-toggle-control-active")} />
      <span className="bbn-toggle-bg">{props.inactiveIcon}</span>
    </div>
  );
}
