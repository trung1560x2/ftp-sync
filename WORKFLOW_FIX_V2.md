# ✅ Workflow Fix V2 - Cross-Platform Shell

## 🐛 Lỗi lần 2:

```
A parameter cannot be found that matches parameter name 'la'.
Error: Process completed with exit code 1.
```

### Nguyên nhân:
- Windows runner sử dụng PowerShell mặc định
- Lệnh `ls -la` là bash command, không hoạt động trên PowerShell
- Cần chỉ định `shell: bash` để đảm bảo tương thích

### Giải pháp:
```yaml
- name: List Release Files (Debug)
  shell: bash  # ← Thêm dòng này!
  run: |
    echo "Contents of release_v4:"
    ls -la release_v4/ || echo "release_v4 directory not found"
```

## ✅ Đã fix:

1. Thêm `shell: bash` cho debug step
2. Upload `release_v4/` thay vì `release_v4/*` (tránh wildcard issues)

## 🧪 Test lại:

### Option 1: Manual Trigger
1. Vào: https://github.com/trung1560x2/ftp-sync/actions
2. Click "Build and Release"
3. Click "Run workflow"
4. Nhập: `v1.0.6`
5. Click "Run workflow"

### Option 2: Push tag
```bash
git tag v1.0.6 -m "Test workflow with shell fix"
git push origin v1.0.6
```

## 📊 Workflow flow:

```
Build Windows ✅
  ├─ Setup
  ├─ Install deps
  ├─ Build frontend/backend
  ├─ Build Electron
  ├─ Upload artifacts
  └─ List files (bash) ✅ FIXED

Build Linux ✅
Build macOS ✅

Create Release ✅
  ├─ Download artifacts
  ├─ Show structure
  ├─ Prepare files
  └─ Create release
```

## 🚀 Ready!

Workflow đã được fix để tương thích với cả 3 platforms. Test ngay!
