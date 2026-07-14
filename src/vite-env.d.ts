/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AAC_FRONT_PIN_HASH?: string;
  readonly VITE_AAC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
