import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AmountSlider } from "../AmountSlider";

function renderAmountSlider(maxDecimals: number) {
  const typedValues: string[] = [];
  const onSliderChange = vi.fn();

  render(
    <AmountSlider
      amount={0}
      currencyIcon=""
      currencyName="USDC"
      onAmountChange={(e) => typedValues.push(e.target.value)}
      maxDecimals={maxDecimals}
      sliderValue={0}
      sliderMin={0}
      sliderMax={1000}
      sliderStep={0.0000001}
      onSliderChange={onSliderChange}
    />,
  );

  return {
    input: screen.getByRole<HTMLInputElement>("textbox"),
    slider: screen.getByRole<HTMLInputElement>("slider"),
    typedValues,
    onSliderChange,
  };
}

describe("AmountSlider maxDecimals", () => {
  it("drops a typed digit past maxDecimals", () => {
    const { input, typedValues } = renderAmountSlider(6);

    fireEvent.change(input, { target: { value: "1.000000" } });
    fireEvent.change(input, { target: { value: "1.0000009" } });

    expect(input.value).toBe("1.000000");
    expect(typedValues.at(-1)).toBe("1.000000");
  });

  it("rounds a slider value down to maxDecimals", () => {
    const { slider, onSliderChange } = renderAmountSlider(6);

    fireEvent.change(slider, { target: { value: "617.2839455" } });

    expect(onSliderChange).toHaveBeenLastCalledWith(617.283945);
  });

  it("steps the slider by at least one unit of maxDecimals", () => {
    // renderAmountSlider passes a step of 0.0000001, a tenth of a 6-decimal unit.
    const { slider } = renderAmountSlider(6);

    expect(slider).toHaveAttribute("step", "0.000001");
  });

  it("rejects a maxDecimals that is not a non-negative integer", () => {
    // React logs the render error before rethrowing it; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderAmountSlider(-1)).toThrow("maxDecimals must be a non-negative integer");
    expect(() => renderAmountSlider(6.5)).toThrow("maxDecimals must be a non-negative integer");
  });
});
