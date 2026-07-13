CREATE TABLE IF NOT EXISTS terminal_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  theme TEXT DEFAULT 'omnisync_hud', -- preset name (e.g. 'dracula') or custom JSON
  font_family TEXT DEFAULT 'JetBrains Mono',
  font_size INTEGER DEFAULT 12,
  line_height REAL DEFAULT 1.2,
  letter_spacing REAL DEFAULT 0,
  enable_ligatures INTEGER DEFAULT 1,
  scrollback_limit INTEGER DEFAULT 10000,
  custom_keybindings TEXT DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed default profile if not exists
INSERT INTO terminal_profiles (name, theme, font_family, font_size, line_height, letter_spacing, enable_ligatures, scrollback_limit, custom_keybindings, is_default)
SELECT 'Default Profile', 'omnisync_hud', 'JetBrains Mono', 12, 1.2, 0, 1, 10000, '{}', 1
WHERE NOT EXISTS (SELECT 1 FROM terminal_profiles WHERE is_default = 1);
