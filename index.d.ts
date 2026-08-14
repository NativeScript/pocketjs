import { View } from '@nativescript/core';

/**
 * Hosts one PocketJS guest (sidecar QuickJS realm + Rust UI core) inside a
 * NativeScript layout. Set `src` to the extensionless base path of a built
 * guest, e.g. `~/assets/pocket/hero-main` for `hero-main.pocketjs` +
 * `hero-main.pak`. Emits `loaded` and `error` (with `message`).
 */
export declare class PocketView extends View {
  /** Extensionless base path of the guest bundle + pak. */
  src: string;
  /** Logical viewport, defaults 480x272 (the pocketjs handheld contract). */
  viewportWidth: number;
  viewportHeight: number;
  /** Raster scale 1..4; 0 (default) picks the screen scale capped at 3. */
  density: number;
  /**
   * Ticks per second: the rate the surface rasters at AND the rate the
   * guest's virtual time advances at. The guest bundle must have been built
   * for the same rate (`pocket ios build --hz=...`), because every duration
   * in it is baked into a frame count. Set before `src`: the rate is
   * published to the guest at mount (`ui.__tickHz`) and a bundle refuses a
   * host driving any other rate; changing it after the guest booted raises
   * the `error` event. 60 (default) everywhere; 120 on ProMotion devices.
   */
  tickRate: number;
  /**
   * Host -> guest message, delivered at the guest's next frame boundary.
   * Objects are JSON-stringified. The guest reads it from its svc poll pump.
   */
  post(message: unknown): void;
}

/**
 * Direction B: the NativeScript runtime is the guest engine. The pocket core
 * renders native-side; the guest bundle at `src` evaluates in the app's own
 * JS context, so guest code reaches the full iOS platform through the
 * NativeScript metadata bindings. Same `src`/viewport/density/tickRate
 * contract and `loaded`/`error`/`effect` events as PocketView.
 */
export declare class PocketHostView extends View {
  src: string;
  viewportWidth: number;
  viewportHeight: number;
  density: number;
  tickRate: number;
  post(message: unknown): void;
}
