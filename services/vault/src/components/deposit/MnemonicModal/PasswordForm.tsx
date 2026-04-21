import { Button, Input, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

interface PasswordFormProps {
  error: string | null;
  onSubmit: (password: string) => void;
}

export function PasswordForm({ error, onSubmit }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordsMatch = password === confirmPassword;
  const isValid = password.length >= 8 && passwordsMatch;

  const handleSubmit = useCallback(() => {
    if (isValid) {
      onSubmit(password);
    }
  }, [isValid, password, onSubmit]);

  return (
    <div className="flex flex-col gap-4">
      <Text variant="body2" className="text-accent-secondary">
        Set a password to encrypt your recovery phrase. You&apos;ll use this
        password to unlock it on future visits.
      </Text>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Text variant="body2" className="text-sm text-accent-secondary">
            Password (min 8 characters)
          </Text>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Text variant="body2" className="text-sm text-accent-secondary">
            Confirm password
          </Text>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {confirmPassword.length > 0 && !passwordsMatch && (
          <Text variant="body2" className="text-sm text-error-main">
            Passwords don&apos;t match.
          </Text>
        )}
      </div>

      {error && (
        <Text variant="body2" className="text-sm text-error-main">
          {error}
        </Text>
      )}

      <Button
        variant="contained"
        className="w-full"
        onClick={handleSubmit}
        disabled={!isValid}
      >
        Encrypt & Continue
      </Button>
    </div>
  );
}
