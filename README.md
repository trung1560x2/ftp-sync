# FTP Sync Manager

Ứng dụng quản lý và đồng bộ hóa FTP mạnh mẽ được xây dựng với Electron, React và TypeScript.

![Version](https://img.shields.io/badge/version-1.0.1-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## 📥 Download

**Latest Release: v1.0.1**

| Platform | Download |
|----------|----------|
| 🪟 Windows | [FTP-Sync-Manager-Setup-1.0.1.exe](https://github.com/trung1560x2/ftp-sync/releases/latest) |
| 🐧 Linux | [FTP-Sync-Manager-1.0.1.AppImage](https://github.com/trung1560x2/ftp-sync/releases/latest) |
| 🍎 macOS | [FTP-Sync-Manager-1.0.1.dmg](https://github.com/trung1560x2/ftp-sync/releases/latest) |

[📦 View All Releases](https://github.com/trung1560x2/ftp-sync/releases)

## 📋 Mô tả

FTP Sync Manager là một ứng dụng desktop cho phép bạn:
- Quản lý nhiều kết nối FTP/SFTP cùng lúc
- Đồng bộ hóa file realtime giữa thư mục local và server
- Upload/Download file với tốc độ cao thông qua kết nối song song (5-10x nhanh hơn)
- Visual Diff để so sánh và sync file giữa local và remote
- Theo dõi tiến trình và thống kê chi tiết

## ✨ Tính năng chính

### 🔌 Quản lý kết nối FTP/SFTP
- Lưu trữ nhiều profile kết nối
- Mật khẩu được mã hóa an toàn
- Hỗ trợ FTP/FTPS/SFTP
- Test connection trước khi lưu

### 🔄 Đồng bộ hóa thông minh
- Theo dõi thay đổi file realtime với chokidar
- Upload tự động khi file thay đổi
- Xóa file trên server khi xóa local
- **Hỗ trợ upload song song với nhiều kết nối đồng thời (1-10 connections)**
- Connection pooling với pre-warming

### 🎯 Visual Diff (NEW!)
- So sánh file giữa local và remote
- Hiển thị trạng thái: synchronized, newer local, newer remote, missing
- Upload/Download từng file hoặc batch
- **Smart batching** - Click nhiều file, gửi cùng lúc
- Real-time progress với speed (MB/s) và ETA
- **5-10x nhanh hơn** nhờ parallel processing

### 📁 Quản lý file
- Duyệt file trên server FTP/SFTP
- Upload/Download thủ công
- Xem tiến trình upload chi tiết
- Content diff với Monaco Editor

### 📊 Thống kê & Báo cáo
- Theo dõi lượng data đã truyền
- Thống kê số file đã sync
- Log chi tiết các hoạt động
- Charts với Recharts

## 🚀 Quick Start

### Windows
1. Download `FTP-Sync-Manager-Setup-*.exe`
2. Run installer
3. Launch FTP Sync Manager

### Linux
1. Download `FTP-Sync-Manager-*.AppImage`
2. Make executable: `chmod +x FTP-Sync-Manager-*.AppImage`
3. Run: `./FTP-Sync-Manager-*.AppImage`

### macOS
1. Download `FTP-Sync-Manager-*.dmg`
2. Open DMG and drag to Applications
3. Launch from Applications

## ⚡ Performance Tips

Để tăng tốc độ upload/download, tăng `parallel_connections`:

```sql
-- Xem config hiện tại
SELECT id, name, parallel_connections FROM ftp_connections;

-- Tăng lên 5 (khuyến nghị)
UPDATE ftp_connections SET parallel_connections = 5;

-- Hoặc tăng lên 10 (maximum)
UPDATE ftp_connections SET parallel_connections = 10;
```

Hoặc chạy script:
```bash
sqlite3 ftp_manager.sqlite < scripts/increase-parallel-connections.sql
```

**Kết quả:**
- Upload 100 files: từ 5 phút → 1 phút (5x nhanh hơn)
- Download folder: từ 10 phút → 2 phút (5x nhanh hơn)

Xem chi tiết: [VISUAL_DIFF_IMPROVEMENTS.md](./VISUAL_DIFF_IMPROVEMENTS.md)

## 🛠️ Công nghệ sử dụng

### Frontend
- **React 18** - UI Library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool & Dev server
- **TailwindCSS** - Styling
- **Zustand** - State management
- **Lucide React** - Icons
- **Recharts** - Charts & Statistics

### Backend
- **Express.js** - API Server
- **SQLite** - Database
- **basic-ftp** - FTP Client library
- **chokidar** - File system watcher

### Desktop
- **Electron** - Desktop application framework

## 📦 Cài đặt

### Yêu cầu
- Node.js >= 18.x
- npm hoặc yarn

### Các bước cài đặt

1. Clone repository:
```bash
git clone <repository-url>
cd ftp_sync
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Chạy development:
```bash
# Chạy cả frontend và backend
npm run dev

# Hoặc chạy riêng lẻ
npm run client:dev  # Frontend
npm run server:dev  # Backend
```

## 🚀 Scripts

| Script | Mô tả |
|--------|-------|
| `npm run dev` | Chạy cả frontend và backend trong development mode |
| `npm run client:dev` | Chạy frontend development server (Vite) |
| `npm run server:dev` | Chạy backend với nodemon (auto-reload) |
| `npm run build` | Build frontend production |
| `npm run build:server` | Build backend TypeScript |
| `npm run dist` | Build và đóng gói Electron app |
| `npm run lint` | Kiểm tra linting với ESLint |
| `npm run check` | Kiểm tra TypeScript types |

## 📁 Cấu trúc thư mục

```
ftp_sync/
├── api/                    # Backend API
│   ├── routes/            # API routes
│   │   ├── auth.ts        # Authentication
│   │   ├── files.ts       # File operations
│   │   ├── ftp.ts         # FTP operations
│   │   ├── reports.ts     # Statistics & Reports
│   │   ├── sync.ts        # Sync operations
│   │   └── system.ts      # System information
│   ├── services/          # Business logic
│   │   ├── LogStore.ts    # Log management
│   │   └── SyncService.ts # Core sync service
│   ├── utils/             # Utilities
│   ├── app.ts             # Express app setup
│   ├── db.ts              # SQLite database
│   └── server.ts          # Server entry point
├── src/                   # Frontend source
│   ├── components/        # React components
│   │   ├── FTPConnectionForm.tsx
│   │   ├── FTPConnectionList.tsx
│   │   ├── FileManager.tsx
│   │   ├── LocalFolderBrowser.tsx
│   │   ├── StatisticsModal.tsx
│   │   └── UploadProgressBar.tsx
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities
│   ├── types/             # TypeScript types
│   ├── App.tsx            # Main App component
│   └── main.tsx           # Entry point
├── electron/              # Electron main process
├── build/                 # Build assets
├── dist/                  # Frontend build output
├── dist-server/           # Backend build output
└── release_v3/            # Electron app releases
```

## ⚙️ Cấu hình

### Database
Ứng dụng sử dụng SQLite để lưu trữ:
- Thông tin kết nối FTP (mật khẩu được mã hóa)
- Lịch sử sync
- Thống kê truyền file

### Sync Options
- **Parallel Connections**: 1-10 kết nối đồng thời
- **Watch Mode**: Theo dõi thay đổi realtime
- **Interval Sync**: Đồng bộ theo khoảng thời gian

## 🔐 Bảo mật

- Mật khẩu FTP được mã hóa trước khi lưu vào database
- Dữ liệu được lưu trữ local trên máy người dùng
- Không gửi thông tin lên cloud

## 📝 License

Private - All rights reserved.

## 👨‍💻 Tác giả

Developed with ❤️
