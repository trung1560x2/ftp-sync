---
description: Hướng dẫn cài đặt FTP Sync Manager trên Linux
---

# Cài đặt FTP Sync Manager trên Linux

## Yêu cầu hệ thống
- Ubuntu 20.04+ / Debian 10+ / Fedora 35+ / Arch Linux
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git
- build-essential (gcc, g++, make)

## Bước 1: Cài đặt build tools

### Ubuntu/Debian:
// turbo
```bash
sudo apt update
sudo apt install -y build-essential git curl
```

### Fedora:
```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install git curl
```

### Arch Linux:
```bash
sudo pacman -S base-devel git curl
```

## Bước 2: Cài đặt Node.js

### Sử dụng NodeSource (khuyến nghị):
// turbo
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Hoặc sử dụng nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

Kiểm tra version:
```bash
node --version
npm --version
```

## Bước 3: Clone repository
```bash
git clone https://github.com/trung1560x2/ftp-sync.git
cd ftp-sync
```

## Bước 4: Cài đặt dependencies
// turbo
```bash
npm install
```

## Bước 5: Build ứng dụng
// turbo
```bash
npm run build
npm run build:server
```

## Bước 6: Chạy ở chế độ Development
// turbo
```bash
npm run dev
```

## Bước 7: Build Electron App (Production)
// turbo
```bash
npm run dist
```

Sau khi build xong, file `.AppImage` sẽ được tạo trong thư mục `release_v4/`.

## Bước 8: Chạy AppImage

### Cấp quyền thực thi:
```bash
chmod +x release_v4/FTP\ Sync\ Manager-x.x.x.AppImage
```

### Chạy ứng dụng:
```bash
./release_v4/FTP\ Sync\ Manager-x.x.x.AppImage
```

## Xử lý lỗi thường gặp

### Lỗi FUSE (AppImage không chạy được)
```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs

# Arch
sudo pacman -S fuse2
```

### Lỗi sqlite3 build
```bash
sudo apt install libsqlite3-dev
npm rebuild sqlite3
```

### Lỗi Electron sandbox
```bash
./FTP\ Sync\ Manager-x.x.x.AppImage --no-sandbox
```
