const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { enabled: false, mode: "fill", zoom: 100 };
const HINTS = {
  fill: "Crops the edges so the picture fills the window without distortion.",
  stretch: "Stretches the picture to the window shape. Nothing is cropped.",
};

const enabled = document.getElementById("enabled");
const zoom = document.getElementById("zoom");
const zoomValue = document.getElementById("zoom-value");
const modeHint = document.getElementById("mode-hint");
const modes = document.querySelectorAll('input[name="mode"]');

function render(s) {
  enabled.checked = s.enabled;
  document.body.classList.toggle("on", s.enabled);
  for (const m of modes) m.checked = m.value === s.mode;
  modeHint.textContent = HINTS[s.mode] || "";
  zoom.value = s.zoom;
  zoomValue.textContent = `${s.zoom}%`;
}

api.storage.local.get(DEFAULTS).then((s) => render({ ...DEFAULTS, ...s }));

enabled.addEventListener("change", () => {
  document.body.classList.toggle("on", enabled.checked);
  api.storage.local.set({ enabled: enabled.checked });
});

for (const m of modes) {
  m.addEventListener("change", () => {
    modeHint.textContent = HINTS[m.value];
    api.storage.local.set({ mode: m.value });
  });
}

zoom.addEventListener("input", () => {
  const value = Number(zoom.value);
  zoomValue.textContent = `${value}%`;
  api.storage.local.set({ zoom: value });
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  api.storage.local.get(DEFAULTS).then((s) => render({ ...DEFAULTS, ...s }));
});
