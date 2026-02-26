import { Button, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useRef, useState } from "react";

const WORD_COUNT = 12;

interface ImportFormProps {
  error: string | null;
  onSubmit: (mnemonic: string) => void;
  onBack: () => void;
  backLabel?: string;
}

export function ImportForm({
  error,
  onSubmit,
  onBack,
  backLabel = "Back",
}: ImportFormProps) {
  const [words, setWords] = useState<string[]>(Array(WORD_COUNT).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const filledCount = words.filter((w) => w.trim().length > 0).length;
  const isComplete = filledCount === WORD_COUNT;

  const handleWordChange = useCallback((index: number, value: string) => {
    const trimmed = value.trim();
    const pastedWords = trimmed.split(/\s+/).filter(Boolean);

    if (pastedWords.length > 1) {
      setWords((prev) => {
        const next = [...prev];
        for (let i = 0; i < pastedWords.length && index + i < WORD_COUNT; i++) {
          next[index + i] = pastedWords[i].toLowerCase();
        }
        return next;
      });
      const focusIndex = Math.min(index + pastedWords.length, WORD_COUNT) - 1;
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    setWords((prev) => {
      const next = [...prev];
      next[index] = value.toLowerCase();
      return next;
    });
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === " " || e.key === "Tab") {
        if (e.key === " ") e.preventDefault();
        if (index < WORD_COUNT - 1) {
          inputRefs.current[index + 1]?.focus();
        }
      } else if (e.key === "Backspace" && words[index] === "" && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [words],
  );

  const handleSubmit = useCallback(() => {
    onSubmit(words.map((w) => w.trim()).join(" "));
  }, [words, onSubmit]);

  return (
    <div className="flex flex-col gap-4">
      <Text variant="body2" className="text-accent-secondary">
        Enter your existing 12-word recovery phrase to derive your Lamport key
        for this vault.
      </Text>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary-contrast/5 p-4">
        {words.map((word, index) => (
          <div
            key={index}
            className="flex items-center gap-2 rounded-md bg-secondary-contrast/10 px-3 py-2"
          >
            <Text
              variant="body2"
              className="min-w-[1.5rem] text-xs text-accent-secondary"
            >
              {index + 1}.
            </Text>
            <input
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              value={word}
              onChange={(e) => handleWordChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-full bg-transparent text-sm font-medium text-accent-primary outline-none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Word ${index + 1}`}
            />
          </div>
        ))}
      </div>

      {error && (
        <Text variant="body2" className="text-sm text-error-main">
          {error}
        </Text>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="contained"
          className="w-full"
          onClick={handleSubmit}
          disabled={!isComplete}
        >
          Continue
        </Button>
        <Button variant="outlined" className="w-full" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </div>
  );
}
