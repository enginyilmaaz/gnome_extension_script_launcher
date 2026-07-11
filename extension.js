import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as BoxPointer from "resource:///org/gnome/shell/ui/boxpointer.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { PopupMenuManager } from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import { getLocale, preloadLocale } from "./locale.js";

// Default icon for the top panel
const DEFAULT_ICON = "utilities-terminal-symbolic";
const BULLET = "pan-end-symbolic";

const ScrollableMenu = class ScrollableMenu extends PopupMenu.PopupMenuSection {
  constructor() {
    super();
    const scrollView = new St.ScrollView();
    this.scrollView = scrollView;
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

  setSizeOverride(width, height) {
    const styles = [];
    if (width > 0) {
      styles.push(`min-width: ${width}px; max-width: ${width}px;`);
    }
    if (height > 0) {
      styles.push(`max-height: ${height}px;`);
    }
    this.scrollView.style = styles.join(' ');
  }
};

export default class LauncherExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._indicator = null;
    this._settings = null;
    this._launcher = null;
    this._menu = null;
    this._path = null;
    this._fileMonitor = null;
    this._refreshTimeout = null;
    this._searchEntry = null;
    this._searchMenuItem = null;
    this._allScripts = [];
    this._scriptContextMenu = null;
    this._pendingContextInfo = null;
    this._scriptContextMenuManager = null;
    this._scriptContextSourceActor = null;
    this._hoverCursorActor = null;
  }


  _setupFileMonitor() {
    // Clean up existing monitor
    if (this._fileMonitor) {
      this._fileMonitor.disconnectObject(this);
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

      this._fileMonitor.connectObject('changed', () => {
        // Debounce the refresh to avoid too many updates
        if (this._refreshTimeout) {
          GLib.source_remove(this._refreshTimeout);
        }
        this._refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          this._fillMenu();
          this._refreshTimeout = null;
          return GLib.SOURCE_REMOVE;
        });
      }, this);
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

  _getHiddenScripts() {
    try {
      return JSON.parse(this._settings.get_string("hidden-scripts"));
    } catch (e) {
      return [];
    }
  }

  _setHiddenScripts(hidden) {
    this._settings.set_string("hidden-scripts", JSON.stringify(hidden));
  }

  _hideScript(scriptName) {
    const hidden = this._getHiddenScripts();
    if (!hidden.includes(scriptName)) {
      hidden.push(scriptName);
      this._setHiddenScripts(hidden);
    }
    this._fillMenu();
  }

  _buildScriptInfo(scriptName) {
    const baseName = scriptName.replace(/\.[^.]+$/, "");
    const defaultIcon = this._settings.get_string("default-icon");
    const stripExt = this._settings.get_boolean("strip");

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
      Gio.ThemedIcon.new(defaultIcon || BULLET);

    const displayName = stripExt
      ? scriptName.replace(/\.[^\.]+$/, "")
      : scriptName;

    return { scriptName, displayName, icon };
  }

  _bindPointerCursor(actor) {
    if (!actor || actor._scriptLauncherPointerBound) {
      return;
    }

    actor._scriptLauncherPointerBound = true;

    actor.connectObject(
      'enter-event', () => {
        this._hoverCursorActor = actor;
        global.display.set_cursor(Meta.Cursor.POINTING_HAND);
        return Clutter.EVENT_PROPAGATE;
      },
      'leave-event', () => {
        if (this._hoverCursorActor === actor) {
          this._hoverCursorActor = null;
          global.display.set_cursor(Meta.Cursor.DEFAULT);
        }
        return Clutter.EVENT_PROPAGATE;
      },
      'destroy', () => {
        if (this._hoverCursorActor === actor) {
          this._hoverCursorActor = null;
          global.display.set_cursor(Meta.Cursor.DEFAULT);
        }
      },
      this
    );

    actor.get_children().forEach(child => this._bindPointerCursor(child));
  }

  _unbindPointerCursor(actor) {
    if (!actor || !actor._scriptLauncherPointerBound) return;
    actor.disconnectObject(this);
    actor._scriptLauncherPointerBound = false;
  }

  _updateSearchVisibility() {
    const showSearch = this._settings?.get_boolean("show-search") ?? true;
    if (this._searchMenuItem?.actor) {
      this._searchMenuItem.actor.visible = showSearch;
    }
    if (!showSearch && this._searchEntry) {
      this._searchEntry.set_text('');
    }
  }

  _getSearchEntryStyle(width) {
    return `margin: 0px; min-width: ${width}px; max-width: ${width}px; padding: 6px 10px; border-radius: 12px; background-color: rgba(127, 127, 127, 0.12); border: 1px solid rgba(128, 128, 128, 0.18);`;
  }

  _createPanelIcon() {
    return new St.Icon({
      gicon: this._getIcon(),
      style_class: "system-status-icon",
      style: "padding: 0; margin: 0;",
    });
  }

  _updateMenuLayout() {
    const schema = this._settings?.settings_schema;
    const width = schema?.has_key('menu-width') ? this._settings.get_int('menu-width') : 0;
    const height = schema?.has_key('menu-height') ? this._settings.get_int('menu-height') : 0;

    if (this._menu) {
      this._menu.setSizeOverride(width, height);
    }

    if (this._searchEntry) {
      const searchWidth = width > 0 ? Math.max(120, width) : 239;
      this._searchEntry.style = this._getSearchEntryStyle(searchWidth);
    }
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

    const hidden = this._getHiddenScripts();
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

    // Build script info list (excluding hidden scripts)
    const allScriptInfos = scripts
      .map((script) => script.get_name())
      .filter((scriptName) => !hidden.includes(scriptName))
      .map((scriptName) => {
        const info = this._buildScriptInfo(scriptName);
        info.isPinned = pinned.includes(scriptName);
        return info;
      });

    // Pinned scripts first
    const pinnedScripts = allScriptInfos.filter(s => s.isPinned);
    const unpinnedScripts = allScriptInfos.filter(s => !s.isPinned);

    if (pinnedScripts.length > 0) {
      pinnedScripts.forEach(info => this._addScriptMenuItem(info, t));

      if (unpinnedScripts.length > 0) {
        const separator = new PopupMenu.PopupSeparatorMenuItem();
        separator.actor.style = 'margin: 0px; padding: 3px 0px;';
        this._menu.innerMenu.addMenuItem(separator);
      }
    }

    unpinnedScripts.forEach(info => this._addScriptMenuItem(info, t));

    this._allScripts = allScriptInfos;
  }

  _addScriptMenuItem(info, t) {
    const item = new PopupMenu.PopupImageMenuItem(info.displayName, info.icon);
    this._menu.innerMenu.addMenuItem(item);
    this._bindPointerCursor(item.actor);

    item.connectObject(
      'activate', () => {
        this._launchScript(info.scriptName);
      },
      'captured-event', (actor, event) => {
        if (event.type() === Clutter.EventType.BUTTON_PRESS &&
            event.get_button() === Clutter.BUTTON_SECONDARY) {
          this._showScriptContextMenu(info, t, event);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      },
      this
    );

    info.menuItem = item;
  }

  _showScriptContextMenu(info, t, event) {
    if (this._pendingContextInfo === info.scriptName &&
        this._scriptContextMenu?.isOpen) {
      this._destroyScriptContextMenu();
      return;
    }
    const itemActor = info.menuItem?.actor;
    if (!itemActor || !this._scriptContextSourceActor || !this._scriptContextMenuManager) {
      return;
    }

    const [stageX, stageY] = event.get_coords();
    const anchorX = stageX - 5;

    this._destroyScriptContextMenu();

    this._scriptContextSourceActor.set_position(
      Math.round(anchorX),
      Math.round(stageY)
    );
    this._scriptContextSourceActor.set_size(
      1,
      1
    );
    this._scriptContextSourceActor.show();

    const menu = new PopupMenu.PopupMenu(
      this._scriptContextSourceActor,
      0.0,
      St.Side.TOP
    );
    menu.blockSourceEvents = true;
    menu.actor.hide();
    Main.uiGroup.add_child(menu.actor);

    menu.connectObject('open-state-changed', (popup, open) => {
      if (!open && this._scriptContextMenu === popup) {
        this._destroyScriptContextMenu();
      }
    }, this);

    const isPinned = this._getPinnedScripts().includes(info.scriptName);
    const runItem = menu.addAction(
      t.run || 'Run',
      () => {
        this._destroyScriptContextMenu();
        this._launchScript(info.scriptName);
      },
      Gio.ThemedIcon.new('media-playback-start-symbolic')
    );
    this._bindPointerCursor(runItem.actor);

    const terminalItem = menu.addAction(
      t.run_in_terminal || 'Run in Terminal',
      () => {
        this._destroyScriptContextMenu();
        this._launchInTerminal(info.scriptName);
      },
      Gio.ThemedIcon.new('utilities-terminal-symbolic')
    );
    this._bindPointerCursor(terminalItem.actor);

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const pinItem = menu.addAction(
      isPinned ? (t.unpin || 'Unpin') : (t.pin_to_top || 'Pin to Top'),
      () => {
        this._destroyScriptContextMenu();
        this._togglePin(info.scriptName);
      },
      Gio.ThemedIcon.new(isPinned ? 'view-restore-symbolic' : 'view-pin-symbolic')
    );
    this._bindPointerCursor(pinItem.actor);

    const hideItem = menu.addAction(
      t.hide || 'Hide',
      () => {
        this._destroyScriptContextMenu();
        this._hideScript(info.scriptName);
      },
      Gio.ThemedIcon.new('view-conceal-symbolic')
    );
    this._bindPointerCursor(hideItem.actor);

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
      const menu = this._scriptContextMenu;
      this._scriptContextMenu = null;
      menu.disconnectObject(this);
      menu.destroy();
    }
    if (this._scriptContextSourceActor) {
      this._scriptContextSourceActor.hide();
    }
    this._pendingContextInfo = null;
  }

  // Helper function to get the icon based on settings
  _getIcon() {
    // Default: use bundled panel.svg
    const fallbackPath = GLib.build_filenamev([this.path, 'icons', 'panel.svg']);
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
    this._bindPointerCursor(this._indicator);

    const icon = this._createPanelIcon();
    this._indicator.add_child(icon);

    // Create search entry with icon inside
    this._searchEntry = new St.Entry({
      style: this._getSearchEntryStyle(239),
      hint_text: t.search_scripts || 'Search scripts...',
      track_hover: true,
      can_focus: true,
    });

    const searchIcon = new St.Icon({
      icon_name: 'edit-find-symbolic',
      icon_size: 14,
    });

    this._searchEntry.set_primary_icon(searchIcon);

    this._searchMenuItem = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
      style_class: '',
    });
    this._searchMenuItem.actor.style = 'padding: 6px 0px 8px; margin: 0px;';
    this._searchMenuItem.add_child(this._searchEntry);

    this._menu = new ScrollableMenu();

    // Add search box first, then the scrollable menu
    this._indicator.menu.addMenuItem(this._searchMenuItem);
    this._indicator.menu.addMenuItem(this._menu);

    // Right-click context menu with Settings
    this._contextMenu = new PopupMenu.PopupMenu(this._indicator, 0.5, St.Side.TOP);
    Main.uiGroup.add_child(this._contextMenu.actor);
    this._contextMenu.actor.hide();

    const hiddenScriptsItem = this._contextMenu.addAction(t.hidden_scripts || 'Hidden Scripts', () => {
      this._contextMenu.close();
      this._settings.set_string('prefs-open-page', 'hidden');
      this.openPreferences();
    }, Gio.icon_new_for_string('view-conceal-symbolic'));
    this._bindPointerCursor(hiddenScriptsItem.actor);

    const settingsItem = this._contextMenu.addAction(t.settings || 'Settings', () => {
      this._settings.set_string('prefs-open-page', '');
      this.openPreferences();
    }, Gio.icon_new_for_string('preferences-system-symbolic'));
    this._bindPointerCursor(settingsItem.actor);


    this._indicator.connectObject('button-press-event', (actor, event) => {
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
    }, this);

    Main.panel.addToStatusArea(this.metadata.name, this._indicator);

    this._scriptContextSourceActor = new St.Widget({
      reactive: true,
      visible: false,
    });
    this._scriptContextSourceActor.connectObject('button-press-event', () => {
      if (this._scriptContextMenu?.isOpen) {
        this._scriptContextMenu.close(BoxPointer.PopupAnimation.FULL);
      }
      return Clutter.EVENT_STOP;
    }, this);
    Main.uiGroup.add_child(this._scriptContextSourceActor);
    this._scriptContextMenuManager = new PopupMenuManager({
      actor: this._scriptContextSourceActor,
    });

    // Connect search functionality
    this._searchEntry.get_clutter_text().connectObject('text-changed', () => {
      this._filterMenu();
    }, this);
    this._updateMenuLayout();
    this._updateSearchVisibility();

    this._indicator.menu.connectObject(
      "open-state-changed",
      (menu, open) => {
        if (open) {
          this._fillMenu();
          // Clear search when menu opens
          this._searchEntry.set_text('');
          if (this._settings.get_boolean('show-search')) {
            if (this._focusTimeout) {
              GLib.source_remove(this._focusTimeout);
            }
            this._focusTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
              this._searchEntry.grab_key_focus();
              this._focusTimeout = null;
              return GLib.SOURCE_REMOVE;
            });
          }
        } else {
          this._destroyScriptContextMenu();
        }
      },
      this,
    );
  }

  async enable() {
    this._settings = this.getSettings();

    // Set default path to ~/scripts if not configured
    if (!this._settings.get_string("path")) {
      const defaultPath = GLib.build_filenamev([GLib.get_home_dir(), 'scripts']);
      this._settings.set_string("path", defaultPath);
    }

    // Preload locale asynchronously to avoid synchronous file IO in shell
    const lang = this._settings.get_string("language");
    await preloadLocale(this.path, lang);

    // Settings listeners; all cleared with a single disconnectObject(this)
    this._settings.connectObject(
      'changed::language', () => {
        preloadLocale(this.path, this._settings.get_string("language"));
      },
      'changed::use-custom-top-icon', () => this._updateTopIcon(),
      'changed::top-icon-name', () => this._updateTopIcon(),
      'changed::path', () => this._setupFileMonitor(),
      'changed::show-search', () => this._updateSearchVisibility(),
      this
    );
    if (this._settings.settings_schema?.has_key('menu-width')) {
      this._settings.connectObject('changed::menu-width', () => this._updateMenuLayout(), this);
    }
    if (this._settings.settings_schema?.has_key('menu-height')) {
      this._settings.connectObject('changed::menu-height', () => this._updateMenuLayout(), this);
    }

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
      const icon = this._createPanelIcon();
      this._indicator.insert_child_at_index(icon, 0);
    }
  }

  disable() {
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
      this._fileMonitor.disconnectObject(this);
      this._fileMonitor.cancel();
      this._fileMonitor = null;
    }

    // Disconnect every tracked signal with one call per object
    if (this._settings) {
      this._settings.disconnectObject(this);
    }
    if (this._indicator) {
      this._indicator.menu.disconnectObject(this);
    }
    if (this._searchEntry) {
      this._searchEntry.get_clutter_text().disconnectObject(this);
    }

    this._destroyScriptContextMenu();
    if (this._scriptContextMenu) {
      this._scriptContextMenu.destroy();
      this._scriptContextMenu = null;
    }

    if (this._contextMenu) {
      this._contextMenu.destroy();
      this._contextMenu = null;
    }

    if (this._scriptContextSourceActor) {
      this._scriptContextSourceActor.disconnectObject(this);
      this._scriptContextSourceActor.destroy();
      this._scriptContextSourceActor = null;
    }
    this._scriptContextMenuManager = null;

    if (this._menu) {
      this._menu.destroy();
      this._menu = null;
    }

    if (this._searchEntry) {
      this._searchEntry.destroy();
      this._searchEntry = null;
    }

    if (this._searchMenuItem) {
      this._searchMenuItem.destroy();
      this._searchMenuItem = null;
    }

    if (this._indicator) {
      this._indicator.disconnectObject(this);
      this._unbindPointerCursor(this._indicator);
      this._indicator.destroy();
      this._indicator = null;
    }

    // Reset cursor if still overridden
    if (this._hoverCursorActor) {
      global.display.set_cursor(Meta.Cursor.DEFAULT);
      this._hoverCursorActor = null;
    }

    this._settings = null;
    this._launcher = null;
    this._allScripts = [];
  }
}
