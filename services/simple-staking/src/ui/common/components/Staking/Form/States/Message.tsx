import { Heading, Text } from "@babylonlabs-io/core-ui";

interface MessageProps {
  title: string;
  message: React.ReactNode;
  icon: JSX.Element;
}

export const Message: React.FC<MessageProps> = ({ title, message, icon }) => {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        {icon}
        <div className="flex flex-col items-center justify-center gap-2 self-stretch">
          <Heading
            variant="h5"
            className="text-center text-2xl text-accent-primary"
          >
            {title}
          </Heading>
          <Text
            variant="body1"
            className="whitespace-pre-line p-0 text-center text-base text-accent-secondary"
          >
            {message}
          </Text>
        </div>
      </div>
    </div>
  );
};
