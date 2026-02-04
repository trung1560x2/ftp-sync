---
description: Hướng dẫn cài đặt FTP Sync Manager trên Windows
---

# Cài đặt FTP Sync Manager trên Windows

## Yêu cầu hệ thống
- Windows 10/11 (64-bit)
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

## Bước 1: Cài đặt Node.js
1. Tải Node.js từ https://nodejs.org/
2. Cài đặt và khởi động lại terminal sau khi cài xong
3. Kiểm tra version:
```powershell
node --version
npm --version
```

## Bước 2: Clone repository
```powershell
git clone https://github.com/trung1560x2/ftp-sync.git
cd ftp-sync
```

## Bước 3: Cài đặt dependencies
// turbo
```powershell
npm install
```

## Bước 4: Build ứng dụng
// turbo
```powershell
npm run build
npm run build:server
```

## Bước 5: Chạy ở chế độ Development
// turbo
```powershell
npm run dev
```

## Bước 6: Build Electron App (Production)
// turbo
```powershell
npm run dist
```

Sau khi build xong, file installer `.exe` sẽ được tạo trong thư mục `release_v4/`.

## Bước 7: Cài đặt ứng dụng
1. Mở thư mục `release_v4/`
2. Chạy file `FTP Sync Manager Setup x.x.x.exe`
3. Làm theo hướng dẫn cài đặt

## Xử lý lỗi thường gặp

### Lỗi node-gyp/sqlite3
```powershell
npm install --global windows-build-tools
npm rebuild sqlite3
```

### Lỗi Electron không build được
```powershell
npm cache clean --force
npm install
```

### Lỗi permission
Chạy PowerShell với quyền Administrator.
