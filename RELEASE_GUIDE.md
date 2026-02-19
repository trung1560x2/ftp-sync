# Release Guide - FTP Sync Manager

## Cách tạo release mới

### Option 1: Automatic Release (Khuyến nghị)

1. **Commit tất cả thay đổi:**
```bash
git add .
git commit -m "Release v1.0.2: Performance improvements"
```

2. **Tạo và push tag:**
```bash
git tag v1.0.2
git push origin v1.0.2
```

3. **GitHub Actions sẽ tự động:**
   - Build cho Windows, Linux, macOS
   - Tạo release với changelog
   - Upload các file installer

4. **Kiểm tra progress:**
   - Vào GitHub → Actions tab
   - Xem workflow "Build and Release"
   - Đợi ~10-15 phút để build xong

### Option 2: Manual Trigger

1. **Vào GitHub repository:**
   - Click tab "Actions"
   - Chọn workflow "Build and Release"
   - Click "Run workflow"
   - Nhập version (e.g., v1.0.2)
   - Click "Run workflow"

2. **Đợi build hoàn thành**

### Option 3: Local Build (Backup)

Nếu GitHub Actions gặp vấn đề:

```bash
# Build tất cả
npm run build
npm run build:server
npm run dist

# Hoặc build cho từng platform
npm run dist -- --win
npm run dist -- --linux
npm run dist -- --mac
```

Files sẽ được tạo trong folder `release_v4/`

## Version Numbering

Sử dụng Semantic Versioning: `vMAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (v2.0.0)
- **MINOR**: New features (v1.1.0)
- **PATCH**: Bug fixes (v1.0.1)

## Pre-Release Checklist

Trước khi release, đảm bảo:

- [ ] Tất cả tests pass
- [ ] Code đã được review
- [ ] VISUAL_DIFF_IMPROVEMENTS.md đã update
- [ ] README.md đã update (nếu cần)
- [ ] Version trong package.json đã tăng
- [ ] Changelog đã được chuẩn bị

## Update Version trong package.json

```bash
# Tăng patch version (1.0.0 → 1.0.1)
npm version patch

# Tăng minor version (1.0.0 → 1.1.0)
npm version minor

# Tăng major version (1.0.0 → 2.0.0)
npm version major
```

Lệnh này sẽ tự động:
- Update version trong package.json
- Tạo git commit
- Tạo git tag

Sau đó chỉ cần:
```bash
git push origin main --tags
```

## Troubleshooting

### Build fails trên macOS
- Cần macOS runner (GitHub Actions có sẵn)
- Hoặc build local trên Mac

### Build fails do native modules
```bash
npm run build
npm run build:server
npx electron-builder install-app-deps
npm run dist
```

### Release không tạo được
- Kiểm tra GITHUB_TOKEN permissions
- Đảm bảo tag đã được push: `git push origin v1.0.2`

## Post-Release

Sau khi release:

1. **Announce trên:**
   - GitHub Discussions
   - README.md (update download links)
   - Social media (nếu có)

2. **Monitor issues:**
   - Kiểm tra GitHub Issues
   - Trả lời user feedback

3. **Plan next release:**
   - Tạo milestone cho version tiếp theo
   - Prioritize features/bugs

## GitHub Actions Workflow

Workflow tự động:
1. Trigger khi push tag `v*`
2. Build parallel trên 3 platforms
3. Upload artifacts
4. Tạo GitHub Release
5. Attach installers vào release

Xem chi tiết: `.github/workflows/build.yml`

## Support

Nếu gặp vấn đề khi release:
1. Check GitHub Actions logs
2. Xem Issues tab
3. Contact maintainer
