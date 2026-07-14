/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AAC_FRONT_PIN_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
