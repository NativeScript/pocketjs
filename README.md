# @nativescript/pocketjs

[PocketJS](https://pocketjs.dev) surfaces inside NativeScript iOS apps, in both directions:

- **`PocketView`** - hosts a PocketJS guest in a sidecar QuickJS realm embedded in
  `PocketApple.xcframework`. The host app's own JS runtime is untouched; the guest talks to the
  app over a JSON-line service channel (`effect` event / `post()`).
- **`PocketHostView`** - the NativeScript runtime itself is the guest engine. The pocket core
  renders native-side, `globalThis.ui` delegates each op over the NativeScript metadata bridge,
  and the guest bundle evaluates in the app's own JS context - so guest code can reach the entire
  iOS platform (`UIDevice`, and everything else the metadata bindings expose) directly.

## Install

```sh
npm install @nativescript/pocketjs
```

Requirements: iOS 16+, and an arm64 device or simulator - the bundled `PocketApple.xcframework`
ships `ios-arm64` and `ios-arm64-simulator` slices only. Add to `App_Resources/iOS/build.xcconfig`:

```
EXCLUDED_ARCHS[sdk=iphonesimulator*] = i386 armv6 armv7 armv7s armv8 x86_64
```

## Usage

Guest apps are built with the PocketJS toolchain (`bun tools/build.ts apps/<name>/main.tsx` in a
[pocket-stack/pocketjs](https://github.com/pocket-stack/pocketjs) checkout, or `pocket ios build`)
and staged into the app as two assets: `<name>.pocketjs` (the JS bundle, renamed so webpack treats
it as an opaque asset) and `<name>.pak` (styles, fonts, images). `src` is the extensionless base
path.

```ts
import { PocketView, PocketHostView } from '@nativescript/pocketjs';

const pocket = new PocketView(); // or new PocketHostView()
pocket.viewportWidth = 480;      // logical viewport, default 480x272
pocket.viewportHeight = 272;
pocket.density = 3;              // raster scale 1..4; MUST match the density the guest was built with
pocket.tickRate = 120;           // ticks/sec, default 60; MUST match the rate the guest was built with
pocket.on('effect', (event) => { /* guest -> host JSON lines */ });
pocket.on('loaded', () => {});
pocket.on('error', (event) => console.error(event.message));
pocket.src = '~/assets/pocket/nsengine-main';
```

Host → guest replies go through `pocket.post({ t: 'result', id, result })`; the guest receives
them at its next frame boundary via its svc poll pump.

`density = 0` (the default) picks the screen scale capped at 3. Glyph atlases bake at guest build
time, so a surface density that differs from the guest's build density renders soft text - set it
explicitly to the build density.

`tickRate` pins both the display link and the guest's virtual-time step. Every duration in a
guest bundle is baked into a frame count at build time, so the bundle must have been built for
the same rate (`pocket ios build --hz=120`). Set it before `src`: the rate is declared to the
realm before the bundle evaluates and published to the guest at mount as `ui.__tickHz`, and a
bundle **refuses to mount** on a host driving any rate but its baked one - a mismatch raises
the `error` event instead of playing every animation at the wrong speed. Changing `tickRate`
after the guest booted also raises `error`. 60 (the default) everywhere; 120 for ProMotion
devices.

## Platform-contract identity

Guest bundles built from a resolved PocketJS build plan bake a target identity and refuse to mount
on a host that publishes a different one. This plugin (and the `PocketSurfaceView` inside the
xcframework) publishes the transitional PocketJS profile **`ios-dev` / hostAbi `7`**. Bundles
built plan-less carry no identity and mount anywhere.

The tick rate is part of the same handshake: every bundle (plan-built or not) bakes its rate and
checks it against the host's declared **`ui.__tickHz`** at mount. Both views publish it - the
embedded `PocketSurfaceView` for `PocketView`, this plugin's mounted namespace for
`PocketHostView`. A host that declares nothing is taken as the 60 default, so 60 Hz bundles run
on any host version; non-60 bundles require this handshake and therefore plugin 0.2.1+.

## PocketApple.xcframework provenance

`platforms/ios/PocketApple.xcframework` is built from pocket-stack/pocketjs
`engine/apple/build-xcframework.sh` — the Apple host from
[PR #255](https://github.com/pocket-stack/pocketjs/pull/255) plus the per-realm tick-rate
contract from [PR #257](https://github.com/pocket-stack/pocketjs/pull/257): the call order is
`create -> load_pak* -> [set_identity] -> [set_tick_rate] -> eval_bundle`, and the mount
publishes the declared rate to the guest as `ui.__tickHz`.
To rebuild: run that script in a pocketjs checkout (needs the `aarch64-apple-ios` and `aarch64-apple-ios-sim` Rust targets) and copy `engine/apple/dist/PocketApple.xcframework` over `platforms/ios/PocketApple.xcframework`.

## License

MIT
