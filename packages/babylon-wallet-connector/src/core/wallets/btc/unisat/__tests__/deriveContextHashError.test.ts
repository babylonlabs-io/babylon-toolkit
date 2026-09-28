import { expect, test } from "vitest";

import { ERROR_CODES, WalletError } from "@/error";

import { mapUnisatDeriveContextHashError } from "../deriveContextHashError";

test("maps the UniSat account refusal to WALLET_ACCOUNT_NOT_SUPPORTED", () => {
  const rejection = {
    code: -32603,
    message: "Current keyring does not support deriveContextHash",
    data: {
      originalError: {
        message: "Current keyring does not support deriveContextHash",
      },
    },
  };

  const error = mapUnisatDeriveContextHashError(rejection, "Unisat");

  expect(error).toBeInstanceOf(WalletError);
  expect(error).toMatchObject({
    code: ERROR_CODES.WALLET_ACCOUNT_NOT_SUPPORTED,
    wallet: "Unisat",
    message:
      "The selected account cannot create the deposit secret. Switch to an account created from a recovery phrase or a private key, then try again.",
  });
});

test("keeps other UniSat errors with the same RPC code unchanged", () => {
  const rejection = { code: -32603, message: "Invalid context length" };

  expect(mapUnisatDeriveContextHashError(rejection, "Unisat")).toBe(rejection);
});

test("requires the exact UniSat account refusal message", () => {
  const rejection = {
    message: "Current keyring does not support deriveContextHash for this input",
  };

  expect(mapUnisatDeriveContextHashError(rejection, "Unisat")).toBe(rejection);
});

test("keeps Error instances unchanged for unrelated failures", () => {
  const rejection = new Error("Wallet is locked");

  expect(mapUnisatDeriveContextHashError(rejection, "Unisat")).toBe(rejection);
});
