/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. https://birdcage-cautious-whale.abasthan.app */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
