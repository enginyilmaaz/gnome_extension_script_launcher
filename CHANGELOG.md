# Changelog

## 2026-04-13

- Fix EGO-L-002: add explicit destroy() calls for menu, searchEntry, and searchMenuItem in disable()
- Fix EGO-P-005: replace bundled panel.png binary with vector panel.svg
- Add shexli static analyzer test script (test/runTest.sh)

## 2026-04-09

- Fix EGO015: disconnect all signals connected in enable() during disable()
- Fix EGO014: properly destroy objects created in enable() during disable()
- Fix EGO030: replace synchronous file IO with async load_contents_async in locale loading
- Add _unbindPointerCursor helper for proper signal cleanup on actors

## 2026-04-08

- Prepare version 1.1.0 for the next GNOME Extensions upload bundle
- Refresh README and extension metadata to match the current feature set
- Remove keyboard shortcut support and the related GSettings schema key
- Refine menu spacing, panel icon sizing, search field layout, and pointer cursor behavior

## 2026-04-07

- Remove keyboard shortcut support and the related GSettings schema key
- Refine menu spacing and make pointer cursor cover clickable menu content consistently
- Restore the panel icon sizing and search field styling after recent menu UI changes
- Export and import all settings, including pinned scripts and menu overrides
- Add menu width and height override settings for the script list popup
- Add Show Search preference and menu search visibility toggle
- Remove the pinned section header while keeping pinned scripts at the top
- Improve right-click menu positioning and clickable cursor feedback
- Detach script right-click actions into a separate popup menu instead of rendering them inside the list
- Add right-click context menu: Run, Run in Terminal, Pin to Top/Unpin
- Add pinned scripts section with separator at the top of menu
- Show "No scripts found" / "Directory not found" messages for empty/invalid paths
- Add multi-language support (EN, TR, RU, DE, IT, JA, FR, ES) with auto system detection
- Add file extension filter setting with toggle
- Align all input fields and dropdowns in preferences
- Fix GNOME review compliance: track timeout sources, simplify script launch, add GPL-2.0 license
- Align all input fields and file picker buttons in preferences ([`931a139`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/931a139))
- Update preferences UI with help tooltips, file pickers and icon previews ([`f753141`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/f753141))
- Remove shebang icon feature from extension and preferences ([`c41dfc9`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/c41dfc9))
- Use native Ubuntu notifications for export/import feedback ([`e65d1c8`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/e65d1c8))
- Add preview button with tooltip for default icon setting ([`7f25df0`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/7f25df0))
- Use toast notifications for export/import feedback ([`69c7621`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/69c7621))
- Add icon preview next to default icon input in preferences ([`012ed4c`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/012ed4c))
- Add file picker for script path, export and import settings ([`286a4ec`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/286a4ec))
- Remove notify feature from extension and preferences ([`db9e512`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/db9e512))
- Remove log feature and rename strip setting to show file extensions ([`139531b`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/139531b))
- Update panel icon system with settings override and reduced padding ([`ec9cec8`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/ec9cec8))
- Set panel icon size to 24px width with auto height ([`14bcfc7`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/14bcfc7))
- Add panel icon, right-click settings menu, backup/import, and default scripts path ([`c64dfe8`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/c64dfe8))
- Rebrand fork as Script Launcher and add GNOME 49 support ([`898acec`](https://github.com/enginyilmaaz/gnome_extension_script_launcher/commit/898acec))
