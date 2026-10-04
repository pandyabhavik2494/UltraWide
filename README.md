# UltraWide

A Safari extension that makes videos fill your ultrawide window by cropping or
zooming away the black bars.

- Turn it on and off from the toolbar button or with **⌥⇧U**.
- **Fill** crops the edges so the picture fills the player without distortion.
- **Stretch** stretches the picture to the player's shape; nothing is cropped.
- **Extra zoom** (100–150%) helps with movies that have black bars baked in.

## Build

1. Open `UltraWide.xcodeproj` in Xcode.
2. Under Signing & Capabilities, pick your team for both targets.
3. Press ⌘R to build and run the UltraWide app.
4. In Safari > Settings > Extensions, enable UltraWide and allow it on every website.

## Where the code lives

The extension itself (manifest, content script, background script, popup and
icons) is in `UltraWide Extension/Resources`. The rest is the small macOS app
that installs it.
