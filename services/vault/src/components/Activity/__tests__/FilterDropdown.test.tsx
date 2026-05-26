import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterDropdown } from "../FilterDropdown";

const options = [
  { value: "all", label: "Show all" },
  { value: "deposits", label: "Deposits" },
  { value: "borrowed", label: "Borrowed" },
];

describe("FilterDropdown", () => {
  it("renders the active option's label on the trigger", () => {
    render(
      <FilterDropdown value="all" options={options} onChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /show all/i }),
    ).toBeInTheDocument();
  });

  it("opens the menu on trigger click and shows all options", () => {
    render(
      <FilterDropdown value="all" options={options} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks the currently selected option with aria-selected", () => {
    render(
      <FilterDropdown value="borrowed" options={options} onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const selected = screen.getByRole("option", { selected: true });
    expect(selected).toHaveTextContent("Borrowed");
  });

  it("calls onChange and closes the menu when an option is clicked", () => {
    const onChange = vi.fn();
    render(
      <FilterDropdown value="all" options={options} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Deposits" }));
    expect(onChange).toHaveBeenCalledWith("deposits");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("sets aria-expanded to reflect open state", () => {
    render(
      <FilterDropdown value="all" options={options} onChange={() => {}} />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
