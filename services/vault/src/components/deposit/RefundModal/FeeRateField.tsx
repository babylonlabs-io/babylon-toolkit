import { Input } from "@babylonlabs-io/core-ui";
import { useEffect, useRef, useState } from "react";
import { MdEdit } from "react-icons/md";

interface FeeRateFieldProps {
  value: number;
  onChange: (next: number) => void;
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
  // Pressing Enter calls commit(), then setEditing(false) unmounts the
  // Input — the synthetic blur React fires would re-enter commit() with the
  // same draft and re-fire onChange. Guard so commit() runs at most once
  // per editing session.
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      committedRef.current = false;
      inputRef.current?.focus();
    }
  }, [editing]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed > 0 && parsed !== value) {
      onChange(parsed);
    }
    setEditing(false);
  };

  const cancel = () => {
    committedRef.current = true;
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
