import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FilterDropdown } from "../FilterDropdown";

const options = [
  { value: "deposits", label: "Deposits" },
  { value: "borrowed", label: "Borrowed" },
];

describe("FilterDropdown", () => {
  it("renders the placeholder on the trigger when no value is selected", () => {
    render(
      <FilterDropdown
        value={null}
        placeholder="Show all"
        options={options}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /show all/i }),
    ).toBeInTheDocument();
  });

  it("renders the selected option's label when a value is set", () => {
    render(
      <FilterDropdown
        value="borrowed"
        placeholder="Show all"
        options={options}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /borrowed/i }),
    ).toBeInTheDocument();
  });

  it("opens the menu on trigger click and shows all options", () => {
    render(
      <FilterDropdown
        value={null}
        placeholder="Show all"
        options={options}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("marks the currently selected option with aria-selected", () => {
    render(
      <FilterDropdown
        value="borrowed"
        placeholder="Show all"
        options={options}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const selected = screen.getByRole("option", { selected: true });
    expect(selected).toHaveTextContent("Borrowed");
  });

  it("calls onChange with the value when an unselected option is clicked", () => {
    const onChange = vi.fn();
    render(
      <FilterDropdown
        value={null}
        placeholder="Show all"
        options={options}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Deposits" }));
    expect(onChange).toHaveBeenCalledWith("deposits");
  });

  it("calls onChange with null when the already-selected option is clicked", () => {
    const onChange = vi.fn();
    render(
      <FilterDropdown
        value="borrowed"
        placeholder="Show all"
        options={options}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Borrowed" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("sets aria-expanded to reflect open state", () => {
    render(
      <FilterDropdown
        value={null}
        placeholder="Show all"
        options={options}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
