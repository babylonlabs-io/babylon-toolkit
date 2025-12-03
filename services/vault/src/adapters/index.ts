import { MorphoAdapter } from "./morpho";
import { registerAdapter } from "./registry";

export { MorphoAdapter } from "./morpho";
export * from "./registry";
export * from "./types";

registerAdapter(new MorphoAdapter());
