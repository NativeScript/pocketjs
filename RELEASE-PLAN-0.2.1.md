# 0.2.1 release plan

**Status (2026-08-13):** the engine-side review fixes are pushed to
[pocket-stack/pocketjs#257](https://github.com/pocket-stack/pocketjs/pull/257) (head `d6ae5f0`)
and this branch carries the matching plugin changes, including an xcframework rebuilt from that
head. **Publish waits on #257 merging** — the only remaining pre-publish step is rebuilding the
xcframework once more from post-merge `main` so the shipped binary is a build of upstream, not of
a branch.

## What this branch already carries

1. **The settled tick-rate contract**, engine side (in the rebuilt xcframework):
   `create → load_pak* → [set_identity] → [set_tick_rate] → eval_bundle`; the rate is rejected
   after eval (guest mode) / after the first `core_animate` or tick (external mode);
   `PocketSurfaceView` applies `tickRate` in its setter and `start` only pins the display link;
   the mount publishes `ui.__tickHz`.
2. **Plugin JS**: `PocketHostView._mountUi` publishes `__tickHz` next to `__host`/`__hostAbi`;
   `tickRate` gained a `setNative` that skips same-value re-application and pushes genuine late
   changes so the surface can refuse them through the `error` event.
3. **Docs**: README usage + identity + provenance sections and the `index.d.ts` contract text.
4. `package.json` at `0.2.1`.

Compatibility: 60 Hz bundles keep mounting on every plugin version (an absent `__tickHz` means
the 60 default). Non-60 bundles refuse 0.2.0 loudly and require 0.2.1.

## Remaining sequence

1. **Land pocket-stack/pocketjs#257** (then rebase + land #258).
2. **Rebuild the xcframework from merged `main`** and re-vendor:
   ```sh
   # in the engine checkout (~/Documents/github/NathanWalker/ns-pocketjs/pocketjs), on main
   engine/apple/build-xcframework.sh
   cp -R engine/apple/dist/PocketApple.xcframework <this repo>/platforms/ios/
   ```
3. **Merge this branch, `npm publish`** (0.2.1).
4. **Engine-side pin bump**: `hosts/apple/ns-shell/package.json` `0.2.0` → `0.2.1` (exact pin,
   one line — flagged in the #257 thread).

Delete this file once 0.2.1 is published.
