# OmniSync — Roadmap Nâng Cấp

> Tài liệu kế hoạch nâng cấp phần mềm từ trạng thái hiện tại (v1.0.6 / UI hiển thị v4.0.0) lên một phiên bản production-grade, bảo trì được và mở rộng được.
>
> Cập nhật: 2026-07-12 · Dựa trên audit toàn bộ codebase (Electron + React 18 + Express + SQLite + Rust scanner)

---

## Mục lục
1. [Tóm tắt tình trạng hiện tại](#1-tóm-tắt-tình-trạng-hiện-tại)
2. [Nguyên tắc áp dụng](#2-nguyên-tắc-ap-dụng)
3. [Phase 0 — Dọn dẹp & Vệ sinh (1–2 ngày)](#phase-0--don-dep--ve-sinh-12-ngày)
4. [Phase 1 — Kiên cố nền tảng (3–5 ngày)](#phase-1--kien-co-nen-tang-35-ngày)
5. [Phase 2 — Bảo mật (3–4 ngày)](#phase-2--bao-mat-34-ngày)
6. [Phase 3 — Refactor kiến trúc (5–8 ngày)](#phase-3--refactor-kien-trúc-58-ngày)
7. [Phase 4 — Tính năng mới (linh hoạt)](#phase-4--tinh-năng-moi-linh-hoat)
8. [Phase 5 — UX & Performance Polish (2–3 ngày)](#phase-5--ux--performance-polish-23-ngày)
9. [Thứ tự ưu tiên & Lịch trình đề xuất](#9-thu-tu-ưu-tiên--lich-trinh-de-xuat)
10. [KPI Thành công](#10-kpi-thanh-cong)

---

## 1. Tóm tắt tình trạng hiện tại

### Điểm mạnh
- Feature-rich: multi-protocol (FTP/FTPS/SFTP), connection pooling, realtime sync, Visual Diff, Content Diff/Merge, file versioning, atomic deployment, SSH terminal (xterm.js), AI Copilot (Gemini), thống kê + heatmap, backup/export mã hóa.
- Hiệu năng tốt: Rust scanner cho index local, PQueue parallel transfers, resume transfer khi crash.
- Electron config bảo mật (`nodeIntegration: false`, `contextIsolation: true`).

### Vấn đề nghiêm trọng (audit phát hiện)
| # | Vấn đề | Bằng chứng |
|---|---|---|
| C1 | **Không có auth** — mọi endpoint bẻ khóa được bởi bất kỳ process local nào | `api/routes/auth.ts:14,22,30` — cả 3 endpoint đều `TODO: Implement` stub |
| C2 | **Tính năng cốt lõi chưa commit** — terminal, SSH, WebSocket, OverviewDashboard đang là untracked files | `git status`: `?? api/routes/terminal.ts`, `?? api/services/SSHTerminalService.ts`, `?? api/services/WebSocketService.ts`, `?? src/components/terminal/`, `?? src/pages/OverviewDashboard.tsx` |
| C3 | **Build artifacts Rust bị track trong git** (12 file `.exe/.pdb/.fingerprint`) | `git ls-files api/scanner/target` → 12 file |
| C4 | **867 lỗi lint + 59 warning** (chủ yếu `no-explicit-any`) | `npm run lint` |
| C5 | **`tsconfig.json` đặt `strict: false`** — không có type safety | `tsconfig.json` |
| C6 | **Không có test framework** — 0 test, CI không chạy test/lint | `package.json` devDependencies, `.github/workflows/build.yml` |
| C7 | **Persistence kép**: `LogStore` ghi JSON file, nhưng `sync_logs`/`transfer_stats` table trong SQLite không được dùng → 2 hệ thống song song cho cùng logic data | `api/services/LogStore.ts` vs `api/db.ts` |
| C8 | **Migration thủ công**: 22 block `ALTER TABLE ... try/catch` không version, không rollback, silent fail | `api/db.ts:138-220` |
| C9 | **God files**: `SyncService.ts` 2310 dòng / `VisualDiffModal.tsx` 1412 dòng | `api/services/SyncService.ts`, `src/components/VisualDiffModal.tsx` |
| C10 | **Logic diff scan trùng 3 nơi**: `files.ts`, `diff.worker.ts` (không dùng), `SyncService` — cùng `IGNORED_FOLDERS`, `scanRemote`, `scanLocal` | `api/routes/files.ts:60,110-338`, `api/workers/diff.worker.ts:40,55-129` |
| C11 | **Zustand có trong deps nhưng không dùng** — state toàn là `useState` + prop drilling + fetch lại nhiều nơi | grep `create<`/`useStore` trong `src/` → 0 match |
| C12 | **Dead code**: `port_forwards` table (tạo nhưng không route nào dùng), `connectClient` stub rỗng, `processDeleteQueue` deprecated, `useTheme` hook không dùng, `diff.worker.ts` không import | `api/db.ts`, `api/routes/files.ts:469`, `api/services/SyncService.ts:1565`, `src/hooks/useTheme.ts` |
| C13 | **13 debug script ở root** + **10 file trong `scratch/`** làm rối workspace | `check_*.js`, `debug_*.js`, `scratch/test_*.js` |
| C14 | **Version inconsistent**: `package.json` 1.0.6, UI hiển thị "v4.0.0", README "v1.0.1", CI template v1.0.2 |多处 |
| C15 | **Error middleware nuốt lỗi** — không log/error, trả generic message | `api/app.ts:73` |
| C16 | **`encryption.ts` decrypt silent fail** — trả `''` khi lỗi, làm lỗi lan tỏa thành "Cannot decrypt password" ở nơi khác | `api/utils/encryption.ts` |

---

## 2. Nguyên tắc áp dụng

- **Mỗi Phase độc lập, có thể ship riêng** — không big-bang.
- **Tư duy "boy scout rule"**: để codebase sạch hơn khi rời.
- **Tránh rewrites tổng quát** — refactor theo file cụ thể, giữ behavior.
- **Mọi thay đổi có test + CI verify** từ Phase 1 trở đi.
- **Không commit secrets** (`.encryption_key`, `.env`, DB file) — đã có trong `.gitignore` nhưng cần rà lại.

---

## Phase 0 — Dọn dẹp & Vệ sinh (1–2 ngày)
> Mục tiêu: làm sạch repo để các phase sau không bị noise, đảm bảo tính năng hiện có không bị mất.

### 0.1 Commit các tính năng chưa track (CRITICAL — làm đầu tiên)
- [ ] Review & commit: `api/routes/terminal.ts`, `api/services/SSHTerminalService.ts`, `api/services/WebSocketService.ts`, `src/components/terminal/`, `src/components/FTPConnectionDetailPanel.tsx`, `src/pages/OverviewDashboard.tsx`
- [ ] Kiểm tra không có secret/hardcode password trong các file này trước khi commit
- [ ] Đặt lại `useTheme.ts` nếu thực sự không dùng, hoặc giữ lại cho Phase 5 (dark/light toggle)

### 0.2 Untrack build artifacts & runtime files
- [ ] `git rm -r --cached api/scanner/target/` — bỏ 12 file Rust build
- [ ] Thêm vào `.gitignore`: `api/scanner/target/`, `bin/local_scanner(.exe)` (binary build output)
- [ ] `git rm --cached ftp_manager.sqlite*` (nếu bị track — hiện đang modified)
- [ ] Xóa hoặc move vào `scripts/debug/` (archive): 13 file `check_*.js`, `debug_*.js`, `config_debug.txt`, `deploy_debug.bat`, `inspect_db.js`, `measure_db.js`, `verify_*.js` ở root + 10 file trong `scratch/`
- [ ] Loại `Backup_sync/`, `sync_data/`, `sync_folder/`, `release_v4/` khỏi workspace tracking nếu bị

### 0.3 Thống nhất version
- [ ] Chọn 1 nguồn sự thật cho version (đề xuất: `package.json` = `1.1.0` cho bản upgrade)
- [ ] `src/App.tsx:36` đọc version từ `package.json` thay vì hardcode "v4.0.0"
- [ ] Cập nhật README badge + CHANGELOG khớp

### 0.4 Sửa quick wins
- [ ] `api/app.ts:73` error middleware: log error + trả message an toàn (không leak stack ở production)
- [ ] Xóa `TransferClient.ts` duplicate `ensureDir` (line 29-30)
- [ ] Xóa `connectClient` stub rỗng (`files.ts:469-471`) và dead variable `let client` (`files.ts:482`)
- [ ] Gỡ comment "DEBUG: Log config" (`SyncService.ts:174`)

**Definition of Done Phase 0:** `git status` clean, `npm run lint` giảm xuống < 800 (chỉ từ việc xóa dead code), không có tính năng nào bị mất, version đồng nhất.

---

## Phase 1 — Kiên cố nền tảng (3–5 ngày)
> Mục tiêu: có safety net (test + CI + strict types + migration system) trước khi đụng đến logic.

### 1.1 Thiết lập test framework
- [ ] Cài `vitest` + `@vitest/coverage-v8` (đã có vite, zero-config)
- [ ] Tạo `vitest.config.ts` (env `node` cho backend, alias `@/*`)
- [ ] Thêm scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`
- [ ] Viết test ưu tiên cho:
  - `api/utils/encryption.ts` (encrypt/decrypt roundtrip, wrong key, PBKDF2 backup export)
  - `api/services/LogStore.ts` (cap 1000 logs, daily stats, heatmap aggregation)
  - `api/services/IgnoreService.ts` (pattern matching, cache reload)
  - `api/services/SyncService.ts` conflict resolution logic (tách ra pure function để test — xem Phase 3.1)
  - `api/routes/ftp.ts` test connection + CRUD (supertest + in-memory sqlite)
- [ ] Target coverage ≥ 60% cho `api/` sau phase này

### 1.2 Bật strict TypeScript
- [ ] `tsconfig.json`: `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"forceConsistentCasingInFileNames": true`
- [ ] `tsconfig.server.json`: tương tự + `"strict": true`
- [ ] Fix dần theo từng file (không fix tất cả 1 lúc) — chia commit theo module: `api/services`, `api/routes`, `src/components`, `src/pages`
- [ ] Giảm `no-explicit-any` errors: thay `any` bằng `unknown` + type guard, hoặc định nghĩa interface trong `src/types/` (xem 3.5)

### 1.3 Hệ thống migration có version
- [ ] Tạo table `schema_version (version INTEGER PRIMARY KEY, applied_at TEXT)`
- [ ] Folder `api/migrations/` chứa `NN_description.sql` (bắt đầu từ `001_init.sql` tổng hợp schema hiện tại)
- [ ] `api/db.ts`: hàm `runMigrations()` chạy tuần tự các file chưa apply, trong transaction, có rollback
- [ ] Quy ước: migration chỉ thêm, không sửa/xóa cột cũ ( Forward-only). Cột cũ muốn bỏ thì đánh dấu deprecated, xóa ở major version sau.
- [ ] Chuyển 22 block `ALTER TABLE` hiện tại thành `001_baseline.sql` + đánh dấu baseline version

### 1.4 CI/CD bổ sung test + lint
- [ ] `.github/workflows/ci.yml` (mới, chạy trên PR + push): `npm ci`, `npm run lint`, `npm run check`, `npm test`
- [ ] Workflow `build.yml` hiện tại thêm `needs: ci` để không build nếu CI fail
- [ ] Thêm `npm run lint` vào `pre-commit` (qua `lint-staged` + `husky`) — tùy chọn nếu team OK

### 1.5 Cấu trúc thư mục chuẩn
- [ ] Tách `api/` và `src/` thành 2 project tsconfig độc lập (đã có `tsconfig.server.json`, chỉ cần clean up include)
- [ ] Root chỉ giữ: `api/`, `src/`, `electron/`, `scripts/`, `bin/`, `build/`, `public/`, config files, `README.md`, `CHANGELOG.md`, `ROADMAP.md`
- [ ] Move `check_db.js` (nếu cần giữ) → `scripts/`

**Definition of Done Phase 1:** `npm test` pass, CI chạy lint+check+test, `tsc --noEmit` không lỗi, `npm run lint` < 50 errors.

---

## Phase 2 — Bảo mật (3–4 ngày)
> Mục tiêu: khóa API local, xử lý secret đúng cách.

### 2.1 Implement auth thực sự (thay C1)
Vì app chạy local trong Electron (bound `127.0.0.1`), auth nhẹ đủ — không cần JWT/OAuth heavy:
- [ ] Tạo table `users (id, username, password_hash, salt, created_at)` + `sessions (token, user_id, expires_at)`
- [ ] Implement `auth.ts`: `register` (hash bằng `argon2` hoặc `scrypt`), `login` (verify + tạo random token), `logout` (xóa session)
- [ ] Middleware `requireAuth` check header `Authorization: Bearer <token>` hoặc cookie, áp cho mọi route trừ `/api/auth/*` và `/api/health`
- [ ] Lần đầu chạy: onboarding wizard đặt mật khẩu master (giống Bitwarden local vault)
- [ ] Frontend: login page + lưu token trong `localStorage`, attach vào mọi `fetch` (dùng axios interceptor hoặc wrapper `apiClient`)
- [ ] Test: brute-force rate limit (5 lần/sai → khoá 30s), session expiry

### 2.2 Cải thiện encryption (thay C16)
- [ ] `encryption.ts`: `decrypt` throw error rõ ràng thay vì trả `''`; caller xử lý bằng try/catch + thông báo user
- [ ] Rotating key: thêm `key_version` cột cho `ftp_connections`, support nhiều key version để rotate được
- [ ] Backup export: dùng `argon2id` thay PBKDF2 (nâng iterations), verify checksum của file export
- [ ] Document flow tạo/lưu `.encryption_key` — hiện tự sinh 32-char hex, cần hướng dẫn backup

### 2.3 Hardening Electron
- [ ] Validate `Content-Security-Policy` header cho renderer (hiện không có)
- [ ] `electron/main.js`: thêm `will-navigate` handler chặn navigation ra ngoài (anti-iframe phishing)
- [ ] Cập nhật Electron lên LTS mới nhất (hiện 40, kiểm tra CVE)
- [ ] Code-signing cho release builds (ít nhất Windows + macOS) — cần cert

**Definition of Done Phase 2:** Mọi API cần token hợp lệ, brute-force bị block, decrypt error có traceback, CSP header set, Electron up-to-date.

---

## Phase 3 — Refactor kiến trúc (5–8 ngày)
> Mục tiêu: file lớn → module nhỏ, state tập trung, bỏ trùng lặp.

### 3.1 Tách `SyncService.ts` (2310 dòng)
Chia thành các module trong `api/services/sync/`:
- [ ] `ConnectionPool.ts` — `acquireClient`/`releaseClient`, pre-warming, health check, idle timeout
- [ ] `ProgressTracker.ts` — sliding-window speed, ETA, emit progress event
- [ ] `SessionTracker.ts` — sessionization, backup file versioning, interrupted recovery
- [ ] `LocalIndexer.ts` — Rust scanner wrapper + JS fallback + `local_file_cache` sync
- [ ] `ConflictResolver.ts` — pure function: `(localMeta, remoteMeta, policy) => action` (dễ test)
- [ ] `SyncSession.ts` — orchestrator mỏng, compose các module trên
- [ ] `SyncManager.ts` giữ EventEmitter + map connectionId → SyncSession
- [ ] Test mỗi module riêng (Phase 1.1 đã có vitest)

### 3.2 Tách `VisualDiffModal.tsx` (1412 dòng)
Chia thành `src/components/visual-diff/`:
- [ ] `VisualDiffModal.tsx` — container mỏng (layout + state composition)
- [ ] `DiffFileList.tsx` — virtualized list (react-window)
- [ ] `DiffFileRow.tsx` — row + status icon
- [ ] `BulkActionBar.tsx` — upload/download/clear selection
- [ ] `AICopilotPanel.tsx` — Gemini integration (tách hẳn, dùng store cho settings)
- [ ] `DiffLogsDrawer.tsx` — logs panel
- [ ] `useDiffData.ts` — hook fetch + scan + polling

### 3.3 Tách `FTPConnectionForm.tsx` (43KB)
- [ ] Chia theo section: `BasicFields`, `AdvancedFields`, `SyncSettings`, `SSHSettings`, `IgnorePatternsEditor`
- [ ] Mỗi section là component con nhận props từ form library

### 3.4 Khai thác `zustand` (thay C11)
Tạo stores trong `src/stores/`:
- [ ] `connectionsStore.ts` — list connections, CRUD, cache, invalidate → thay fetch nhiều nơi
- [ ] `authStore.ts` — token, user, login/logout
- [ ] `terminalStore.ts` — sessions, tabs (hiện trong `TerminalView` local state)
- [ ] `aiSettingsStore.ts` — Gemini key/model/auto-analyze (hiện trong localStorage rải rác)
- [ ] `themeStore.ts` — nếu giữ dark/light toggle (Phase 5)
- [ ] Wrap `fetch` trong `apiClient` attach token + handle 401 → logout

### 3.5 Deduplicate logic scan diff (thay C10)
- [ ] Tạo `api/services/DiffScanner.ts` — single source of truth cho `IGNORED_FOLDERS`, `MAX_DEPTH`, `scanLocal`, `scanRemote`, `compareMeta`
- [ ] `files.ts`, `SyncService`, `diff.worker.ts` đều gọi module này
- [ ] Quyết định: xóa `diff.worker.ts` (không dùng) HOẶC thực sự integrate worker thread để scan không block main (nên后者 cho large dirs)
- [ ] Deduplicate `getLocalRoot`, `getFtpClient`, `normalizePath` → `api/utils/paths.ts`, `api/utils/transfer.ts`

### 3.6 Gộp persistence (thay C7)
- [ ] Quyết định: **giữ SQLite cho logs/stats/sessions**, bỏ JSON files (`sync_logs.json`, `transfer_stats.json`, `sync_sessions.json`)
- [ ] `LogStore.ts` → `LogRepository.ts` dùng SQLite prepared statements (index đã có sẵn)
- [ ] Migration: import JSON cũ sang SQLite 1 lần (script `scripts/migrate_logs_to_sqlite.js`)
- [ ] Lợi: query được (heatmap, stats), atomic, không parse JSON lặp, backup theo DB

### 3.7 Xóa dead code (thay C12)
- [ ] Xóa `port_forwards` table + migration (không route dùng) — HOẶC implement nếu có kế hoạch port forwarding
- [ ] Xóa `diff.worker.ts` nếu không dùng (sau 3.5)
- [ ] Xóa `useTheme.ts` nếu không giữ dark/light (hoặc kích hoạt Phase 5)
- [ ] Xóa `ConflictResolverModal.tsx` nếu conflict resolution đã là server-side config
- [ ] Xóa `processDeleteQueue` deprecated, gỡ comment `suspendSync`/`resumeSync` (implement hoặc xóa hẳn)

**Definition of Done Phase 3:** Không file nào > 800 dòng, mỗi module có test, không trùng logic, state tập trung, JSON persistence bị bỏ.

---

## Phase 4 — Tính năng mới (linh hoạt)
> Chọn theo nhu cầu, mỗi feature là 1 PR riêng, có test.

### 4.1 Auto-update (Electron)
- [ ] `electron-updater` + GitHub releases private/public
- [ ] Check update on startup, notify user, download + install on quit
- [ ] Release signing (pair với Phase 2.3)

### 4.2 Multi-language (i18n)
- [ ] `react-i18next` + namespace: `common`, `connections`, `terminal`, `diff`, `settings`
- [ ] File `vi.json`, `en.json` — hiện UI trộn Việt/Anh (vd `ai.ts` prompt Việt, error message Anh)
- [ ] Language switcher trong settings

### 4.3 Scheduled sync (cron)
- [ ] Thêm `sync_schedule` (cron expression) cho connection
- [ ] Backend: `node-cron` hoặc lib nhẹ, mỗi connection 1 task
- [ ] UI: cron editor (react-cron-picker) + next-run preview
- [ ] Hiện chỉ có "interval polling 60s" — cần explicit schedule

### 4.4 WebDAV / S3 backend
- [ ] Mở rộng `TransferClient` interface → `WebdavClientAdapter`, `S3ClientAdapter`
- [ ] `TransferClientFactory.createClient('webdav'|'s3')`
- [ ] UI: chọn protocol trong form

### 4.5 Two-way sync conflict UI
- [ ] Khi phát hiện conflict (cả local & remote đổi sau last sync), hiện modal chọn version thay vì auto-resolve
- [ ] 3-way merge với Monaco diff editor
- [ ] Lưu quyết định user + apply

### 4.6 Activity log filter & export
- [ ] Filter log theo connection/type/date/range
- [ ] Export CSV/JSON
- [ ] Search full-text (FTS5 trong SQLite)

### 4.7 Health dashboard
- [ ] Tổng quan: connection status, last sync success/fail, disk usage local, quota remote
- [ ] Alert khi sync fail N lần liên tiếp (toast + tray notification)

### 4.8 Plugin/Script hook
- [ ] Pre/post sync hook: chạy command local hoặc remote script trước/sau sync
- [ ] Webhook notification (Discord/Slack/Telegram) khi sync hoàn thành/fail

### 4.9 macOS keychain / Windows credential store
- [ ] Lưu password FTP trong OS keystore thay vì DB (even encrypted) — tùy chọn nâng cao

### 4.10 MFA / 2FA cho app local
- [ ] TOTP cho master login (pair Phase 2.1) — optional security

**Definition of Done Phase 4:** Mỗi feature có test, docs, CHANGELOG entry, version bump patch/minor.

---

## Phase 5 — UX & Performance Polish (2–3 ngày)
> Mục tiêu: trải nghiệm mượt hơn, nhanh hơn.

### 5.1 Dark/Light theme thực sự
- [ ] Kích hoạt `useTheme.ts` + `themeStore` (Phase 3.4)
- [ ] Tailwind `dark:` variant + toggle trong settings
- [ ] Hiện hardcoded HUD dark — tách thành theme tokens

### 5.2 Lazy load routes
- [ ] `React.lazy` + `Suspense` cho `TerminalView`, `OverviewDashboard`, `ConnectionManager`
- [ ] Giảm bundle init (hiện cả 3 page mount eager do giữ terminal session — thay bằng giữ session ở store, không cần giữ DOM)

### 5.3 Code-splitting Monaco
- [ ] Monaco hiện copy thủ công (`scripts/copy-monaco.js`) — chuyển sang `@monaco-editor/react` lazy load
- [ ] Giảm bundle size

### 5.4 Perf: Visual Diff large dirs
- [ ] Worker thread scan (sau 3.5) — không block UI
- [ ] Virtualized list đã có, thêm `itemSize` cache
- [ ] Progress cho scan (hiện spinner vô tận)

### 5.5 Accessibility (a11y)
- [ ] Keyboard navigation cho file list, terminal tabs
- [ ] `aria-label` cho icon-only buttons
- [ ] Focus trap trong modal

### 5.6 Onboarding tour
- [ ] First-run guide: tạo connection đầu tiên, test sync, xem diff
- [ ] Tooltip contextual

### 5.7 Empty states & error UI
- [ ] Empty state cho: 0 connections, 0 logs, diff không có file
- [ ] Error boundary cho React + error toast nhất quán

### 5.8 Settings page tập trung
- [ ] Gom: AI settings (Gemini key/model), theme, language, parallel default, buffer size, log retention
- [ ] Hiện rải rác trong từng component

**Definition of Done Phase 5:** Lighthouse score ≥ 90, cold start < 2s, no layout shift, keyboard-navigable.

---

## 9. Thứ tự ưu tiên & Lịch trình đề xuất

```
Tuần 1-2:  Phase 0 (dọn dẹp) + Phase 1 (foundation) — song song được 0.x và 1.x
Tuần 3:    Phase 2 (security) — cần 1.x xong
Tuần 4-5:  Phase 3 (refactor) — cần 1.x (test) + 2.x (auth) để verify
Tuần 6+:   Phase 4 (features) — pick theo nhu cầu
Linh hoat: Phase 5 (polish) — xen kẽ mỗi release
```

**Thứ tự bắt buộc:** Phase 0 → Phase 1 → Phase 2 → Phase 3 → (Phase 4 & 5 song song)

**Quick wins làm ngay (trong Phase 0, < 4h):**
1. Commit các file untracked (C2) — rủi ro mất code cao nhất
2. `git rm --cached api/scanner/target` + update `.gitignore` (C3)
3. Sửa `api/app.ts:73` error middleware (C15)
4. Xóa `TransferClient.ts` duplicate `ensureDir` + `files.ts` dead stub
5. `npm run lint -- --fix` (sửa 5 lỗi auto-fixable)

---

## 10. KPI Thành công

| Metric | Hiện tại | Mục tiêu sau Phase 3 |
|---|---|---|
| Lint errors | 867 | < 50 |
| Test coverage (api/) | 0% | ≥ 60% |
| File lớn nhất (dòng) | 2310 (SyncService) | < 800 |
| `tsc --noEmit` | pass (strict: false) | pass (strict: true) |
| CI steps | build only | lint + check + test + build |
| Auth endpoints | 3 stubs | 3 implemented + middleware |
| Persistence systems | 2 (SQLite + JSON) | 1 (SQLite) |
| Duplicate scan logic | 3 copies | 1 module |
| Build artifacts in git | 12 files | 0 |
| Untracked core files | ~10 | 0 (all committed) |
| Version sources | 4 inconsistent | 1 (package.json) |

---

## Ghi chú thực thi

- **Không commit除非 explicit request** — tuân theo nguyên tắc chỉ commit khi user yêu cầu.
- **Mỗi Phase = 1 branch + nhiều small commit** — dễ review, dễ rollback.
- **Update `CHANGELOG.md` mỗi release** theo Keep a Changelog format.
- **Update `ROADMAP.md` checkbox** khi hoàn thành item để track progress.
- **Sau mỗi Phase: chạy `npm run lint && npm run check && npm test`** trước khi claim done (evidence before assertions).

---

*Roadmap này là living document — cập nhật khi phát hiện issue mới hoặc thay đổi priority.*
