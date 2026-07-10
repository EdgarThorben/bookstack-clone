/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
}

declare namespace App {
  interface Locals {
    user: {
      id: string;
      email: string;
      displayName: string;
    } | null;
  }
}
