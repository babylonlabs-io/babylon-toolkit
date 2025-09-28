import { Card } from "@babylonlabs-io/core-ui";

export default function VaultLayout() {
  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-[3rem] px-4">
      <Card className="flex flex-col gap-6 bg-surface p-6">
        <h1 className="text-2xl font-bold text-primary">hello vault</h1>
      </Card>
    </div>
  );
}