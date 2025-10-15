/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_API_URL: string;
  readonly NEXT_PUBLIC_NETWORK: string;
  readonly NEXT_PUBLIC_COMMIT_HASH: string;
  readonly NEXT_PUBLIC_CANONICAL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
