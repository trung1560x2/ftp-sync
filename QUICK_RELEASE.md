# Quick Release Guide

## 🚀 Release trong 3 bước

### Bước 1: Chuẩn bị
```bash
# Đảm bảo code đã commit hết
git status

# Update CHANGELOG.md với các thay đổi mới
# Update version trong package.json nếu cần
```

### Bước 2: Tạo release

**Option A - Automatic (Khuyến nghị):**
```bash
# Windows
scripts\release.bat patch

# Linux/Mac
chmod +x scripts/release.sh
./scripts/release.sh patch
```

**Option B - Manual:**
```bash
# Bump version
npm version patch  # hoặc minor, major

# Push với tags
git push origin main --tags
```

### Bước 3: Đợi GitHub Actions
1. Vào https://github.com/trung1560x2/ftp-sync/actions
2. Xem workflow "Build and Release"
3. Đợi ~10-15 phút
4. Check releases: https://github.com/trung1560x2/ftp-sync/releases

## 📦 Kết quả

Sau khi build xong, bạn sẽ có:
- ✅ Windows: `FTP-Sync-Manager-Setup-1.0.X.exe`
- ✅ Linux: `FTP-Sync-Manager-1.0.X.AppImage`
- ✅ macOS: `FTP-Sync-Manager-1.0.X.dmg`

## 🔧 Troubleshooting

**Build fails?**
```bash
# Check logs tại GitHub Actions
# Hoặc build local:
npm run build
npm run build:server
npm run dist
```

**Tag đã tồn tại?**
```bash
# Xóa tag local và remote
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1

# Tạo lại
git tag v1.0.1
git push origin v1.0.1
```

## 📝 Version Types

- `patch`: Bug fixes (1.0.0 → 1.0.1)
- `minor`: New features (1.0.0 → 1.1.0)
- `major`: Breaking changes (1.0.0 → 2.0.0)

## 🎯 Checklist

Trước khi release:
- [ ] All tests pass
- [ ] CHANGELOG.md updated
- [ ] README.md updated (if needed)
- [ ] Version bumped in package.json
- [ ] Git working directory clean
- [ ] On main branch

## 🌐 Links

- Repository: https://github.com/trung1560x2/ftp-sync
- Actions: https://github.com/trung1560x2/ftp-sync/actions
- Releases: https://github.com/trung1560x2/ftp-sync/releases
