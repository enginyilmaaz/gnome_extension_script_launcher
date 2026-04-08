# Script Launcher

## Run scripts from a panel indicator

A customized fork of [Launcher](https://extensions.gnome.org/extension/5874/launcher/).

A GNOME Shell extension that lets you launch scripts from the top panel with a searchable popup menu, pinned favorites, right-click actions, and import/exportable settings.

### Features

- **Panel Menu** - Open the script list directly from the top panel
- **Search** - Filter scripts instantly with the built-in search bar
- **Pinned Scripts** - Keep selected scripts at the top of the list
- **Script Context Menu** - Right-click a script to Run, Run in Terminal, or Pin/Unpin it
- **Right-Click Settings** - Open extension preferences from the panel icon context menu
- **Show Search Toggle** - Hide or show the search field from preferences
- **Menu Size Override** - Set custom width and height values for the popup list
- **Custom Panel Icon** - Replace the top panel icon with a system icon or image file
- **Per-Script Icons** - Use `.svg` or `.png` files that match script names
- **Default Icon** - Configure a fallback icon for scripts without a custom icon
- **File Extension Filter** - Filter visible scripts by extension such as `.sh,.py,.js`
- **Show/Hide Extensions** - Toggle file extension visibility in script labels
- **Backup & Import** - Export and import all settings, including pinned scripts and menu overrides
- **File Pickers and Icon Preview** - Pick folders/icons from preferences and preview them before applying
- **Multi-Language** - Includes EN, TR, RU, DE, IT, JA, FR, and ES with automatic language detection

### Installation

1. Clone or download this repository
2. Copy to `~/.local/share/gnome-shell/extensions/script-launcher@enginyilmaaz/`
3. Compile schemas: `glib-compile-schemas schemas/`
4. Restart GNOME Shell (`Alt+F2` > `r` on X11, or logout/login on Wayland)
5. Enable the extension: `gnome-extensions enable script-launcher@enginyilmaaz`

### Usage

1. Place your scripts in `~/scripts` (default) or set a custom path in Preferences
2. Click the panel icon to open the launcher menu
3. Click a script to run it
4. Right-click a script for Run in Terminal and Pin/Unpin actions
5. Right-click the panel icon to open Settings

### Compatibility

GNOME Shell 45, 46, 47, 48, 49
