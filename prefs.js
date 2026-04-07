import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";

export default class LauncherPreferences extends ExtensionPreferences {
  _sendNotification(title, body) {
    try {
      GLib.spawn_command_line_async(`notify-send "${title}" "${body}"`);
    } catch (e) {
      // silently fail
    }
  }

  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();

    page.connect('realize', () => {
      const walk = (widget) => {
        if (widget.constructor.name === 'AdwClamp' || widget.constructor.name === 'Clamp') {
          widget.set_maximum_size(640);
          widget.set_tightening_threshold(640);
          return;
        }
        if (widget.get_first_child) {
          let child = widget.get_first_child();
          while (child) {
            walk(child);
            child = child.get_next_sibling();
          }
        }
      };
      walk(page);
    });

    const group = new Adw.PreferencesGroup();
    page.add(group);

    // Use Custom Top Panel Icon
    const rowUseCustomTopIcon = new Adw.ActionRow({
      title: "Use Custom Top Panel Icon",
      subtitle: "Replace the default terminal icon in the top panel",
    });
    group.add(rowUseCustomTopIcon);

    const toggleTopIcon = new Gtk.Switch({
      active: settings.get_boolean("use-custom-top-icon"),
      valign: Gtk.Align.CENTER,
    });

    settings.bind(
      "use-custom-top-icon",
      toggleTopIcon,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    rowUseCustomTopIcon.add_suffix(toggleTopIcon);
    rowUseCustomTopIcon.activatable_widget = toggleTopIcon;

    // Top Panel Icon
    const rowTopIconName = new Adw.ActionRow({
      title: "Top Panel Icon",
      subtitle: "Icon name or path to icon file",
    });
    group.add(rowTopIconName);

    const entryTopIconName = new Gtk.Entry({
      placeholder_text: "gnome-terminal",
      text: settings.get_string("top-icon-name"),
      valign: Gtk.Align.CENTER,
      width_request: 200,
    });

    settings.bind(
      "top-icon-name",
      entryTopIconName,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const btnBrowseIcon = new Gtk.Button({
      icon_name: "folder-open-symbolic",
      valign: Gtk.Align.CENTER,
    });
    btnBrowseIcon.connect('clicked', () => {
      const dialog = new Gtk.FileDialog();
      const iconFilter = new Gtk.FileFilter();
      iconFilter.set_name("Icon files (*.svg, *.png)");
      iconFilter.add_pattern("*.svg");
      iconFilter.add_pattern("*.png");
      const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
      filters.append(iconFilter);
      dialog.set_filters(filters);
      dialog.set_default_filter(iconFilter);
      dialog.open(window, null, (dialog, result) => {
        try {
          const file = dialog.open_finish(result);
          if (file) {
            entryTopIconName.set_text(file.get_path());
          }
        } catch (e) {
          // user cancelled
        }
      });
    });

    const btnTopPreview = new Gtk.Button({
      icon_name: "view-reveal-symbolic",
      valign: Gtk.Align.CENTER,
      has_tooltip: true,
    });
    btnTopPreview.connect('query-tooltip', (_w, _x, _y, _kbd, tooltip) => {
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 });
      const iconVal = entryTopIconName.get_text().trim();
      if (iconVal.startsWith('/') || iconVal.endsWith('.svg') || iconVal.endsWith('.png')) {
        box.append(new Gtk.Image({ file: iconVal, pixel_size: 48 }));
      } else {
        box.append(new Gtk.Image({ icon_name: iconVal || "gnome-terminal", pixel_size: 48 }));
      }
      box.append(new Gtk.Label({ label: iconVal || "gnome-terminal" }));
      tooltip.set_custom(box);
      return true;
    });

    // Only enable when the toggle is active
    const updateTopIconSensitivity = () => {
      const active = toggleTopIcon.get_active();
      entryTopIconName.set_sensitive(active);
      btnBrowseIcon.set_sensitive(active);
      btnTopPreview.set_sensitive(active);
    };
    toggleTopIcon.connect('notify::active', updateTopIconSensitivity);
    updateTopIconSensitivity();

    rowTopIconName.add_suffix(entryTopIconName);
    rowTopIconName.add_suffix(btnBrowseIcon);
    rowTopIconName.add_suffix(btnTopPreview);

    // Script Path
    const rowPath = new Adw.ActionRow({
      title: "Scripts Path",
      subtitle: "Directory with your scripts",
    });
    group.add(rowPath);

    const entryPath = new Gtk.Entry({
      placeholder_text: "/home/username/myscripts",
      text: settings.get_string("path"),
      valign: Gtk.Align.CENTER,
      width_request: 200,
    });

    settings.bind("path", entryPath, "text", Gio.SettingsBindFlags.DEFAULT);

    const btnBrowse = new Gtk.Button({
      icon_name: "folder-open-symbolic",
      valign: Gtk.Align.CENTER,
    });
    btnBrowse.connect('clicked', () => {
      const dialog = new Gtk.FileDialog();
      dialog.select_folder(window, null, (dialog, result) => {
        try {
          const folder = dialog.select_folder_finish(result);
          if (folder) {
            entryPath.set_text(folder.get_path());
          }
        } catch (e) {
          // user cancelled
        }
      });
    });

    // Invisible spacer to align with rows that have 2 buttons
    const pathSpacer = new Gtk.Box({ width_request: 34 });
    rowPath.add_suffix(entryPath);
    rowPath.add_suffix(btnBrowse);
    rowPath.add_suffix(pathSpacer);

    // Default Icon
    const rowIconName = new Adw.ActionRow({
      title: "Default Icon",
      subtitle: "Icon name or path to icon file",
    });
    group.add(rowIconName);

    const entryIconName = new Gtk.Entry({
      placeholder_text: "pan-end-symbolic",
      text: settings.get_string("default-icon"),
      valign: Gtk.Align.CENTER,
      width_request: 200,
    });

    settings.bind(
      "default-icon",
      entryIconName,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );

    const iconPreview = new Gtk.Image({
      icon_name: settings.get_string("default-icon") || "pan-end-symbolic",
      pixel_size: 24,
    });

    const btnPreview = new Gtk.Button({
      icon_name: "view-reveal-symbolic",
      valign: Gtk.Align.CENTER,
      has_tooltip: true,
    });

    let currentIcon = settings.get_string("default-icon") || "pan-end-symbolic";

    btnPreview.connect('query-tooltip', (_w, _x, _y, _kbd, tooltip) => {
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 });
      if (currentIcon.startsWith('/') || currentIcon.endsWith('.svg') || currentIcon.endsWith('.png')) {
        box.append(new Gtk.Image({ file: currentIcon, pixel_size: 48 }));
      } else {
        box.append(new Gtk.Image({ icon_name: currentIcon, pixel_size: 48 }));
      }
      box.append(new Gtk.Label({ label: currentIcon }));
      tooltip.set_custom(box);
      return true;
    });

    const btnBrowseDefaultIcon = new Gtk.Button({
      icon_name: "folder-open-symbolic",
      valign: Gtk.Align.CENTER,
    });
    btnBrowseDefaultIcon.connect('clicked', () => {
      const dialog = new Gtk.FileDialog();
      const iconFilter = new Gtk.FileFilter();
      iconFilter.set_name("Icon files (*.svg, *.png)");
      iconFilter.add_pattern("*.svg");
      iconFilter.add_pattern("*.png");
      const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
      filters.append(iconFilter);
      dialog.set_filters(filters);
      dialog.set_default_filter(iconFilter);
      dialog.open(window, null, (dialog, result) => {
        try {
          const file = dialog.open_finish(result);
          if (file) {
            entryIconName.set_text(file.get_path());
          }
        } catch (e) {
          // user cancelled
        }
      });
    });

    entryIconName.connect('changed', () => {
      const name = entryIconName.get_text().trim();
      if (name) {
        if (name.startsWith('/') || name.endsWith('.svg') || name.endsWith('.png')) {
          currentIcon = name;
        } else {
          const theme = Gtk.IconTheme.get_for_display(entryIconName.get_display());
          if (theme.has_icon(name)) {
            iconPreview.set_from_icon_name(name);
            currentIcon = name;
          }
        }
      }
    });

    rowIconName.add_suffix(entryIconName);
    rowIconName.add_suffix(btnBrowseDefaultIcon);
    rowIconName.add_suffix(btnPreview);

    // Strip
    const rowStrip = new Adw.ActionRow({
      title: "Show File Extensions",
      subtitle: "Show file extensions in script list (e.g. Script.sh)",
    });
    group.add(rowStrip);

    const toggleStrip = new Gtk.Switch({
      active: !settings.get_boolean("strip"),
      valign: Gtk.Align.CENTER,
    });

    settings.bind(
      "strip",
      toggleStrip,
      "active",
      Gio.SettingsBindFlags.INVERT_BOOLEAN,
    );

    rowStrip.add_suffix(toggleStrip);
    rowStrip.activatable_widget = toggleStrip;

    // Backup & Import group
    const backupGroup = new Adw.PreferencesGroup({
      title: "Backup & Import",
    });
    page.add(backupGroup);

    // Export
    const rowExport = new Adw.ActionRow({
      title: "Export Settings",
      subtitle: "Save settings to a .conf file",
    });
    backupGroup.add(rowExport);

    const btnExport = new Gtk.Button({
      label: "Export",
      valign: Gtk.Align.CENTER,
    });
    btnExport.connect('clicked', () => {
      const now = new Date();
      const timestamp = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}_${String(now.getMinutes()).padStart(2, '0')}_${String(now.getSeconds()).padStart(2, '0')}`;
      const defaultName = `${this.metadata.name.replace(/\s+/g, '_').toLowerCase()}_${timestamp}.conf`;

      const dialog = new Gtk.FileDialog();
      dialog.set_initial_name(defaultName);

      const confFilter = new Gtk.FileFilter();
      confFilter.set_name("Config files (*.conf)");
      confFilter.add_pattern("*.conf");
      const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
      filters.append(confFilter);
      dialog.set_filters(filters);
      dialog.set_default_filter(confFilter);

      dialog.save(window, null, (dialog, result) => {
        try {
          let file = dialog.save_finish(result);
          if (file) {
            let path = file.get_path();
            if (!path.endsWith('.conf')) {
              path = `${path}.conf`;
              file = Gio.File.new_for_path(path);
            }
            const data = {};
            const keys = ['path', 'default-icon', 'strip',
                           'custom-icons', 'custom-icon-map', 'use-custom-top-icon', 'top-icon-name'];
            keys.forEach(key => {
              const variant = settings.get_value(key);
              data[key] = variant.recursiveUnpack();
            });
            const json = JSON.stringify(data, null, 2);
            file.replace_contents(new TextEncoder().encode(json), null, false,
              Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            this._sendNotification('Script Launcher', `Exported to ${path}`);
          }
        } catch (e) {
          // user cancelled
        }
      });
    });
    rowExport.add_suffix(btnExport);

    // Import
    const rowImport = new Adw.ActionRow({
      title: "Import Settings",
      subtitle: "Load settings from a .conf file",
    });
    backupGroup.add(rowImport);

    const btnImport = new Gtk.Button({
      label: "Import",
      valign: Gtk.Align.CENTER,
    });
    btnImport.connect('clicked', () => {
      const dialog = new Gtk.FileDialog();

      const confFilter = new Gtk.FileFilter();
      confFilter.set_name("Config files (*.conf)");
      confFilter.add_pattern("*.conf");
      const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
      filters.append(confFilter);
      dialog.set_filters(filters);
      dialog.set_default_filter(confFilter);

      dialog.open(window, null, (dialog, result) => {
        try {
          const file = dialog.open_finish(result);
          if (file) {
            const [ok, contents] = file.load_contents(null);
            if (!ok) {
              this._sendNotification('Script Launcher', 'Failed to read file!');
              return;
            }
            const json = new TextDecoder().decode(contents);
            const data = JSON.parse(json);
            Object.entries(data).forEach(([key, value]) => {
              if (typeof value === 'boolean') settings.set_boolean(key, value);
              else if (typeof value === 'string') settings.set_string(key, value);
            });
            this._sendNotification('Script Launcher', `Imported from ${file.get_path()}`);
          }
        } catch (e) {
          // user cancelled
        }
      });
    });
    rowImport.add_suffix(btnImport);

    const [curW, curH] = window.get_default_size();
    window.set_default_size(curW, 540);
    window.add(page);
  }
}
