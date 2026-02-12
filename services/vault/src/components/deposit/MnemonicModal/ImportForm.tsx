import { Button, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

interface ImportFormProps {
  error: string | null;
  onSubmit: (mnemonic: string) => void;
  onBack: () => void;
}

export function ImportForm({ error, onSubmit, onBack }: ImportFormProps) {
  const [mnemonic, setMnemonic] = useState("");

  const handleSubmit = useCallback(() => {
    onSubmit(mnemonic);
  }, [mnemonic, onSubmit]);

  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;
  const hasContent = wordCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <Text variant="body2" className="text-accent-secondary">
        Enter your existing 24-word recovery phrase to derive your Lamport key
        for this vault.
      </Text>

      <div className="flex flex-col gap-2">
        <textarea
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          placeholder="Enter your 24-word recovery phrase, separated by spaces..."
          className="h-32 w-full resize-none rounded-md border border-primary-main/20 bg-transparent px-3 py-2 text-sm text-accent-primary outline-none focus:border-primary-main"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {hasContent && (
          <Text variant="body2" className="text-xs text-accent-secondary">
            {wordCount} / 24 words
          </Text>
        )}
      </div>

      {error && (
        <Text variant="body2" className="text-sm text-error-main">
          {error}
        </Text>
      )}

      <div className="flex gap-3">
        <Button variant="outlined" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="contained"
          className="flex-1"
          onClick={handleSubmit}
          disabled={wordCount !== 24}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
