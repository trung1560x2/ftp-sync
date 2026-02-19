## 🚀 FTP Sync Manager v{VERSION}

### ✨ What's New in this Release

#### Performance Improvements
- ⚡ **5-10x faster** Visual Diff upload/download with parallel processing
- 🔄 Connection pooling with pre-warming for instant transfers
- 📦 Smart batching for multiple file operations
- 🎯 Real-time progress tracking with speed (MB/s) & ETA

#### Bug Fixes
- 🐛 Fixed critical bug in folder upload (was processing files sequentially, now parallel)
- 🔧 Fixed download folder to use parallel processing
- ✅ Improved error handling and retry logic

#### New Features
- 🎨 Visual feedback with "Send Queue" button
- 📊 Enhanced progress modal with overall progress bar
- 🔍 Better logging for debugging

### 📥 Installation

#### Windows
1. Download `FTP-Sync-Manager-Setup-{VERSION}.exe`
2. Run the installer
3. Follow the installation wizard

#### Linux
1. Download `FTP-Sync-Manager-{VERSION}.AppImage`
2. Make it executable: `chmod +x FTP-Sync-Manager-*.AppImage`
3. Run: `./FTP-Sync-Manager-*.AppImage`

#### macOS
1. Download `FTP-Sync-Manager-{VERSION}.dmg`
2. Open the DMG file
3. Drag the app to Applications folder

### 🔧 Performance Configuration

For maximum speed, increase parallel connections in your database:

```sql
-- View current settings
SELECT id, name, parallel_connections FROM ftp_connections;

-- Increase to 5 (recommended)
UPDATE ftp_connections SET parallel_connections = 5;

-- Or increase to 10 (maximum, for powerful servers)
UPDATE ftp_connections SET parallel_connections = 10;
```

Or run the provided script:
```bash
sqlite3 ftp_manager.sqlite < scripts/increase-parallel-connections.sql
```

### 📖 Documentation

- [Visual Diff Improvements Guide](./VISUAL_DIFF_IMPROVEMENTS.md)
- [README](./README.md)

### 🐛 Known Issues

None at this time. Please report any issues on GitHub!

### 🙏 Credits

Built with ❤️ by ThanhTrung

---

**Full Changelog**: https://github.com/trung1560x2/ftp-sync/compare/v1.0.0...v{VERSION}
