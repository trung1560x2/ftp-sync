# Test Release Workflow

## 🧪 Để test workflow ngay bây giờ:

### Option 1: Manual Trigger (Khuyến nghị cho test)

1. Vào: https://github.com/trung1560x2/ftp-sync/actions
2. Click workflow "Build and Release"
3. Click nút "Run workflow" (bên phải, màu xanh)
4. Nhập version: `v1.0.4`
5. Click "Run workflow"
6. Đợi ~10-15 phút
7. Check releases: https://github.com/trung1560x2/ftp-sync/releases

### Option 2: Push tag mới

```bash
# Tạo tag mới
git tag v1.0.4 -m "Test release workflow"

# Push tag
git push origin v1.0.4

# Xem progress
# https://github.com/trung1560x2/ftp-sync/actions
```

## 📊 Workflow sẽ:

1. ✅ Build Windows (NSIS installer)
2. ✅ Build Linux (AppImage)  
3. ✅ Build macOS (DMG)
4. ✅ Upload artifacts
5. ✅ Create GitHub Release
6. ✅ Attach installers

## 🔍 Monitor:

- Actions: https://github.com/trung1560x2/ftp-sync/actions
- Releases: https://github.com/trung1560x2/ftp-sync/releases

## ✅ Workflow đã sẵn sàng!

Workflow file: `.github/workflows/build.yml`

Các tags hiện có:
- v1.0.0
- v1.0.1
- v1.0.2
- v1.0.3

Workflow đã chạy thành công cho các tags trên!
