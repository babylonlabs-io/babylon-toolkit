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
import "./SelectWithIcon.css";
import { useResizeObserver } from "@/hooks/useResizeObserver";

type Value = string | number;

export interface OptionWithIcon {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface SelectWithIconProps {
  id?: string;
  name?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  defaultValue?: Value;
  value?: Value;
  placeholder?: string;
  options?: OptionWithIcon[];
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
}

export const SelectWithIcon = forwardRef<HTMLDivElement, SelectWithIconProps>(
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
      (option: OptionWithIcon) => {
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
          className={twJoin(
            "bbn-select-with-icon",
            disabled && "bbn-select-with-icon-disabled",
            `bbn-select-with-icon-${state}`,
            className,
          )}
          onClick={handleClick}
          tabIndex={disabled ? -1 : 0}
          {...props}
        >
          <div className="bbn-select-with-icon-content">
            {selectedOption?.icon && <div className="bbn-select-with-icon-image">{selectedOption.icon}</div>}
            <span className="bbn-select-with-icon-text" title={selectedOption?.label || placeholder}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          <RiArrowDownSLine
            className={twJoin("bbn-select-with-icon-arrow", isOpen && "bbn-select-with-icon-arrow-open")}
            size={35}
          />
        </div>

        <Popover
          anchorEl={anchorEl.current}
          className={twJoin("bbn-select-with-icon-menu custom-scrollbar", popoverClassName)}
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
                "bbn-select-with-icon-option",
                selectedOption?.value === option.value && "bbn-select-with-icon-option-selected",
                optionClassName,
              )}
              onClick={() => handleSelect(option)}
            >
              {option.icon && <div className="bbn-select-with-icon-option-image">{option.icon}</div>}
              <span className="bbn-select-with-icon-option-text">{option.label}</span>
            </div>
          ))}
        </Popover>
      </>
    );
  },
);

SelectWithIcon.displayName = "SelectWithIcon";
