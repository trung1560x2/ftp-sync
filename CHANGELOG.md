# Changelog

All notable changes to FTP Sync Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2025-01-XX

### Added
- ⚡ **5-10x faster** Visual Diff upload/download with parallel processing
- 🔄 Connection pooling with pre-warming for instant transfers
- 📦 Smart batching - click multiple files, send as one batch
- 🎯 Real-time progress tracking with speed (MB/s) and ETA
- 🎨 "Send Queue" button for manual batch triggering
- 📊 Enhanced progress modal with overall progress bar
- 🔍 Better logging for debugging (shows pool size, scanning progress)
- 📝 SQL script to increase parallel connections
- 📖 Comprehensive documentation (VISUAL_DIFF_IMPROVEMENTS.md)

### Fixed
- 🐛 **Critical bug**: Folder upload was processing files sequentially instead of parallel
  - Before: `await queueFileForUpload()` waited for each file to finish
  - After: `queueFileForUploadNonBlocking()` queues all files immediately
  - Result: 5-10x faster folder uploads
- 🐛 Download folder now uses parallel processing (was sequential)
- ✅ Improved error handling and retry logic with exponential backoff
- 🔧 Fixed connection pool management and reuse

### Changed
- 🚀 Upload folder: Queue all files immediately, process in parallel
- 🚀 Download folder: Queue all files to PQueue for parallel processing
- ⏱️ Increased debounce time from 300ms to 2 seconds for better batching
- 📝 Enhanced logging with more context (pool size, file counts, etc.)

### Performance
- Upload 100 files: ~5 minutes → ~1 minute (5x faster with pool=5)
- Download folder: ~10 minutes → ~2 minutes (5x faster with pool=5)
- Connection warm-up: Cold start eliminated with pre-warming
- Buffer size: Configurable (default 16MB) for optimal streaming

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- FTP/FTPS/SFTP support
- Real-time file synchronization
- Visual Diff for comparing local and remote files
- File Manager with upload/download
- Statistics and reporting
- Connection management with encrypted passwords
- Multi-platform support (Windows, Linux, macOS)

### Features
- Electron-based desktop application
- React + TypeScript frontend
- Express.js backend
- SQLite database
- Connection pooling (1-10 parallel connections)
- Progress tracking with speed and ETA
- Ignore patterns (.ftpignore)
- Conflict resolution strategies

[Unreleased]: https://github.com/trung1560x2/ftp-sync/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/trung1560x2/ftp-sync/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/trung1560x2/ftp-sync/releases/tag/v1.0.0
