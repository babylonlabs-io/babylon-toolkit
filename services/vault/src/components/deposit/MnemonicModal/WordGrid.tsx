import { Text } from "@babylonlabs-io/core-ui";

interface WordGridProps {
  words: string[];
}

export function WordGrid({ words }: WordGridProps) {
  return (
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
          <Text variant="body2" className="text-sm font-medium">
            {word}
          </Text>
        </div>
      ))}
    </div>
  );
}
