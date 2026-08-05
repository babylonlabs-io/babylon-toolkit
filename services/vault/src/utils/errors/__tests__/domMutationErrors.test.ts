/**
 * Pins which DOM failures are attributed to a page-translation extension.
 *
 * These errors used to sit in Sentry's `ignoreErrors`, which runs ahead of
 * `beforeSend` — so an app-boundary crash carrying the same message was dropped
 * before any tag could rescue it. The predicates here are what let `beforeSend`
 * drop only the attributable ones.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  hasTranslationExtensionMarkers,
  isReactDomMutationError,
} from "../domMutationErrors";

describe("isReactDomMutationError", () => {
  it.each([
    "NotFoundError: The node to be removed is not a child of this node.",
    "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
    // Safari's wording for the same failure — previously uncovered.
    "NotFoundError: The object can not be found here.",
  ])("matches the DOM-mutation failure %#", (message) => {
    expect(isReactDomMutationError(message)).toBe(true);
  });

  it.each([
    "Cannot redefine property: ethereum",
    "Failed to fetch",
    "The node to be removed is fine actually",
  ])("does not match the unrelated error %#", (message) => {
    expect(isReactDomMutationError(message)).toBe(false);
  });
});

describe("hasTranslationExtensionMarkers", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.body.innerHTML = "";
  });

  it("reports false on an untouched document", () => {
    expect(hasTranslationExtensionMarkers()).toBe(false);
  });

  it("detects Google Translate's html class", () => {
    document.documentElement.classList.add("translated-ltr");

    expect(hasTranslationExtensionMarkers()).toBe(true);
  });

  it("detects a right-to-left Google translation", () => {
    document.documentElement.classList.add("translated-rtl");

    expect(hasTranslationExtensionMarkers()).toBe(true);
  });

  it("detects Edge/Bing Translate's font wrapper", () => {
    document.body.innerHTML = '<font _msttexthash="123">Deposit</font>';

    expect(hasTranslationExtensionMarkers()).toBe(true);
  });

  it("does not treat an ordinary font element as a translation", () => {
    document.body.innerHTML = "<font>Deposit</font>";

    expect(hasTranslationExtensionMarkers()).toBe(false);
  });
});
