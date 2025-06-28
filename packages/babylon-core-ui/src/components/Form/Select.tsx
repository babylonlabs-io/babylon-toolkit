import {
  type ReactNode,
  type CSSProperties,
  forwardRef,
  useCallback,
  useRef,
  useMemo,
  useImperativeHandle,
} from "react";
import { twJoin } from "tailwind-merge";
import { RiArrowDownSLine } from "react-icons/ri";

import { Popover } from "@/components/Popover";
import { useControlledState } from "@/hooks/useControlledState";
import "./Select.css";
import { useResizeObserver } from "@/hooks/useResizeObserver";

type Value = string | number;

export interface Option {
  value: string;
  label: string;
}

export interface SelectProps {
  id?: string;
  name?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  defaultValue?: Value;
  value?: Value;
  placeholder?: string;
  options?: Option[];
  style?: CSSProperties;
  className?: string;
  optionClassName?: string;
  popoverClassName?: string;
  state?: "default" | "error" | "warning";
  onSelect?: (value: Value) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  renderSelectedOption?: (option: Option) => ReactNode;
}

const defaultOptionRenderer = (option: Option) => option.label;

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      disabled,
      className,
      value,
      defaultValue,
      placeholder = "Select option",
      open,
      defaultOpen,
      options = [],
      optionClassName,
      popoverClassName,
      state = "default",
      onOpen,
      onSelect,
      onClose,
      renderSelectedOption = defaultOptionRenderer,
      ...props
    },
    ref,
  ) => {
    const anchorEl = useRef<HTMLDivElement>(null);
    useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(ref, () => anchorEl.current, []);
    const { width } = useResizeObserver(anchorEl.current);

    const [isOpen, setIsOpen] = useControlledState({
      value: open,
      defaultValue: defaultOpen,
      onStateChange: (open) => void (open ? onOpen?.() : onClose?.()),
    });

    const [selectedValue, setSelectedValue] = useControlledState({
      value,
      defaultValue,
      onStateChange: onSelect,
    });

    const selectedOption = useMemo(
      () => options.find((option) => option.value === selectedValue),
      [options, selectedValue],
    );

    const handleSelect = useCallback(
      (option: Option) => {
        setSelectedValue(option.value);
        setIsOpen(false);
      },
      [setSelectedValue, setIsOpen],
    );

    const handleClose = useCallback(() => {
      setIsOpen(false);
    }, [setIsOpen]);

    const handleClick = useCallback(() => {
      if (disabled) return;

      setIsOpen(!isOpen);
    }, [isOpen, disabled, setIsOpen]);

    return (
      <>
        <div
          ref={anchorEl}
          className={twJoin("bbn-select", disabled && "bbn-select-disabled", `bbn-select-${state}`, className)}
          onClick={handleClick}
          tabIndex={disabled ? -1 : 0}
          {...props}
        >
          <span>{selectedOption ? renderSelectedOption(selectedOption) : placeholder}</span>
          <RiArrowDownSLine className={twJoin("bbn-select-icon", isOpen && "bbn-select-icon-open")} size={20} />
        </div>

        <Popover
          anchorEl={anchorEl.current}
          className={twJoin("bbn-select-menu custom-scrollbar", popoverClassName)}
          open={isOpen && !disabled}
          onClickOutside={handleClose}
          offset={[0, 4]}
          placement="bottom-start"
          style={{ width }}
        >
          {options.map((option) => (
            <div
              key={option.value}
              className={twJoin(
                "bbn-select-option",
                selectedOption?.value === option.value && "bbn-select-option-selected",
                optionClassName,
              )}
              onClick={() => handleSelect(option)}
            >
              {option.label}
            </div>
          ))}
        </Popover>
      </>
    );
  },
);

Select.displayName = "Select";
