/**
 * wasm-bindgen rethrows Rust `JsValue::from_str(...)` errors as bare strings,
 * which break `err instanceof Error` and structured error handling. Normalize
 * to `Error` so the JS API surface is consistent with idiomatic JS rejection.
 */
export function toError(err: unknown, fnName: string): Error {
  if (err instanceof Error) return err;
  const msg = typeof err === 'string' ? err : String(err);
  return new Error(`${fnName}: ${msg}`);
}
