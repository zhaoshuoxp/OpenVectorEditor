import type { DesktopApi } from "@ove/contracts";

declare global {
  interface Window {
    desktopApi: DesktopApi;
    toastr?: {
      success(message: string): void;
      warning(message: string): void;
      error(message: string): void;
    };
  }
}

export {};
