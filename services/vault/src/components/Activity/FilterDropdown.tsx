import { Popover } from "@babylonlabs-io/core-ui";
import { useRef, useState } from "react";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";

export interface FilterDropdownOption<V extends string> {
  value: V;
  label: string;
}

interface FilterDropdownProps<V extends string> {
  /** Current selection. `null` renders the placeholder label and marks the
   *  reset row at the top of the menu instead. */
  value: V | null;
  /** Trigger label when nothing is selected, AND the label of the reset row
   *  at the top of the menu that clears the filter. */
  placeholder: string;
  options: ReadonlyArray<FilterDropdownOption<V>>;
  /** Pass `null` to clear the filter (reset row or click the active option). */
  onChange: (value: V | null) => void;
}

export function FilterDropdown<V extends string>({
  value,
  placeholder,
  options,
  onChange,
}: FilterDropdownProps<V>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const activeLabel =
    options.find((option) => option.value === value)?.label ?? placeholder;

  const select = (next: V | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="border-stroke-primary flex items-center gap-2 rounded-[8px] border px-4 py-2 text-[14px] text-accent-primary"
      >
        <span>{activeLabel}</span>
        <RiArrowDownSLine size={20} />
      </button>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-end"
        offset={[0, 8]}
        onClickOutside={() => setOpen(false)}
        className="w-[200px] rounded-[8px] border border-secondary-strokeLight bg-neutral-200 p-4 shadow-[0px_8px_8px_rgba(0,0,0,0.12)]"
      >
        <ul role="listbox" className="flex flex-col gap-4">
          <li
            role="option"
            aria-selected={value === null}
            onClick={() => select(null)}
            className="flex cursor-pointer items-center justify-between text-[14px] text-accent-primary"
          >
            <span>{placeholder}</span>
            {value === null && <RiCheckLine size={20} />}
          </li>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
                onClick={() => select(selected ? null : option.value)}
                className="flex cursor-pointer items-center justify-between text-[14px] text-accent-primary"
              >
                <span>{option.label}</span>
                {selected && <RiCheckLine size={20} />}
              </li>
            );
          })}
        </ul>
      </Popover>
    </>
  );
}
