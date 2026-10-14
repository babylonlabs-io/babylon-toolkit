/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** JSON of the network profile selected at build time (see vite.config.ts). */
  readonly TBV_NETWORK_PROFILE: string;
}

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}
