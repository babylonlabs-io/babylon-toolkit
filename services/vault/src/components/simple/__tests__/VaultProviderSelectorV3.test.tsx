import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { useReferredVaultProvider } from "@/hooks/useReferredVaultProvider";
import type { VaultProviderListItem } from "@/types/vaultProvider";

import { VaultProviderSelectorV3 } from "../VaultProviderSelectorV3";

// No vault provider link by default; the sort-note tests set one.
vi.mock("@/hooks/useReferredVaultProvider", () => ({
  useReferredVaultProvider: vi.fn(() => null),
}));

const PROVIDER: VaultProviderListItem = {
  id: "0xaf8d9d665f4e27f3966a074dce5c50684bfbe358",
  name: "Figment",
  btcPubkey: "aa".repeat(32),
  unavailable: false,
  unhealthy: false,
};

function renderPicker(providers: VaultProviderListItem[]) {
  render(
    <VaultProviderSelectorV3
      providers={providers}
      isLoadingProviders={false}
      selectedProvider=""
      onProviderSelect={vi.fn()}
      expanded
      onExpandedChange={vi.fn()}
    />,
  );
}

afterEach(() => {
  vi.mocked(useReferredVaultProvider).mockReturnValue(null);
});

describe("VaultProviderSelectorV3", () => {
  it("copies a link that preselects the provider, without selecting its row", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onProviderSelect = vi.fn();

    render(
      <VaultProviderSelectorV3
        providers={[PROVIDER]}
        isLoadingProviders={false}
        selectedProvider=""
        onProviderSelect={onProviderSelect}
        expanded
        onExpandedChange={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: COPY.deposit.form.providerCopyLinkLabel("Figment"),
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/?vp=0xaf8d9d665f4e27f3966a074dce5c50684bfbe358`,
    );
    expect(onProviderSelect).not.toHaveBeenCalled();
  });

  it("says the linked provider is listed first while a link pins it", () => {
    vi.mocked(useReferredVaultProvider).mockReturnValue(PROVIDER.id);

    renderPicker([PROVIDER]);

    expect(
      screen.getByText(COPY.deposit.form.providerSortNotePinned),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.form.providerSortNote),
    ).not.toBeInTheDocument();
  });

  it("keeps the plain sort note while the linked provider is not the first row", () => {
    // The form pins only once the provider's health is known; until then the
    // list is in its sorted order and the note must not claim a pin.
    vi.mocked(useReferredVaultProvider).mockReturnValue(PROVIDER.id);
    const other: VaultProviderListItem = {
      ...PROVIDER,
      id: "0x1234567890abcdef1234567890abcdef12345678",
      name: "Other",
    };

    renderPicker([other, PROVIDER]);

    expect(
      screen.getByText(COPY.deposit.form.providerSortNote),
    ).toBeInTheDocument();
  });

  it("keeps the plain sort note when the linked provider is unhealthy and so not pinned", () => {
    vi.mocked(useReferredVaultProvider).mockReturnValue(PROVIDER.id);

    renderPicker([{ ...PROVIDER, unhealthy: true }]);

    expect(
      screen.getByText(COPY.deposit.form.providerSortNote),
    ).toBeInTheDocument();
  });
});
