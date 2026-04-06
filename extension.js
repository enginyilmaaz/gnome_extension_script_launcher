import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";

// Default icon for the top panel
const DEFAULT_ICON = "utilities-terminal-symbolic";
const BULLET = "pan-end-symbolic";

const ScrollableMenu = class ScrollableMenu extends PopupMenu.PopupMenuSection {
  constructor() {
    super();
    const scrollView = new St.ScrollView();
    this.innerMenu = new PopupMenu.PopupMenuSection();
    const shellVersion = parseFloat(Config.PACKAGE_VERSION)
      .toString()
      .slice(0, 2);
    if (shellVersion == 45) {
      scrollView.add_actor(this.innerMenu.actor);
      this.actor.add_actor(scrollView);
    } else {
      scrollView.add_child(this.innerMenu.actor);
      this.actor.add_child(scrollView);
    }
  }
};

export default class LauncherExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._indicator = null;
    this._menuId = null;
    this._settings = null;
    this._launcher = null;
    this._menu = null;
    this._path = null;
    this._fileMonitor = null;
    this._pathChangedId = null;
    this._refreshTimeout = null;
    this._searchEntry = null;
    this._searchMenuItem = null;
    this._allScripts = [];
  }

  _appendLog(script, stdout, stderr) {
    const logName = `${GLib.get_home_dir()}/.${this.metadata.name}.log`;
    const logFile = Gio.File.new_for_path(logName);
    const encoder = new TextEncoder();
    const date = new Date();

    const outputStream = logFile.append_to(Gio.FileCreateFlags.NONE, null);
    outputStream.write(encoder.encode(`\n[${script}]: ${date}\n`), null);
    outputStream.write(encoder.encode(`STDOUT:\n${stdout}`), null);
    outputStream.write(encoder.encode(`STDERR:\n${stderr}`), null);
    outputStream.close(null);
  }

  _setupFileMonitor() {
    // Clean up existing monitor
    if (this._fileMonitor) {
      this._fileMonitor.cancel();
      this._fileMonitor = null;
    }

    const path = this._settings.get_string("path");
    if (!path) {
      return;
    }

    const directory = Gio.File.new_for_path(path);
    if (!directory.query_exists(null)) {
      return;
    }

    try {
      this._fileMonitor = directory.monitor_directory(
        Gio.FileMonitorFlags.NONE,
        null
      );

      this._fileMonitor.connect('changed', () => {
        // Debounce the refresh to avoid too many updates
        if (this._refreshTimeout) {
          GLib.source_remove(this._refreshTimeout);
        }
        this._refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          this._fillMenu();
          this._refreshTimeout = null;
          return GLib.SOURCE_REMOVE;
        });
      });
    } catch (e) {
      // Silently fail if monitoring is not possible
    }
  }

  _fillMenu() {
    this._menu.innerMenu.removeAll();
    this._allScripts = [];

    this._path = this._settings.get_string("path");
    if (!this._path) {
      return;
    }

    const shebangIcon = this._settings.get_boolean("shebang-icon");
    const dafaultIcon = this._settings.get_string("default-icon");
    const stripExt = this._settings.get_boolean("strip");

    this._getScripts(this._path).forEach((script) => {
      const scriptName = script.get_name();
      const baseName = scriptName.replace(/\.sh$/, "");

      // Check for matching icon files (.svg or .png)
      let iconName = null;
      const svgPath = Gio.File.new_for_path(`${this._path}/${baseName}.svg`);
      const pngPath = Gio.File.new_for_path(`${this._path}/${baseName}.png`);

      if (svgPath.query_exists(null)) {
        iconName = svgPath.get_path();
      } else if (pngPath.query_exists(null)) {
        iconName = pngPath.get_path();
      }

      // Use custom icon if found, otherwise use shebang icon or default icon
      const icon = iconName ?
        Gio.icon_new_for_string(iconName) :
        (shebangIcon ? script.get_icon() : Gio.ThemedIcon.new(dafaultIcon || BULLET));

      const displayName = stripExt
        ? scriptName.replace(/\.[^\.]+$/, "")
        : scriptName;

      // Store script info for filtering
      const scriptInfo = {
        scriptName: scriptName,
        displayName: displayName,
        icon: icon,
        menuItem: null
      };

      // Create menu item
      scriptInfo.menuItem = this._menu.innerMenu.addAction(
        displayName,
        () => this._launchScript(scriptName),
        icon
      );

      this._allScripts.push(scriptInfo);
    });
  }

  _filterMenu() {
    const searchText = this._searchEntry.get_text().toLowerCase();

    this._allScripts.forEach((scriptInfo) => {
      const matches = scriptInfo.displayName.toLowerCase().includes(searchText);
      scriptInfo.menuItem.visible = matches;
    });
  }

  _getScripts(path) {
    const directory = Gio.File.new_for_path(path);
    if (!directory.query_exists(null)) {
      return;
    }

    const enumerator = directory.enumerate_children(
      "standard::name,standard::type,standard::icon",
      Gio.FileQueryInfoFlags.NONE,
      null,
    );
    const scripts = [];

    while (true) {
      const fileInfo = enumerator.next_file(null);
      if (!fileInfo) {
        break;
      }

      const fileType = fileInfo.get_file_type();
      const fileName = fileInfo.get_name();
      // Only include .sh files
      if (fileType === Gio.FileType.REGULAR && fileName.endsWith(".sh")) {
        scripts.push(fileInfo);
      }
    }

    enumerator.close(null);
    scripts.sort((a, b) => a.get_name().localeCompare(b.get_name()));
    return scripts;
  }

  _launchScript(script) {
    this._indicator.menu.toggle();
    const command = [`${this._path}/${script}`];

    try {
      const proc = this._launcher.spawnv(command);
      proc.communicate_utf8_async(null, null, (proc, res) => {
        const [, stdout, stderr] = proc.communicate_utf8_finish(res);

        const notify = this._settings.get_boolean("notify");
        if (notify) {
          if (stdout || stderr) {
            Main.notify(this.metadata.name, `[${script}]: ${stdout || stderr}`);
          } else {
            Main.notify(
              this.metadata.name,
              `[${script}]: completed with exit code: ${proc.get_exit_status()}`,
            );
          }
        }

        const logging = this._settings.get_boolean("log");
        if (logging) {
          this._appendLog(script, stdout, stderr);
        }
      });
    } catch (e) {
      Main.notify(
        this.metadata.name,
        `[${script}]: ${e.toString().replace("GLib.SpawnError: ", "")}`,
      );
    }
  }

  // Helper function to get the icon based on settings
  _getIcon() {
    // Default to built-in terminal icon
    let gicon = new Gio.ThemedIcon({ name: DEFAULT_ICON });

    // Only use custom icon if the settings are loaded and the feature is enabled
    if (this._settings && this._settings.get_boolean("use-custom-top-icon")) {
      try {
        const iconName = this._settings.get_string("top-icon-name");

        if (iconName && iconName.trim() !== "") {
          // Handle file paths vs icon names
          if (iconName.startsWith('/') || iconName.endsWith('.svg') || iconName.endsWith('.png')) {
            // It's a file path
            const iconFile = Gio.File.new_for_path(iconName);
            if (iconFile.query_exists(null)) {
              gicon = Gio.icon_new_for_string(iconName);
            }
          } else {
            // It's an icon name
            gicon = new Gio.ThemedIcon({ name: iconName });
          }
        }
      } catch (e) {
        // If anything goes wrong, silently fall back to the default icon
        // which is already set above
      }
    }

    return gicon;
  }

  _addIndicator() {
    this._indicator = new PanelMenu.Button(0.5, this.metadata.name, false);

    // Create icon using settings
    let gicon = this._getIcon();

    const icon = new St.Icon({
      gicon: gicon,
      style_class: "system-status-icon",
    });
    this._indicator.add_child(icon);

    // Create search entry with icon inside
    this._searchEntry = new St.Entry({
      style_class: 'popup-menu-item',
      style: 'margin: 0px; padding: 4px 8px; min-width: 215px; border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 4px;',
      hint_text: 'Search scripts...',
      track_hover: true,
      can_focus: true,
    });

    // Create search icon inside the entry
    const searchIcon = new St.Icon({
      icon_name: 'edit-find-symbolic',
      icon_size: 14,
    });

    // Set the icon as primary icon (left side) of the entry
    this._searchEntry.set_primary_icon(searchIcon);

    // Create search menu item with minimal padding
    this._searchMenuItem = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
      style_class: '',
    });
    this._searchMenuItem.actor.style = 'padding: 4px 12px; margin: 0px;';
    this._searchMenuItem.add_child(this._searchEntry);

    this._menu = new ScrollableMenu();

    // Add search box first, then the scrollable menu
    this._indicator.menu.addMenuItem(this._searchMenuItem);
    this._indicator.menu.addMenuItem(this._menu);

    Main.panel.addToStatusArea(this.metadata.name, this._indicator);

    // Connect search functionality
    this._searchEntry.get_clutter_text().connect('text-changed', () => {
      this._filterMenu();
    });

    this._menuId = this._indicator.menu.connect(
      "open-state-changed",
      (open) => {
        if (open) {
          this._fillMenu();
          // Clear search when menu opens
          this._searchEntry.set_text('');
          // Set focus to search entry
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._searchEntry.grab_key_focus();
            return GLib.SOURCE_REMOVE;
          });
        }
      },
    );
  }

  enable() {
    this._settings = this.getSettings();

    // Set up settings change listeners for icon settings
    this._iconSettingsChangedId1 = this._settings.connect('changed::use-custom-top-icon', () => {
      this._updateTopIcon();
    });

    this._iconSettingsChangedId2 = this._settings.connect('changed::top-icon-name', () => {
      this._updateTopIcon();
    });

    // Set up listener for path changes to update file monitor
    this._pathChangedId = this._settings.connect('changed::path', () => {
      this._setupFileMonitor();
    });

    this._addIndicator();
    this._launcher = new Gio.SubprocessLauncher({
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    // Set up initial file monitoring
    this._setupFileMonitor();
  }

  // Update the top panel icon based on current settings
  _updateTopIcon() {
    if (this._indicator) {
      // Remove the old icon
      let children = this._indicator.get_children();
      if (children.length > 0) {
        this._indicator.remove_child(children[0]);
      }

      // Add the new icon
      const icon = new St.Icon({
        gicon: this._getIcon(),
        style_class: "system-status-icon",
      });
      this._indicator.insert_child_at_index(icon, 0);
    }
  }

  disable() {
    // Clean up refresh timeout
    if (this._refreshTimeout) {
      GLib.source_remove(this._refreshTimeout);
      this._refreshTimeout = null;
    }

    // Clean up file monitor
    if (this._fileMonitor) {
      this._fileMonitor.cancel();
      this._fileMonitor = null;
    }

    // Disconnect settings listeners
    if (this._settings) {
      if (this._iconSettingsChangedId1) {
        this._settings.disconnect(this._iconSettingsChangedId1);
        this._iconSettingsChangedId1 = null;
      }
      if (this._iconSettingsChangedId2) {
        this._settings.disconnect(this._iconSettingsChangedId2);
        this._iconSettingsChangedId2 = null;
      }
      if (this._pathChangedId) {
        this._settings.disconnect(this._pathChangedId);
        this._pathChangedId = null;
      }
    }

    // Disconnect menu
    if (this._indicator && this._menuId) {
      this._indicator.menu.disconnect(this._menuId);
    }

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._menuId = null;
    this._menu = null;
    this._settings = null;
    this._launcher = null;
    this._searchEntry = null;
    this._searchMenuItem = null;
    this._allScripts = [];
  }
}
