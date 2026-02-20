import { Button, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

interface UnlockFormProps {
  error: string | null;
  onSubmit: (password: string) => void;
  onForgot: () => void;
}

export function UnlockForm({ error, onSubmit, onForgot }: UnlockFormProps) {
  const [password, setPassword] = useState("");

  const handleSubmit = useCallback(() => {
    if (password.length > 0) {
      onSubmit(password);
    }
  }, [password, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && password.length > 0) {
        onSubmit(password);
      }
    },
    [password, onSubmit],
  );

  return (
    <div className="flex flex-col gap-4">
      <Text variant="body2" className="text-accent-secondary">
        Enter your password to unlock your recovery phrase.
      </Text>

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Password"
        className="rounded-md border border-primary-main/20 bg-transparent px-3 py-2 text-sm text-accent-primary outline-none focus:border-primary-main"
        autoComplete="current-password"
        autoFocus
        aria-label="Password"
      />

      {error && (
        <Text variant="body2" className="text-sm text-error-main">
          {error}
        </Text>
      )}

      <Button
        variant="contained"
        className="w-full"
        onClick={handleSubmit}
        disabled={password.length === 0}
      >
        Unlock
      </Button>

      <button
        type="button"
        onClick={onForgot}
        className="text-sm text-accent-secondary underline"
      >
        I lost my password — use recovery phrase instead
      </button>
    </div>
  );
}
