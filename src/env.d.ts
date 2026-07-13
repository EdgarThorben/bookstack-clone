/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly CREDENTIALS_ENCRYPTION_KEY: string;
}

declare namespace App {
  interface Locals {
    user: {
      id: string;
      email: string;
      displayName: string;
    } | null;
    lang: import("./lib/i18n").Lang;
  }
}
