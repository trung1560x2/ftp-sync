# FTP Sync Manager

Ứng dụng quản lý và đồng bộ hóa FTP mạnh mẽ được xây dựng với Electron, React và TypeScript.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-Private-red)

## 📋 Mô tả

FTP Sync Manager là một ứng dụng desktop cho phép bạn:
- Quản lý nhiều kết nối FTP cùng lúc
- Đồng bộ hóa file realtime giữa thư mục local và server FTP
- Upload/Download file với tốc độ cao thông qua kết nối song song
- Theo dõi tiến trình và thống kê chi tiết

## ✨ Tính năng chính

### 🔌 Quản lý kết nối FTP
- Lưu trữ nhiều profile kết nối FTP
- Mật khẩu được mã hóa an toàn
- Hỗ trợ FTP/FTPS

### 🔄 Đồng bộ hóa thông minh
- Theo dõi thay đổi file realtime với chokidar
- Upload tự động khi file thay đổi
- Xóa file trên server khi xóa local
- Hỗ trợ upload song song với nhiều kết nối đồng thời (1-10 connections)

### 📁 Quản lý file
- Duyệt file trên server FTP
- Upload/Download thủ công
- Xem tiến trình upload chi tiết với tốc độ và thời gian ước tính

### 📊 Thống kê & Báo cáo
- Theo dõi lượng data đã truyền
- Thống kê số file đã sync
- Log chi tiết các hoạt động

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
