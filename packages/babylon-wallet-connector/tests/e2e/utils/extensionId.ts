/**
 * Runtime extension-id resolution for unpacked extensions.
 *
 * The Web Store CRX builds of these wallets ship no manifest `key`, so Chromium derives the runtime
 * id from a hash of the unpack directory's absolute path — it differs from the store id, changes on
 * every version bump, and differs per machine/checkout. Because it is a pure function of the path we
 * can compute it deterministically, which (unlike scanning for the first service worker) stays
 * correct when MULTIPLE extensions are loaded into one context.
 */
import { createHash } from "crypto";

import { getExtensionPath } from "../setup/downloadExtensions";

/** Chromium maps an unpacked extension's absolute path → id: sha256, first 32 hex nibbles → a–p. */
export function pathToExtensionId(absPath: string): string {
  return createHash("sha256")
    .update(absPath)
    .digest("hex")
    .slice(0, 32)
    .split("")
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join("");
}

/** Resolve the runtime id for a wallet's latest downloaded/unpacked extension by its store id. */
export function runtimeExtensionId(storeId: string): string {
  return pathToExtensionId(getExtensionPath(storeId));
}
