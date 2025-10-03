import { BorrowCard } from "@babylonlabs-io/core-ui";

export function Borrow() {

  const handleNewBorrow = () => {
    console.log("New borrow clicked");
  };

  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-8 px-4 py-8">
      <BorrowCard onNewBorrow={handleNewBorrow} />
    </div>
  );
}

