import { forwardRef } from "react";
import "./OrangeCheckbox.css";

export interface OrangeCheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const OrangeCheckbox = forwardRef<HTMLInputElement, OrangeCheckboxProps>(
  function OrangeCheckbox({ checked = false, onChange, disabled = false, className = "" }, ref) {
    const handleChange = () => {
      if (!disabled && onChange) {
        onChange(!checked);
      }
    };

    return (
      <div
        className={`bbn-orange-checkbox ${checked ? "bbn-orange-checkbox-checked" : ""} ${
          disabled ? "bbn-orange-checkbox-disabled" : ""
        } ${className}`}
        onClick={handleChange}
        role="checkbox"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            handleChange();
          }
        }}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="bbn-orange-checkbox-input"
          tabIndex={-1}
        />
        {checked && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="bbn-orange-checkbox-icon"
          >
            <path
              d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>
    );
  }
);

