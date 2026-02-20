import { Button, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

import type { VerificationChallenge } from "@/services/lamport";

interface VerificationFormProps {
  challenge: VerificationChallenge;
  error: string | null;
  onSubmit: (answers: string[]) => void;
  onBack: () => void;
}

export function VerificationForm({
  challenge,
  error,
  onSubmit,
  onBack,
}: VerificationFormProps) {
  const [answers, setAnswers] = useState<string[]>(() =>
    new Array(challenge.indices.length).fill(""),
  );

  const handleAnswerChange = useCallback(
    (index: number, value: string) => {
      const next = [...answers];
      next[index] = value;
      setAnswers(next);
    },
    [answers],
  );

  const handleSubmit = useCallback(() => {
    onSubmit(answers);
  }, [answers, onSubmit]);

  const allFilled = answers.every((a) => a.trim().length > 0);

  return (
    <div className="flex flex-col gap-4">
      <Text variant="body2" className="text-accent-secondary">
        To verify you&apos;ve saved your recovery phrase, enter the following
        words:
      </Text>

      <div className="flex flex-col gap-3">
        {challenge.indices.map((wordIndex, i) => (
          <div key={wordIndex} className="flex items-center gap-3">
            <Text
              variant="body2"
              className="min-w-[4rem] text-sm text-accent-secondary"
            >
              Word #{wordIndex + 1}
            </Text>
            <input
              type="text"
              value={answers[i]}
              onChange={(e) => handleAnswerChange(i, e.target.value)}
              className="flex-1 rounded-md border border-primary-main/20 bg-transparent px-3 py-2 text-sm text-accent-primary outline-none focus:border-primary-main"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Word #${wordIndex + 1}`}
            />
          </div>
        ))}
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
          disabled={!allFilled}
        >
          Verify
        </Button>
      </div>
    </div>
  );
}
