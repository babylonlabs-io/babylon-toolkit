import { describe, expect, it } from "vitest";

import { validateRequiredAddress, validateRequiredUrl } from "@/config/env";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

describe("validateRequiredAddress", () => {
  it("accepts a valid EVM address", () => {
    const errors: string[] = [];
    const result = validateRequiredAddress(VALID_ADDRESS, "MY_VAR", errors);
    expect(result).toBe(VALID_ADDRESS);
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing value", () => {
    const errors: string[] = [];
    const result = validateRequiredAddress(undefined, "MY_VAR", errors);
    expect(result).toBe(ZERO_ADDRESS);
    expect(errors).toContainEqual(expect.stringContaining("MY_VAR is missing"));
  });

  it("rejects an empty string", () => {
    const errors: string[] = [];
    const result = validateRequiredAddress("", "MY_VAR", errors);
    expect(result).toBe(ZERO_ADDRESS);
    expect(errors).toContainEqual(expect.stringContaining("MY_VAR is missing"));
  });

  it("rejects a malformed address", () => {
    const errors: string[] = [];
    const result = validateRequiredAddress("0x1234", "MY_VAR", errors);
    expect(result).toBe(ZERO_ADDRESS);
    expect(errors).toContainEqual(
      expect.stringContaining("not a valid EVM address"),
    );
  });

  it("rejects a non-hex string", () => {
    const errors: string[] = [];
    const result = validateRequiredAddress("not-an-address", "MY_VAR", errors);
    expect(result).toBe(ZERO_ADDRESS);
    expect(errors).toContainEqual(
      expect.stringContaining("not a valid EVM address"),
    );
  });

  it("rejects the zero address", () => {
    const errors: string[] = [];
    const result = validateRequiredAddress(ZERO_ADDRESS, "MY_VAR", errors);
    expect(result).toBe(ZERO_ADDRESS);
    expect(errors).toContainEqual(
      expect.stringContaining("must not be the zero address"),
    );
  });

  it("includes the env var name in the error message", () => {
    const errors: string[] = [];
    validateRequiredAddress(
      "0x1234",
      "NEXT_PUBLIC_TBV_AAVE_CONTROLLER",
      errors,
    );
    expect(errors[0]).toContain("NEXT_PUBLIC_TBV_AAVE_CONTROLLER");
  });
});

describe("validateRequiredUrl", () => {
  it("accepts a valid https URL", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl(
      "https://api.example.com",
      "MY_VAR",
      errors,
    );
    expect(result).toBe("https://api.example.com");
    expect(errors).toHaveLength(0);
  });

  it("accepts a valid http URL", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl(
      "http://localhost:3000",
      "MY_VAR",
      errors,
    );
    expect(result).toBe("http://localhost:3000");
    expect(errors).toHaveLength(0);
  });

  it("preserves a URL with a path", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl(
      "https://api.example.com/v1/graphql",
      "MY_VAR",
      errors,
    );
    expect(result).toBe("https://api.example.com/v1/graphql");
    expect(errors).toHaveLength(0);
  });

  it("strips a trailing slash", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl(
      "https://api.example.com/",
      "MY_VAR",
      errors,
    );
    expect(result).toBe("https://api.example.com");
    expect(errors).toHaveLength(0);
  });

  it("strips a trailing slash followed by whitespace", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl(
      "https://api.example.com/ ",
      "MY_VAR",
      errors,
    );
    expect(result).toBe("https://api.example.com");
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing value", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl(undefined, "MY_VAR", errors);
    expect(result).toBe("");
    expect(errors).toContainEqual(expect.stringContaining("MY_VAR is missing"));
  });

  it("rejects an empty string", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl("", "MY_VAR", errors);
    expect(result).toBe("");
    expect(errors).toContainEqual(expect.stringContaining("MY_VAR is missing"));
  });

  it("rejects a malformed URL", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl("not-a-url", "MY_VAR", errors);
    expect(result).toBe("");
    expect(errors).toContainEqual(expect.stringContaining("not a valid URL"));
  });

  it("rejects a non-http/https scheme", () => {
    const errors: string[] = [];
    const result = validateRequiredUrl("ftp://example.com", "MY_VAR", errors);
    expect(result).toBe("");
    expect(errors).toContainEqual(
      expect.stringContaining("must use http or https scheme"),
    );
  });

  it("includes the env var name in the error message", () => {
    const errors: string[] = [];
    validateRequiredUrl(
      "not-a-url",
      "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
      errors,
    );
    expect(errors[0]).toContain("NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT");
  });
});
