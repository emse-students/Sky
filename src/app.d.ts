import type { SessionUser } from '#lib/types/api.js';

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
    }
  }
}

export {};
