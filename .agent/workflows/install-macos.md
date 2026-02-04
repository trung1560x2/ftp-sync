---
description: Hướng dẫn cài đặt FTP Sync Manager trên macOS
---

# Cài đặt FTP Sync Manager trên macOS

## Yêu cầu hệ thống
- macOS 10.15 (Catalina) trở lên
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git
- Xcode Command Line Tools

## Bước 1: Cài đặt Xcode Command Line Tools
// turbo
```bash
xcode-select --install
```

## Bước 2: Cài đặt Homebrew (nếu chưa có)
// turbo
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## Bước 3: Cài đặt Node.js
// turbo
```bash
brew install node
```

Hoặc sử dụng nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.zshrc
nvm install 18
nvm use 18
```

Kiểm tra version:
```bash
node --version
npm --version
```

## Bước 4: Clone repository
```bash
git clone https://github.com/trung1560x2/ftp-sync.git
cd ftp-sync
```

## Bước 5: Cài đặt dependencies
// turbo
```bash
npm install
```

## Bước 6: Build ứng dụng
// turbo
```bash
npm run build
npm run build:server
```

## Bước 7: Chạy ở chế độ Development
// turbo
```bash
npm run dev
```

## Bước 8: Build Electron App (Production)
// turbo
```bash
npm run dist
```

Sau khi build xong, file `.dmg` sẽ được tạo trong thư mục `release_v4/`.

## Bước 9: Cài đặt ứng dụng
1. Mở file `FTP Sync Manager-x.x.x.dmg` trong thư mục `release_v4/`
2. Kéo ứng dụng vào thư mục Applications
3. Mở ứng dụng từ Applications

## Xử lý lỗi thường gặp

### Lỗi "App can't be opened because it is from an unidentified developer"
```bash
xattr -cr "/Applications/FTP Sync Manager.app"
```

Hoặc: System Preferences > Security & Privacy > General > "Open Anyway"

### Lỗi sqlite3 build
```bash
npm rebuild sqlite3
```

### Lỗi Electron signing (khi build)
```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist
```
