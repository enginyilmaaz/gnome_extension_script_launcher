import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";

export default class LauncherPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup();
    page.add(group);

    // Use Custom Top Icon
    const rowUseCustomTopIcon = new Adw.ActionRow({
      title: "Use Custom Top Icon",
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
    
    // Top Bar Icon Name
    const rowTopIconName = new Adw.ActionRow({
      title: "Top Icon Name",
      subtitle: "Icon name (e.g., firefox-symbolic) or path to icon file",
    });
    group.add(rowTopIconName);

    const entryTopIconName = new Gtk.Entry({
      placeholder_text: "gnome-terminal",
      text: settings.get_string("top-icon-name"),
      valign: Gtk.Align.CENTER,
      hexpand: true,
    });

    settings.bind(
      "top-icon-name",
      entryTopIconName,
      "text",
      Gio.SettingsBindFlags.DEFAULT,
    );

    // Only enable the icon name entry when the toggle is active
    toggleTopIcon.connect('notify::active', () => {
      entryTopIconName.set_sensitive(toggleTopIcon.get_active());
    });
    
    // Set initial sensitivity
    entryTopIconName.set_sensitive(toggleTopIcon.get_active());

    rowTopIconName.add_suffix(entryTopIconName);
    rowTopIconName.activatable_widget = entryTopIconName;

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
      hexpand: true,
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

    rowPath.add_suffix(entryPath);
    rowPath.add_suffix(btnBrowse);

    // Shebang Icon
    const rowIconType = new Adw.ActionRow({
      title: "Shebang Icon",
      subtitle: "Use script shebang to set an icon",
    });
    group.add(rowIconType);

    const toggleIconType = new Gtk.Switch({
      active: settings.get_boolean("shebang-icon"),
      valign: Gtk.Align.CENTER,
    });

    settings.bind(
      "shebang-icon",
      toggleIconType,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );

    rowIconType.add_suffix(toggleIconType);
    rowIconType.activatable_widget = toggleIconType;

    // Default Icon
    const rowIconName = new Adw.ActionRow({
      title: "Default Icon",
      subtitle: "Used when shebang icon is disabled",
    });
    group.add(rowIconName);

    const entryIconName = new Gtk.Entry({
      placeholder_text: "pan-end-symbolic",
      text: settings.get_string("default-icon"),
      valign: Gtk.Align.CENTER,
      hexpand: true,
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
      box.append(new Gtk.Image({ icon_name: currentIcon, pixel_size: 48 }));
      box.append(new Gtk.Label({ label: currentIcon }));
      tooltip.set_custom(box);
      return true;
    });

    entryIconName.connect('changed', () => {
      const name = entryIconName.get_text().trim();
      if (name) {
        const theme = Gtk.IconTheme.get_for_display(entryIconName.get_display());
        if (theme.has_icon(name)) {
          iconPreview.set_from_icon_name(name);
          currentIcon = name;
        }
      }
    });

    rowIconName.add_suffix(entryIconName);
    rowIconName.add_suffix(btnPreview);

    // Strip
    const rowStrip = new Adw.ActionRow({
      title: "Show File Extensions",
      subtitle: "Show file extensions in script list (e.g. Script.sh instead of Script)",
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
            const keys = ['path', 'shebang-icon', 'default-icon', 'strip',
                           'custom-icons', 'custom-icon-map', 'use-custom-top-icon', 'top-icon-name'];
            keys.forEach(key => {
              const variant = settings.get_value(key);
              data[key] = variant.recursiveUnpack();
            });
            const json = JSON.stringify(data, null, 2);
            file.replace_contents(new TextEncoder().encode(json), null, false,
              Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const toast = new Adw.Toast({ title: `Exported to ${path}` });
            window.add_toast(toast);
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
              const toastFail = new Adw.Toast({ title: 'Failed to read file!' });
              window.add_toast(toastFail);
              return;
            }
            const json = new TextDecoder().decode(contents);
            const data = JSON.parse(json);
            Object.entries(data).forEach(([key, value]) => {
              if (typeof value === 'boolean') settings.set_boolean(key, value);
              else if (typeof value === 'string') settings.set_string(key, value);
            });
            const toastImport = new Adw.Toast({ title: `Imported from ${file.get_path()}` });
            window.add_toast(toastImport);
          }
        } catch (e) {
          // user cancelled
        }
      });
    });
    rowImport.add_suffix(btnImport);

    const [curW, curH] = window.get_default_size();
    window.set_default_size(curW, curH + 100);
    window.add(page);
  }
}
