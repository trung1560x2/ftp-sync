import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

// Get all profiles
router.get('/profiles', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const profiles = await db.all('SELECT * FROM terminal_profiles ORDER BY name ASC');
    
    // Parse JSON keybindings for safety
    const parsedProfiles = profiles.map(p => ({
      ...p,
      enable_ligatures: !!p.enable_ligatures,
      is_default: !!p.is_default,
      custom_keybindings: JSON.parse(p.custom_keybindings || '{}')
    }));

    res.json({ success: true, profiles: parsedProfiles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new profile
router.post('/profiles', async (req: Request, res: Response) => {
  const { name, theme, font_family, font_size, line_height, letter_spacing, enable_ligatures, scrollback_limit, custom_keybindings, is_default } = req.body;
  if (!name) {
    res.status(400).json({ success: false, error: 'Name is required' });
    return;
  }

  try {
    const db = await getDb();

    // If making default, unset other defaults first
    if (is_default) {
      await db.run('UPDATE terminal_profiles SET is_default = 0');
    }

    const keybindingsStr = typeof custom_keybindings === 'object' 
      ? JSON.stringify(custom_keybindings) 
      : (custom_keybindings || '{}');

    const result = await db.run(
      `INSERT INTO terminal_profiles (name, theme, font_family, font_size, line_height, letter_spacing, enable_ligatures, scrollback_limit, custom_keybindings, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        theme || 'omnisync_hud',
        font_family || 'JetBrains Mono',
        font_size !== undefined ? parseInt(font_size) : 12,
        line_height !== undefined ? parseFloat(line_height) : 1.2,
        letter_spacing !== undefined ? parseFloat(letter_spacing) : 0,
        enable_ligatures ? 1 : 0,
        scrollback_limit !== undefined ? parseInt(scrollback_limit) : 10000,
        keybindingsStr,
        is_default ? 1 : 0
      ]
    );

    res.status(201).json({ success: true, id: result.lastID, message: 'Profile created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a profile
router.put('/profiles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, theme, font_family, font_size, line_height, letter_spacing, enable_ligatures, scrollback_limit, custom_keybindings, is_default } = req.body;

  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM terminal_profiles WHERE id = ?', id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    // If making default, unset other defaults first
    if (is_default) {
      await db.run('UPDATE terminal_profiles SET is_default = 0 WHERE id != ?', id);
    }

    const keybindingsStr = custom_keybindings !== undefined
      ? (typeof custom_keybindings === 'object' ? JSON.stringify(custom_keybindings) : custom_keybindings)
      : existing.custom_keybindings;

    await db.run(
      `UPDATE terminal_profiles 
       SET name = ?, theme = ?, font_family = ?, font_size = ?, line_height = ?, letter_spacing = ?, enable_ligatures = ?, scrollback_limit = ?, custom_keybindings = ?, is_default = ?
       WHERE id = ?`,
      [
        name !== undefined ? name : existing.name,
        theme !== undefined ? theme : existing.theme,
        font_family !== undefined ? font_family : existing.font_family,
        font_size !== undefined ? parseInt(font_size) : existing.font_size,
        line_height !== undefined ? parseFloat(line_height) : existing.line_height,
        letter_spacing !== undefined ? parseFloat(letter_spacing) : existing.letter_spacing,
        enable_ligatures !== undefined ? (enable_ligatures ? 1 : 0) : existing.enable_ligatures,
        scrollback_limit !== undefined ? parseInt(scrollback_limit) : existing.scrollback_limit,
        keybindingsStr,
        is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
        id
      ]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a profile
router.delete('/profiles/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    
    // Check if it's the default profile - cannot delete
    const profile = await db.get('SELECT is_default FROM terminal_profiles WHERE id = ?', id);
    if (profile && profile.is_default) {
      res.status(400).json({ success: false, error: 'Cannot delete the default profile' });
      return;
    }

    await db.run('DELETE FROM terminal_profiles WHERE id = ?', id);
    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set default profile
router.post('/profiles/:id/default', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('UPDATE terminal_profiles SET is_default = 0');
    await db.run('UPDATE terminal_profiles SET is_default = 1 WHERE id = ?', id);
    res.json({ success: true, message: 'Default profile updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all active tabs
router.get('/tabs', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const tabs = await db.all('SELECT * FROM terminal_tabs ORDER BY position ASC');
    
    const formatted = tabs.map(t => ({
      id: t.id,
      connectionId: t.connection_id,
      title: t.title,
      cwd: t.cwd,
      color: t.color,
      splitMode: t.split_mode,
      splitParentId: t.split_parent_id,
      position: t.position
    }));
    
    res.json({ success: true, tabs: formatted });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync/Save all tabs
router.post('/tabs', async (req: Request, res: Response) => {
  const { tabs } = req.body;
  if (!Array.isArray(tabs)) {
    res.status(400).json({ success: false, error: 'Tabs array is required' });
    return;
  }

  try {
    const db = await getDb();
    await db.exec('BEGIN TRANSACTION;');
    
    try {
      await db.run('DELETE FROM terminal_tabs');
      
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        await db.run(
          `INSERT INTO terminal_tabs (id, connection_id, title, cwd, color, split_mode, split_parent_id, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tab.id,
            tab.connectionId,
            tab.title,
            tab.cwd || '',
            tab.color || '',
            tab.splitMode || 'none',
            tab.splitParentId || '',
            i
          ]
        );
      }
      
      await db.exec('COMMIT;');
      res.json({ success: true, message: 'Tabs synced successfully' });
    } catch (err: any) {
      await db.exec('ROLLBACK;');
      throw err;
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
