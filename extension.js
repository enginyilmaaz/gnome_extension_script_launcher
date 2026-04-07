import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Shell from "gi://Shell";
import Meta from "gi://Meta";
import { getLocale, clearCache } from "./locale.js";

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
    this._scriptContextMenu = null;
    this._pendingContextInfo = null;
    this._scriptContextMenuManager = null;
    this._scriptContextSourceActor = null;
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

  _getPinnedScripts() {
    try {
      return JSON.parse(this._settings.get_string("pinned-scripts"));
    } catch (e) {
      return [];
    }
  }

  _setPinnedScripts(pinned) {
    this._settings.set_string("pinned-scripts", JSON.stringify(pinned));
  }

  _togglePin(scriptName) {
    const pinned = this._getPinnedScripts();
    const idx = pinned.indexOf(scriptName);
    if (idx >= 0) {
      pinned.splice(idx, 1);
    } else {
      pinned.push(scriptName);
    }
    this._setPinnedScripts(pinned);
    this._fillMenu();
  }

  _fillMenu() {
    this._destroyScriptContextMenu();
    this._menu.innerMenu.removeAll();
    this._allScripts = [];

    const lang = this._settings.get_string("language");
    const t = getLocale(this.path, lang);

    this._path = this._settings.get_string("path");
    if (!this._path) {
      return;
    }

    // Check if directory exists
    const directory = Gio.File.new_for_path(this._path);
    if (!directory.query_exists(null)) {
      this._menu.innerMenu.addAction(
        t.directory_not_found || 'Directory not found',
        () => {},
        Gio.ThemedIcon.new('dialog-warning-symbolic')
      );
      return;
    }

    const dafaultIcon = this._settings.get_string("default-icon");
    const stripExt = this._settings.get_boolean("strip");
    const pinned = this._getPinnedScripts();

    const scripts = this._getScripts(this._path);
    if (!scripts || scripts.length === 0) {
      this._menu.innerMenu.addAction(
        t.no_scripts_found || 'No scripts found',
        () => {},
        Gio.ThemedIcon.new('dialog-information-symbolic')
      );
      return;
    }

    // Build script info list
    const allScriptInfos = scripts.map((script) => {
      const scriptName = script.get_name();
      const baseName = scriptName.replace(/\.[^.]+$/, "");

      let iconName = null;
      const svgPath = Gio.File.new_for_path(`${this._path}/${baseName}.svg`);
      const pngPath = Gio.File.new_for_path(`${this._path}/${baseName}.png`);

      if (svgPath.query_exists(null)) {
        iconName = svgPath.get_path();
      } else if (pngPath.query_exists(null)) {
        iconName = pngPath.get_path();
      }

      const icon = iconName ?
        Gio.icon_new_for_string(iconName) :
        Gio.ThemedIcon.new(dafaultIcon || BULLET);

      const displayName = stripExt
        ? scriptName.replace(/\.[^\.]+$/, "")
        : scriptName;

      return { scriptName, displayName, icon, isPinned: pinned.includes(scriptName) };
    });

    // Pinned scripts first
    const pinnedScripts = allScriptInfos.filter(s => s.isPinned);
    const unpinnedScripts = allScriptInfos.filter(s => !s.isPinned);

    if (pinnedScripts.length > 0) {
      // Pinned header
      const pinnedLabel = new PopupMenu.PopupSeparatorMenuItem(t.pinned || 'Pinned');
      this._menu.innerMenu.addMenuItem(pinnedLabel);

      pinnedScripts.forEach(info => this._addScriptMenuItem(info, t));

      // Separator
      this._menu.innerMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    unpinnedScripts.forEach(info => this._addScriptMenuItem(info, t));

    this._allScripts = allScriptInfos;
  }

  _addScriptMenuItem(info, t) {
    const item = new PopupMenu.PopupImageMenuItem(info.displayName, info.icon);
    this._menu.innerMenu.addMenuItem(item);

    item.connect('activate', () => {
      this._launchScript(info.scriptName);
    });

    item.connect('captured-event', (actor, event) => {
      if (event.type() === Clutter.EventType.BUTTON_PRESS &&
          event.get_button() === Clutter.BUTTON_SECONDARY) {
        this._showScriptContextMenu(info, t);
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    info.menuItem = item;
  }

  _showScriptContextMenu(info, t) {
    if (this._pendingContextInfo === info.scriptName &&
        this._scriptContextMenu?.isOpen) {
      this._destroyScriptContextMenu();
      return;
    }
    const itemActor = info.menuItem?.actor;
    if (!itemActor || !this._scriptContextSourceActor || !this._scriptContextMenuManager) {
      return;
    }

    const [x, y] = itemActor.get_transformed_position();
    const [width, height] = itemActor.get_transformed_size();

    this._destroyScriptContextMenu();

    this._scriptContextSourceActor.set_position(
      Math.round(x),
      Math.round(y)
    );
    this._scriptContextSourceActor.set_size(
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height))
    );
    this._scriptContextSourceActor.show();

    const menu = new PopupMenu.PopupMenu(
      this._scriptContextSourceActor,
      0.5,
      St.Side.LEFT
    );
    menu.blockSourceEvents = true;
    menu.actor.hide();
    Main.uiGroup.add_child(menu.actor);

    menu.connect('open-state-changed', (popup, open) => {
      if (!open && this._scriptContextMenu === popup) {
        this._destroyScriptContextMenu();
      }
    });

    const isPinned = this._getPinnedScripts().includes(info.scriptName);
    menu.addAction(
      t.run || 'Run',
      () => {
        this._destroyScriptContextMenu();
        this._launchScript(info.scriptName);
      },
      Gio.ThemedIcon.new('media-playback-start-symbolic')
    );

    menu.addAction(
      t.run_in_terminal || 'Run in Terminal',
      () => {
        this._destroyScriptContextMenu();
        this._launchInTerminal(info.scriptName);
      },
      Gio.ThemedIcon.new('utilities-terminal-symbolic')
    );

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    menu.addAction(
      isPinned ? (t.unpin || 'Unpin') : (t.pin_to_top || 'Pin to Top'),
      () => {
        this._destroyScriptContextMenu();
        this._togglePin(info.scriptName);
      },
      Gio.ThemedIcon.new(isPinned ? 'view-restore-symbolic' : 'view-pin-symbolic')
    );

    this._scriptContextMenu = menu;
    this._pendingContextInfo = info.scriptName;
    this._scriptContextMenuManager.addMenu(menu);
    menu.open(BoxPointer.PopupAnimation.FULL);
    this._scriptContextMenuManager.ignoreRelease();
  }

  _filterMenu() {
    this._destroyScriptContextMenu();
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
      // Filter by configured file extensions
      const extSetting = this._settings.get_string("file-extensions").trim();
      const extensions = extSetting
        ? extSetting.split(',').map(e => e.trim().toLowerCase()).filter(e => e)
        : [];
      const matchesExt = extensions.length === 0 ||
        extensions.some(ext => fileName.toLowerCase().endsWith(ext));
      if (fileType === Gio.FileType.REGULAR && matchesExt) {
        scripts.push(fileInfo);
      }
    }

    enumerator.close(null);
    scripts.sort((a, b) => a.get_name().localeCompare(b.get_name()));
    return scripts;
  }

  _launchScript(script) {
    if (this._indicator?.menu?.isOpen) {
      this._indicator.menu.close();
    }
    const command = [`${this._path}/${script}`];

    try {
      this._launcher.spawnv(command);
    } catch (e) {
      // silently fail
    }
  }

  _launchInTerminal(script) {
    if (this._indicator?.menu?.isOpen) {
      this._indicator.menu.close();
    }
    const scriptPath = `${this._path}/${script}`;

    try {
      this._launcher.spawnv(['gnome-terminal', '--', scriptPath]);
    } catch (e) {
      try {
        this._launcher.spawnv(['x-terminal-emulator', '-e', scriptPath]);
      } catch (e2) {
        // silently fail
      }
    }
  }

  _destroyScriptContextMenu() {
    if (this._scriptContextMenu) {
      this._scriptContextMenu.destroy();
      this._scriptContextMenu = null;
    }
    if (this._scriptContextSourceActor) {
      this._scriptContextSourceActor.hide();
    }
    this._pendingContextInfo = null;
  }

  // Helper function to get the icon based on settings
  _getIcon() {
    // Default: use bundled panel.png
    const fallbackPath = GLib.build_filenamev([this.path, 'icons', 'panel.png']);
    let gicon;
    try {
      const fallbackFile = Gio.File.new_for_path(fallbackPath);
      if (fallbackFile.query_exists(null)) {
        gicon = Gio.icon_new_for_string(fallbackPath);
      } else {
        gicon = new Gio.ThemedIcon({ name: DEFAULT_ICON });
      }
    } catch (e) {
      gicon = new Gio.ThemedIcon({ name: DEFAULT_ICON });
    }

    // Override if custom icon is enabled in settings
    if (this._settings && this._settings.get_boolean("use-custom-top-icon")) {
      try {
        const iconName = this._settings.get_string("top-icon-name");

        if (iconName && iconName.trim() !== "") {
          if (iconName.startsWith('/') || iconName.endsWith('.svg') || iconName.endsWith('.png')) {
            const iconFile = Gio.File.new_for_path(iconName);
            if (iconFile.query_exists(null)) {
              gicon = Gio.icon_new_for_string(iconName);
            }
          } else {
            gicon = new Gio.ThemedIcon({ name: iconName });
          }
        }
      } catch (e) {
        // fall back to default already set above
      }
    }

    return gicon;
  }

  _addIndicator() {
    const lang = this._settings.get_string("language");
    const t = getLocale(this.path, lang);

    this._indicator = new PanelMenu.Button(0.5, this.metadata.name, false);
    this._indicator.style = 'padding: 0; margin: 0;';

    // Create icon using settings
    let gicon = this._getIcon();

    const icon = new St.Icon({
      gicon: gicon,
      style_class: "system-status-icon",
      style: "padding: 0; margin: 0;",
    });
    this._indicator.add_child(icon);

    // Create search entry with icon inside
    this._searchEntry = new St.Entry({
      style_class: 'popup-menu-item',
      style: 'margin: 0px; padding: 4px 8px; min-width: 215px; border: 1px solid rgba(128, 128, 128, 0.3); border-radius: 4px;',
      hint_text: t.search_scripts || 'Search scripts...',
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

    // Right-click context menu with Settings
    this._contextMenu = new PopupMenu.PopupMenu(this._indicator, 0.5, St.Side.TOP);
    Main.uiGroup.add_child(this._contextMenu.actor);
    this._contextMenu.actor.hide();

    this._contextMenu.addAction(t.settings || 'Settings', () => {
      this.openPreferences();
    }, Gio.icon_new_for_string('preferences-system-symbolic'));


    this._indicator.connect('button-press-event', (actor, event) => {
      if (event.get_button() === Clutter.BUTTON_SECONDARY) {
        if (this._indicator.menu.isOpen)
          this._indicator.menu.close();
        this._destroyScriptContextMenu();
        this._contextMenu.toggle();
        return Clutter.EVENT_STOP;
      }
      // Left click: close context menu if open
      if (event.get_button() === Clutter.BUTTON_PRIMARY) {
        if (this._contextMenu.isOpen)
          this._contextMenu.close();
      }
      return Clutter.EVENT_PROPAGATE;
    });

    Main.panel.addToStatusArea(this.metadata.name, this._indicator);

    this._scriptContextSourceActor = new St.Widget({
      reactive: true,
      visible: false,
    });
    this._scriptContextSourceActor.connect('button-press-event', () => {
      if (this._scriptContextMenu?.isOpen) {
        this._scriptContextMenu.close(BoxPointer.PopupAnimation.FULL);
      }
      return Clutter.EVENT_STOP;
    });
    Main.uiGroup.add_child(this._scriptContextSourceActor);
    this._scriptContextMenuManager = new PopupMenu.PopupMenuManager({
      actor: this._scriptContextSourceActor,
    });

    // Connect search functionality
    this._searchEntry.get_clutter_text().connect('text-changed', () => {
      this._filterMenu();
    });

    this._menuId = this._indicator.menu.connect(
      "open-state-changed",
      (menu, open) => {
        if (open) {
          this._fillMenu();
          // Clear search when menu opens
          this._searchEntry.set_text('');
          // Set focus to search entry
          if (this._focusTimeout) {
            GLib.source_remove(this._focusTimeout);
          }
          this._focusTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._searchEntry.grab_key_focus();
            this._focusTimeout = null;
            return GLib.SOURCE_REMOVE;
          });
        } else {
          this._destroyScriptContextMenu();
        }
      },
    );
  }

  enable() {
    this._settings = this.getSettings();

    // Set default path to ~/scripts if not configured
    if (!this._settings.get_string("path")) {
      const defaultPath = GLib.build_filenamev([GLib.get_home_dir(), 'scripts']);
      this._settings.set_string("path", defaultPath);
    }

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

    // Register keyboard shortcuts
    Main.wm.addKeybinding(
      'toggle-menu',
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => {
        if (this._indicator) {
          this._indicator.menu.toggle();
        }
      }
    );

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
    // Remove keyboard shortcuts
    Main.wm.removeKeybinding('toggle-menu');

    // Clean up timeouts
    if (this._refreshTimeout) {
      GLib.source_remove(this._refreshTimeout);
      this._refreshTimeout = null;
    }
    if (this._focusTimeout) {
      GLib.source_remove(this._focusTimeout);
      this._focusTimeout = null;
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

    this._destroyScriptContextMenu();

    if (this._contextMenu) {
      this._contextMenu.destroy();
      this._contextMenu = null;
    }

    if (this._scriptContextSourceActor) {
      this._scriptContextSourceActor.destroy();
      this._scriptContextSourceActor = null;
    }
    this._scriptContextMenuManager = null;

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
