/**
 * FeeRateField
 *
 * Inline editable sat/vB control for the Review Refund card. Read-only by
 * default ("X sats/vB" + pencil affordance); clicks reveal a number input.
 * Commits the new value on blur or Enter; reverts on Escape.
 */

import { Input } from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import { MdEdit } from "react-icons/md";

interface FeeRateFieldProps {
  value: number;
  onChange: (next: number) => void;
  /** Disable editing (e.g. while broadcasting). */
  disabled?: boolean;
}

export function FeeRateField({
  value,
  onChange,
  disabled = false,
}: FeeRateFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    // The SDK rounds via ceil(feeRate * vbytes), so fractional rates are
    // valid. Use Number() (not parseInt) so e.g. "1.5" doesn't silently
    // floor to 1.
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== value) {
      onChange(parsed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(String(value));
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={0.1}
        step={0.1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        suffix={<span className="text-sm text-accent-secondary">sats/vB</span>}
        wrapperClassName="w-[140px]"
        className="text-right"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 text-base text-accent-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>{value} sats/vB</span>
      <MdEdit className="text-accent-secondary" aria-hidden="true" size={16} />
    </button>
  );
}
