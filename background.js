// UltraWide background: keyboard shortcut + toolbar icon state.
const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { enabled: false, mode: "fill", zoom: 100 };

async function getSettings() {
  return { ...DEFAULTS, ...(await api.storage.local.get(DEFAULTS)) };
}

// Monochrome glyph: outlined when off, filled when on. No badge.
async function updateIcon() {
  const { enabled } = await getSettings();
  const state = enabled ? "on" : "off";
  api.action.setIcon({
    path: {
      16: `icons/toolbar-${state}-16.png`,
      32: `icons/toolbar-${state}-32.png`,
    },
  });
  api.action.setTitle({ title: enabled ? "UltraWide (on)" : "UltraWide (off)" });
}

api.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle-ultrawide") return;
  const { enabled } = await getSettings();
  await api.storage.local.set({ enabled: !enabled });
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "enabled" in changes) updateIcon();
});

api.runtime.onInstalled.addListener(updateIcon);
api.runtime.onStartup?.addListener(updateIcon);
updateIcon();
