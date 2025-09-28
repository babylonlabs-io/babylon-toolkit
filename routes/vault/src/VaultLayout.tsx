import { Card } from "@babylonlabs-io/core-ui";

export default function VaultLayout() {
  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-12 px-4">
      <Card className="bg-surface flex flex-col gap-6 p-6">
        <h1 className="text-primary text-2xl font-bold">hello vault</h1>
      </Card>
    </div>
  );
}