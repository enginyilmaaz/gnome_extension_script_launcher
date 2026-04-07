# Script Launcher

## Run scripts from a panel indicator

A GNOME Shell extension that lets you launch `.sh` scripts from the top panel. Place your scripts in a directory, and they appear as a searchable menu.

### Features

- **Panel Menu** - Click the panel icon to see all scripts in your configured directory
- **Search** - Filter scripts by name with the built-in search bar
- **Custom Panel Icon** - Replace the default icon with any system icon or custom image file
- **Per-Script Icons** - Place a `.svg` or `.png` with the same name as your script (e.g. `backup.svg` for `backup.sh`)
- **Default Icon** - Set a default icon for all scripts in the menu
- **File Pickers** - Browse for scripts directory and icon files directly from settings
- **Icon Preview** - Preview icons with tooltip before applying
- **Show/Hide Extensions** - Toggle file extension visibility in the script list
- **Backup & Import** - Export/import settings as `.conf` files with native OS notifications
- **Right-Click Settings** - Quick access to preferences from the panel icon

### Installation

1. Clone or download this repository
2. Copy to `~/.local/share/gnome-shell/extensions/script-launcher@enginyilmaaz/`
3. Compile schemas: `glib-compile-schemas schemas/`
4. Restart GNOME Shell (`Alt+F2` > `r` on X11, or logout/login on Wayland)
5. Enable the extension: `gnome-extensions enable script-launcher@enginyilmaaz`

### Usage

1. Place your `.sh` scripts in `~/scripts` (default) or configure a custom path in Settings
2. Click the panel icon to see your scripts
3. Click a script to run it
4. Right-click the panel icon for Settings

### Compatibility

GNOME Shell 45, 46, 47, 48, 49
