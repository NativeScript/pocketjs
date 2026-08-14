const { View, Property, knownFolders } = require('@nativescript/core');

// Guest bundles ship as `<name>.pocketjs` + `<name>.pak` so the webpack asset
// copy treats the bundle as an opaque asset instead of application source.
const BUNDLE_EXTENSION = '.pocketjs';
const PAK_EXTENSION = '.pak';

const srcProperty = new Property({ name: 'src' });
const viewportWidthProperty = new Property({
  name: 'viewportWidth',
  defaultValue: 480,
  valueConverter: (v) => parseInt(v, 10),
});
const viewportHeightProperty = new Property({
  name: 'viewportHeight',
  defaultValue: 272,
  valueConverter: (v) => parseInt(v, 10),
});
const densityProperty = new Property({
  name: 'density',
  defaultValue: 0,
  valueConverter: (v) => parseInt(v, 10),
});
const tickRateProperty = new Property({
  name: 'tickRate',
  defaultValue: 60,
  valueConverter: (v) => parseInt(v, 10),
});

class PocketView extends View {
  createNativeView() {
    const scale = UIScreen.mainScreen.scale;
    const density = this.density > 0 ? this.density : Math.max(1, Math.min(3, Math.round(scale)));
    const view = PocketSurfaceView.surfaceWithLogicalWidthLogicalHeightDensity(
      this.viewportWidth,
      this.viewportHeight,
      density,
    );
    view.tickRate = this.tickRate > 0 ? this.tickRate : 60;
    return view;
  }

  initNativeView() {
    super.initNativeView();
    const owner = this;
    this.nativeViewProtected.onError = (message) => {
      owner.notify({ eventName: 'error', object: owner, message });
    };
    this.nativeViewProtected.onEffect = (line) => {
      let data = line;
      try {
        data = JSON.parse(line);
      } catch (e) {
        // Non-JSON lines pass through as strings.
      }
      owner.notify({ eventName: 'effect', object: owner, data });
    };
    // Belt and braces: dominative attribute application does not always
    // reach the NS property's setNative, so load here too; _loadApp guards
    // against running twice.
    if (this.src) {
      this._loadApp(this.src);
    }
  }

  /** Host -> guest: delivered at the guest's next frame boundary. */
  post(message) {
    const nativeView = this.nativeViewProtected;
    if (!nativeView) {
      return;
    }
    const line = typeof message === 'string' ? message : JSON.stringify(message);
    nativeView.postEvent(line);
  }

  disposeNativeView() {
    const nativeView = this.nativeViewProtected;
    if (nativeView) {
      nativeView.stop();
      nativeView.onError = null;
    }
    super.disposeNativeView();
  }

  [srcProperty.setNative](value) {
    if (value) {
      this._loadApp(value);
    }
  }

  [tickRateProperty.setNative](value) {
    const nativeView = this.nativeViewProtected;
    const rate = value > 0 ? value : 60;
    // createNativeView already declared this.tickRate on the surface; the
    // same value arriving again through property application must not
    // re-touch the native setter, which rejects any set once the guest
    // evaluated (the rate is a mount-published fact, ui.__tickHz).
    if (!nativeView || Number(nativeView.tickRate) === rate) {
      return;
    }
    // A genuinely late change is pushed so the surface can refuse it loudly
    // through the error event, instead of the display link silently
    // diverging from the realm's step.
    nativeView.tickRate = rate;
  }

  _loadApp(src) {
    const nativeView = this.nativeViewProtected;
    if (!nativeView || this._booted) {
      return;
    }
    this._booted = true;
    const base = src.replace(/^~\//, knownFolders.currentApp().path + '/');
    const bundlePath = base + BUNDLE_EXTENSION;
    const pakPath = base + PAK_EXTENSION;

    const pak = NSData.dataWithContentsOfFile(pakPath);
    const bundle = NSString.stringWithContentsOfFileEncodingError(
      bundlePath,
      NSUTF8StringEncoding,
    );
    if (!pak || !bundle) {
      this.notify({
        eventName: 'error',
        object: this,
        message: `pocket app assets not found: ${bundlePath} / ${pakPath}`,
      });
      return;
    }
    if (!nativeView.loadPak(pak)) {
      return;
    }
    const label = base.split('/').pop() || 'app';
    if (!nativeView.evalBundleLabel(bundle, label)) {
      return;
    }
    nativeView.start();
    this.notify({ eventName: 'loaded', object: this });
  }
}

srcProperty.register(PocketView);
viewportWidthProperty.register(PocketView);
viewportHeightProperty.register(PocketView);
densityProperty.register(PocketView);
tickRateProperty.register(PocketView);

exports.PocketView = PocketView;

// Direction B: the NativeScript runtime IS the guest engine. The pocket core
// runs native-side; globalThis.ui delegates each op over the bridge, the
// guest bundle evaluates in THIS JS context (so it can reach the whole iOS
// platform through the NativeScript metadata bindings), and the display link
// calls back into globalThis.frame each tick.
class PocketHostView extends PocketView {
  createNativeView() {
    const scale = UIScreen.mainScreen.scale;
    const density = this.density > 0 ? this.density : Math.max(1, Math.min(3, Math.round(scale)));
    const view = PocketSurfaceView.externalSurfaceWithLogicalWidthLogicalHeightDensity(
      this.viewportWidth,
      this.viewportHeight,
      density,
    );
    view.tickRate = this.tickRate > 0 ? this.tickRate : 60;
    return view;
  }

  disposeNativeView() {
    const nativeView = this.nativeViewProtected;
    if (nativeView) {
      nativeView.onTick = null;
    }
    super.disposeNativeView();
  }

  // Inherited [srcProperty.setNative] calls _loadApp; external mode boots.
  _loadApp(src) {
    if (this.nativeViewProtected && !this._booted) {
      this._booted = true;
      this._boot(src);
    }
  }

  _mountUi(nativeView) {
    const textures = {};
    const textureTable = nativeView.uiTextures();
    const textureKeys = textureTable.allKeys;
    for (let i = 0; i < textureKeys.count; i++) {
      const key = textureKeys.objectAtIndex(i);
      textures[String(key)] = Number(textureTable.objectForKey(key));
    }
    const sprites = {};
    const spriteList = nativeView.uiSprites();
    for (let i = 0; i < spriteList.count; i++) {
      const record = spriteList.objectAtIndex(i);
      sprites[String(record.objectForKey('name'))] = {
        handle: Number(record.objectForKey('handle')),
        frames: Number(record.objectForKey('frames')),
        cols: Number(record.objectForKey('cols')),
        step: Number(record.objectForKey('step')),
      };
    }
    globalThis.ui = {
      // Platform-contract identity: bundles built from a resolved ios-dev plan
      // bake this pair and refuse to mount on a host that publishes anything
      // else (framework/src/host.ts assertNativeHostContract in pocketjs).
      __host: 'ios-dev',
      __hostAbi: 7,
      // The rate the core was declared at before this mount (createNativeView
      // pushes tickRate, which the surface applies immediately in external
      // mode). Every bundle bakes its rate and refuses a host driving
      // another; hosts that stay silent are taken as the 60 default.
      __tickHz: Number(nativeView.tickRate) > 0 ? Number(nativeView.tickRate) : 60,
      __viewport: { w: this.viewportWidth, h: this.viewportHeight },
      __textures: textures,
      __sprites: sprites,
      createNode: (type) => nativeView.uiCreateNode(type),
      destroyNode: (id) => nativeView.uiDestroyNode(id),
      insertBefore: (parent, child, anchor) =>
        nativeView.uiInsertBeforeChildAnchor(parent, child, anchor),
      removeChild: (parent, child) => nativeView.uiRemoveChildChild(parent, child),
      setStyle: (id, style) => nativeView.uiSetStyleStyle(id, style),
      setProp: (id, prop, value) => nativeView.uiSetPropPropValue(id, prop, value),
      setText: (id, text) => nativeView.uiSetTextText(id, String(text)),
      replaceText: (id, text) => nativeView.uiReplaceTextText(id, String(text)),
      measureText: (text, fontSlot) => nativeView.uiMeasureTextFontSlot(String(text), fontSlot),
      uploadTexture: () => -1,
      setImage: (id, texture) => nativeView.uiSetImageTexture(id, texture),
      setSprite: (id, atlas, frames, cols, step) =>
        nativeView.uiSetSpriteAtlasFramesColsStep(id, atlas, frames, cols, step),
      animate: (id, prop, to, dur, easing, delay) =>
        nativeView.uiAnimatePropToDurEasingDelay(id, prop, to, dur, easing, delay),
      cancelAnim: (animId) => nativeView.uiCancelAnim(animId),
      setFocus: (id) => nativeView.uiSetFocus(id),
      setActive: (id, active) => nativeView.uiSetActiveActive(id, active ? 1 : 0),
      hitTest: (x, y) => nativeView.uiHitTestBoundsY(x, y),
      hitTestBounds: (x, y) => nativeView.uiHitTestBoundsY(x, y),
      svcOpen: (name) => !!nativeView.uiSvcOpen(String(name)),
      svcPoll: () => {
        const batch = nativeView.uiSvcPoll();
        return batch == null ? null : String(batch);
      },
      svcSend: (line) => nativeView.uiSvcSend(String(line)),
    };
  }

  _boot(src) {
    const nativeView = this.nativeViewProtected;
    if (!nativeView) {
      return;
    }
    const base = src.replace(/^~\//, knownFolders.currentApp().path + '/');
    const pak = NSData.dataWithContentsOfFile(base + PAK_EXTENSION);
    const bundle = NSString.stringWithContentsOfFileEncodingError(
      base + BUNDLE_EXTENSION,
      NSUTF8StringEncoding,
    );
    if (!pak || !bundle) {
      this.notify({ eventName: 'error', object: this, message: `pocket app assets not found at ${base}` });
      return;
    }
    if (!nativeView.loadPak(pak)) {
      return;
    }
    this._mountUi(nativeView);
    // The guest bundle evaluates in the NativeScript runtime itself.
    new Function(String(bundle))();
    if (typeof globalThis.frame !== 'function') {
      this.notify({ eventName: 'error', object: this, message: 'bundle installed no frame()' });
      return;
    }
    let tickError = false;
    nativeView.onTick = (buttons, analog, touches) => {
      const words = [];
      for (let i = 0; i < touches.count; i++) {
        words.push(Number(touches.objectAtIndex(i)));
      }
      try {
        globalThis.frame(buttons, analog, words);
      } catch (error) {
        if (!tickError) {
          tickError = true;
          console.error('[pocket-host] frame() threw:', error && error.message, error && error.stack);
        }
      }
    };
    nativeView.start();
    console.log('[pocket-host] measureText check:', globalThis.ui.measureText('Ping host', 0));
    this.notify({ eventName: 'loaded', object: this });
  }
}

exports.PocketHostView = PocketHostView;
