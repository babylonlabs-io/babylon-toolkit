import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { installGlobalBuffer } from "../globalBuffer";

describe("installGlobalBuffer", () => {
  it("sets the buffer package's Buffer when the host has none", () => {
    const host: { Buffer?: typeof Buffer } = {};

    installGlobalBuffer(host);

    expect(host.Buffer).toBe(Buffer);
  });

  it("keeps a Buffer the host already has", () => {
    const existing = function ExistingBuffer() {} as unknown as typeof Buffer;
    const host = { Buffer: existing };

    installGlobalBuffer(host);

    expect(host.Buffer).toBe(existing);
  });
});
