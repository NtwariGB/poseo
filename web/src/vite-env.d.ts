/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UI-302 : tenant LM-FR du seed, identifié par son UUID. */
  readonly VITE_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
