import { Buffer } from "buffer";

globalThis.Buffer = Buffer;

// setup.ts imports bitcoinjs-lib. Load it after Buffer exists in the browser.
await import("./setup");
