import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorModal } from "../ErrorModal";

const mockDismissError = vi.fn();
const mockUseError = vi.fn();

vi.mock("@/context/error", () => ({
  useError: () => mockUseError(),
}));

describe("ErrorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders error message when open", () => {
    mockUseError.mockReturnValue({
      isOpen: true,
      error: {
        title: "Test Error",
        message: "Something went wrong",
      },
      modalOptions: {},
      dismissError: mockDismissError,
    });

    render(<ErrorModal />);

    expect(screen.getByText("Test Error")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows cancel button when noCancel is false", () => {
    mockUseError.mockReturnValue({
      isOpen: true,
      error: { message: "Error" },
      modalOptions: { noCancel: false },
      dismissError: mockDismissError,
    });

    render(<ErrorModal />);

    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("hides cancel button when noCancel is true", () => {
    mockUseError.mockReturnValue({
      isOpen: true,
      error: { message: "Error" },
      modalOptions: { noCancel: true },
      dismissError: mockDismissError,
    });

    render(<ErrorModal />);

    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("shows retry button when retryAction is provided", () => {
    const retryAction = vi.fn();
    mockUseError.mockReturnValue({
      isOpen: true,
      error: { message: "Error" },
      modalOptions: { retryAction },
      dismissError: mockDismissError,
    });

    render(<ErrorModal />);

    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("shows blocking message and hides buttons when blocking is true", () => {
    mockUseError.mockReturnValue({
      isOpen: true,
      error: {
        title: "Catastrophic Error",
        message: "Application cannot continue",
      },
      modalOptions: { blocking: true },
      dismissError: mockDismissError,
    });

    render(<ErrorModal />);

    expect(
      screen.getByText("Please refresh the page or try again later."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
    expect(screen.queryByText("Try Again")).not.toBeInTheDocument();
  });
});
