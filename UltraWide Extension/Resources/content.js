// UltraWide content script.
// Scales every playing video so it fills the visible player box (or the whole
// screen in fullscreen), cropping or stretching away the black bars.
(() => {
  if (window.__ultrawideLoaded) return;
  window.__ultrawideLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const DEFAULTS = { enabled: false, mode: "fill", zoom: 100 };
  const STYLE_PROPS = ["transform", "transform-origin", "object-fit"];
  const MIN_W = 160;
  const MIN_H = 90;

  let settings = { ...DEFAULTS };
  const touched = new Set();          // videos we have modified
  const original = new WeakMap();     // video -> original inline styles
  const offset = new WeakMap();       // video -> translate we applied {dx, dy}
  let rafId = 0;
  let timerId = 0;

  const fullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;

  function saveOriginal(video) {
    if (original.has(video)) return;
    const saved = {};
    for (const p of STYLE_PROPS) {
      saved[p] = [video.style.getPropertyValue(p), video.style.getPropertyPriority(p)];
    }
    original.set(video, saved);
  }

  function restore(video) {
    const saved = original.get(video);
    if (saved) {
      for (const p of STYLE_PROPS) {
        const [value, priority] = saved[p];
        if (value) video.style.setProperty(p, value, priority);
        else video.style.removeProperty(p);
      }
    }
    original.delete(video);
    offset.delete(video);
    touched.delete(video);
  }

  function restoreAll() {
    for (const v of [...touched]) restore(v);
  }

  // Only write a style when it actually changes, so sites and our own
  // observers don't see churn.
  function setStyle(video, prop, value) {
    if (video.style.getPropertyValue(prop) !== value ||
        video.style.getPropertyPriority(prop) !== "important") {
      video.style.setProperty(prop, value, "important");
    }
  }

  // The box the video should fill: the screen in fullscreen, otherwise the
  // nearest ancestor that clips its content (the site's player frame).
  function targetRect(video, box) {
    const fs = fullscreenElement();
    if (fs && fs !== video && fs.contains(video)) {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    let el = video.parentElement;
    for (let i = 0; el && i < 6; i++, el = el.parentElement) {
      if (el === document.body || el === document.documentElement) break;
      const cs = getComputedStyle(el);
      if (cs.overflowX === "visible" || cs.overflowY === "visible") continue;
      const r = el.getBoundingClientRect();
      // Ignore page-level wrappers that merely hide horizontal scrollbars.
      if (r.width > window.innerWidth + 2 || r.height > window.innerHeight + 2) break;
      if (r.width < MIN_W || r.height < MIN_H) continue;
      return r;
    }
    return box;
  }

  // Size of the picture as currently drawn inside the video element box.
  function contentSize(fit, w, h, vw, vh) {
    switch (fit) {
      case "fill": return [w, h];
      case "none": return [vw, vh];
      case "cover": { const k = Math.max(w / vw, h / vh); return [vw * k, vh * k]; }
      case "scale-down": { const k = Math.min(1, w / vw, h / vh); return [vw * k, vh * k]; }
      default: { const k = Math.min(w / vw, h / vh); return [vw * k, vh * k]; }
    }
  }

  function applyTo(video) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const w = video.offsetWidth;
    const h = video.offsetHeight;
    if (!vw || !vh || w < MIN_W || h < MIN_H) {
      if (touched.has(video)) restore(video);
      return;
    }

    const zoom = Math.max(1, (Number(settings.zoom) || 100) / 100);
    const stretch = settings.mode === "stretch";

    // A video element that is itself fullscreen can't be transformed reliably;
    // switch its object-fit instead.
    if (fullscreenElement() === video) {
      saveOriginal(video);
      touched.add(video);
      setStyle(video, "object-fit", stretch ? "fill" : "cover");
      setStyle(video, "transform-origin", "50% 50%");
      setStyle(video, "transform", `scale(${zoom})`);
      offset.set(video, { dx: 0, dy: 0 });
      return;
    }

    // Untransformed element box: undo the translate we applied last time,
    // unless the site has since wiped our transform.
    const applied = offset.get(video);
    const prev = applied && applied.css && video.style.getPropertyValue("transform") === applied.css
      ? applied : { dx: 0, dy: 0 };
    const rect = video.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 - prev.dx;
    const cy = rect.top + rect.height / 2 - prev.dy;
    const box = { left: cx - w / 2, top: cy - h / 2, width: w, height: h };

    const t = targetRect(video, box);
    const tcx = t.left + t.width / 2;
    const tcy = t.top + t.height / 2;

    // Undo any object-fit we forced while the video itself was fullscreen.
    const saved = original.get(video);
    if (saved && video.style.getPropertyPriority("object-fit") === "important"
        && saved["object-fit"][1] !== "important") {
      const [value, priority] = saved["object-fit"];
      if (value) video.style.setProperty("object-fit", value, priority);
      else video.style.removeProperty("object-fit");
    }
    const fit = getComputedStyle(video).objectFit || "contain";
    const [cw, ch] = contentSize(fit, w, h, vw, vh);

    let dw, dh;
    if (stretch) {
      dw = t.width * zoom;
      dh = t.height * zoom;
    } else {
      const k = Math.max(t.width / vw, t.height / vh) * zoom;
      dw = vw * k;
      dh = vh * k;
    }

    const sx = dw / cw;
    const sy = dh / ch;
    const dx = tcx - cx;
    const dy = tcy - cy;

    if (Math.abs(sx - 1) < 0.003 && Math.abs(sy - 1) < 0.003 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      if (touched.has(video)) restore(video);
      return;
    }

    // Ignore sub-pixel jitter so our own writes can't feed back into the
    // observers.
    const css = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    const last = offset.get(video);
    if (last && last.css && touched.has(video) &&
        video.style.getPropertyValue("transform") === last.css &&
        Math.abs(last.dx - dx) < 0.5 && Math.abs(last.dy - dy) < 0.5 &&
        Math.abs(last.sx - sx) < 0.001 && Math.abs(last.sy - sy) < 0.001) {
      return;
    }

    saveOriginal(video);
    touched.add(video);
    setStyle(video, "transform-origin", "50% 50%");
    setStyle(video, "transform", css);
    // Remember the transform as the browser serializes it, to spot later
    // whether the site has replaced it.
    offset.set(video, { dx, dy, sx, sy, css: video.style.getPropertyValue("transform") });
  }

  function update() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (!settings.enabled) {
      restoreAll();
      return;
    }
    for (const v of touched) {
      if (!v.isConnected) restore(v);
    }
    for (const v of document.querySelectorAll("video")) {
      observe(v);
      applyTo(v);
    }
  }

  // ResizeObserver callbacks run after layout but before paint, so when a
  // player changes size (entering fullscreen, theater mode, the site resizing
  // its video late) the video is rescaled in that same frame, with no flash.
  const resizeObserver = new ResizeObserver(() => settings.enabled && update());
  // Sites like YouTube also move the video (left/top) without resizing it;
  // catch those style writes too, before the next paint.
  const styleObserver = new MutationObserver(() => settings.enabled && update());
  const observed = new WeakSet();
  function observe(video) {
    if (!observed.has(video)) {
      styleObserver.observe(video, { attributes: true, attributeFilter: ["style", "class"] });
    }
    for (const el of [video, video.parentElement]) {
      if (el && !observed.has(el)) {
        observed.add(el);
        resizeObserver.observe(el);
      }
    }
  }

  // Right after entering or leaving fullscreen the window and player keep
  // settling for a moment; track them every frame until they do.
  let settleUntil = 0;
  function settle() {
    settleUntil = performance.now() + 1500;
    const tick = () => {
      if (!settings.enabled) return;
      update();
      if (performance.now() < settleUntil) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(update);
  }

  function applySettings(next) {
    settings = { ...DEFAULTS, ...next };
    if (settings.enabled) {
      update();
      if (!timerId) timerId = setInterval(schedule, 1000);
    } else {
      clearInterval(timerId);
      timerId = 0;
      update();
    }
  }

  // Media events don't bubble, so listen in the capture phase.
  for (const type of ["loadedmetadata", "resize", "play", "playing"]) {
    document.addEventListener(type, () => settings.enabled && schedule(), true);
  }
  // Fullscreen changes are handled immediately, not on the next frame.
  for (const type of ["fullscreenchange", "webkitfullscreenchange"]) {
    document.addEventListener(type, () => {
      if (!settings.enabled) return;
      update();
      settle();
    }, true);
  }
  window.addEventListener("resize", () => settings.enabled && update());
  window.addEventListener("scroll", () => settings.enabled && schedule(), { passive: true });

  api.storage.local.get(DEFAULTS).then(applySettings);
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const next = { ...settings };
    for (const key of Object.keys(DEFAULTS)) {
      if (key in changes) next[key] = changes[key].newValue;
    }
    applySettings(next);
  });
})();
