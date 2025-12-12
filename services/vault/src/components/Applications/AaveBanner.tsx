import { Button } from "@babylonlabs-io/core-ui";

interface AaveBannerProps {
  onExplore: () => void;
}

export function AaveBanner({ onExplore }: AaveBannerProps) {
  return (
    <div
      className="relative mx-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-4 overflow-hidden rounded-2xl p-6 md:mx-0 md:grid-cols-[1fr_auto] md:gap-8 md:p-16"
      style={{
        background:
          // radial-gradient(<ellipse width> <ellipse height> at <centerX> <centerY>, <color-stop1>, <color-stop2>, <color-stop3>)
          "radial-gradient(450% 500% at 210% 220%, #A1A0EF 50%, #8D8CED 50.1%, #9896FF 100%)",
      }}
    >
      <h4 className="col-start-1 row-start-1 text-[32px] font-bold leading-tight text-white md:col-start-1 md:row-start-1 md:max-w-[440px] md:text-[40px]">
        Aave
      </h4>

      <div className="col-start-2 row-start-1 flex-shrink-0 md:col-start-2 md:row-span-3 md:row-start-1 md:self-center">
        <img
          src="/images/aave-logomark.svg"
          alt="Aave"
          className="h-[60px] w-[114px] object-contain md:h-[100px] md:w-[190px]"
        />
      </div>

      <p className="col-span-2 max-w-full text-[16px] leading-[1.6] text-black md:col-span-1 md:col-start-1 md:row-start-2 md:max-w-[440px] md:text-[20px]">
        Aave is a leading DeFi protocol where users can supply liquidity to earn
        interest or borrow assets using their crypto as collateral.
      </p>

      <div className="col-span-2 mt-2 md:col-span-1 md:col-start-1 md:row-start-3">
        <Button
          variant="outlined"
          rounded
          className="!border-white !bg-white !text-black hover:!bg-white/90"
          onClick={onExplore}
        >
          Explore
        </Button>
      </div>
    </div>
  );
}
