# OmniSync — ROADMAP 2: Tính Năng Mới

> Tài liệu companion với `ROADMAP.md` (Phase 0–5 về cleanup/security/refactor). File này tập trung **chỉ về tính năng mới** để mở rộng sản phẩm, không lặp lại phần dọn dẹp/khắc cố.
>
> Cập nhật: 2026-07-12 · Phiên bản mục tiêu: v2.0 sau khi ROADMAP Phase 1–3 hoàn tất
>
> **Lưu ý phụ thuộc:** Hầu hết features cần `ROADMAP.md` Phase 1 (test + strict TS + migration) xong trước. Một số cần Phase 2 (auth) hoặc Phase 3 (refactor + zustand + gộp persistence). Mỗi feature sẽ ghi rõ `Depends:`.

---

## Mục lục
1. [Cách đọc tài liệu này](#1-cách-đọc-tài-liệu-này)
2. [Hệ phân cấp ưu tiên](#2-hệ-phân-cấp-ưu-tiên)
3. [A. Đồng bộ & Truyền file](#a-đồng-bộ--truyền-file)
4. [B. Quản lý file & Remote](#b-quản-lý-file--remote)
5. [C. Terminal & SSH](#c-terminal--ssh)
6. [D. Deployment & Release](#d-deployment--release)
7. [E. Giám sát & Cảnh báo](#e-giám-sát--cảnh-báo)
8. [F. AI / Copilot mở rộng](#f-ai--copilot-mở-rộng)
9. [G. Bảo mật nâng cao](#g-bảo-mật-nâng-cao)
10. [H. Developer Experience](#h-developer-experience)
11. [I. UI / UX](#i-ui--ux)
12. [J. Nền tảng & Tích hợp](#j-nền-tảng--tích-hợp)
13. [K. Backup & Khôi phục](#k-backup--khôi-phục)
14. [L. Performance & Scale](#l-performance--scale)
15. [Ma trận ưu tiên & Lịch trình](#ma-trận-ưu-tiên--lịch-trình)
16. [Dependency graph](#dependency-graph)

---

## 1. Cách đọc tài liệu này

Mỗi feature có định dạng:

```
### F[A.L.<id>] Tên tính năng — [P<x>] <ước lượng>
Mô tả ngắn giá trị mang lại
Depends: ROADMAP Phase Y / feature khác
Tasks:
- [ ] ...
Risks: ...
```

- **P0** = critical, nên làm đầu tiên sau foundation
- **P1** = high value, kế hoạch gần
- **P2** = medium, nên có
- **P3** = nice-to-have, cộng giá trị
- Ước lượng: S (< 3 ngày), M (3–7 ngày), L (1–2 tuần), XL (> 2 tuần)

---

## 2. Hệ phân cấp ưu tiên

| Tier | Ý nghĩa | Số features chọn |
|---|---|---|
| P0 | Phải có cho bản v2.0 release | ~10 |
| P1 | Nên có, release kế tiếp | ~15 |
| P2 | Theo nhu cầu, chọn lọc | ~20 |
| P3 | Cộng giá trị, future | ~15 |

---

## A. Đồng bộ & Truyền file

### F[A.01] Delta/Block-level Sync (rsync-like) — [P0] L
Chỉ truyền phần thay đổi của file lớn (binary diff theo block 4–8KB), giảm bandwidth 80–99% cho file lớn chỉnh ít.
- Cần rolling hash (Adler-32) + strong hash (MD5/SHA1) giống rsync algorithm
- Bổ sung cột `file_hash`, `block_size` vào `local_file_cache`
- `SyncService` tính hash map local → gửi cho remote → remote trả matching blocks → client assemble
- Falls back full transfer nếu remote không hỗ trợ (FTP thuần)
Depends: Phase 3.1 (tách SyncService), Phase 1.3 (migration)
Tasks:
- [ ] Implement `BlockHasher.ts` (rolling + strong hash)
- [ ] `DeltaProtocol` cho SFTP (custom remote script)
- [ ] `DeltaSyncStrategy` chọn full vs delta theo file size + hash diff
- [ ] Test: file 1GB đổi 1KB → truyền < 10MB
- [ ] Metric: % bandwidth saved

### F[A.02] Bandwidth Throttling & Scheduler — [P0] S
Giới hạn tốc độ upload/download theo khung giờ để không nghẽn mạng công ty/nhà.
- Cấu hình: `max_upload_bw_kbps`, `max_download_bw_kbps`, `schedule_cron`
- Áp dụng throttle tại `trackProgress` (pause stream khi vượt)
- Scheduler: cron biểu thức "chỉ sync 22h–6h"
Depends: Phase 3.1
Tasks:
- [ ] `BandwidthLimiter.ts` (token bucket)
- [ ] Tích hợp vào stream pipeline của `FtpClientAdapter`/`SftpClientAdapter`
- [ ] UI: slider + cron picker trong connection form

### F[A.03] Sync Presets/Profiles — [P1] S
Nhiều preset sync cho cùng 1 connection (vd: "web root", "db backup", "logs archive"), mỗi preset có folder local/remote + ignore riêng.
- Bảng `sync_presets (id, connection_id, name, local_path, remote_path, mode, ignore_patterns, schedule)`
- UI: dropdown preset trong connection detail
Depends: Phase 3.4 (zustand)
Tasks:
- [ ] Migration tạo `sync_presets`
- [ ] `SyncService` load preset thay vì config cứng trên `ftp_connections`
- [ ] UI preset manager + form

### F[A.04] Multi-folder Sync per Connection — [P1] M
Hiện 1 connection = 1 cặp local/remote. Cho phép nhiều cặp folder mapping.
- Mở rộng `sync_presets` từ F[A.03]
- Watcher chokidar chạy multi-root
- UI: list mappings, mỗi row 1 local + remote + mode
Depends: F[A.03]

### F[A.05] Selective Sync (chọn subfolder) — [P1] S
Cherry-pick subfolders để sync, bỏ qua phần còn lại — giống Dropbox selective sync.
- Tree view checkbox chọn folder, lưu vào `include_paths`
- Watcher chỉ watch selected
Depends: F[A.03]

### F[A.06] Chunked/Resumable Upload cho file lớn — [P0] M
Upload file lớn (vd 5GB) theo chunk 10–50MB, resume nếu mất mạng giữa chừng.
- REST command (FTP) hoặc partial write seek (SFTP) để append
- Đã có `resume interrupted uploads with offset` — mở rộng cho manual upload, không chỉ sync
- Checksum verify sau khi ghép
Depends: Phase 3.1
Tasks:
- [ ] `ChunkedUploader.ts` (chia file, upload parallel, ghép)
- [ ] Track chunk progress trong `sync_transfer_queue`
- [ ] UI: progress per-chunk + overall

### F[A.07] Sync History Timeline + Revert — [P1] M
Timeline hiển thị mọi sync đã chạy, click vào xem file đã thay đổi, revert từng file/version.
- Dùng `sync_data/history/connection_$id/` (đã có backup) + `sync_sessions` (đã có)
- UI: timeline dọc, expand session → list file → click → restore
- Revert đã có endpoint `/reports/sessions/restore` — mở rộng UI
Depends: Phase 3.6 (gộp persistence sang SQLite cho query nhanh)

### F[A.08] Mirror Mode (replica chính xác) — [P1] S
Đảm bảo remote là mirror chính xác của local: xóa file trên remote không có ở local (đã có `sync_deletions`), nhưng thêm verify count + size.
- Mode `mirror_strict`: so sánh toàn bộ tree sau mỗi run, log khác biệt
- Dry-run preview trước khi xóa
Depends: Phase 3.1

### F[A.09] Conflict Resolution UI (3-way merge) — [P0] M
Khi cả local & remote đều đổi sau last sync, hiện modal thay vì auto-resolve.
- `SyncService` track `last_sync_hash` per file
- Nếu local_hash ≠ last_hash ≠ remote_hash → flag conflict, pause sync
- UI: Monaco 3-pane (base | local | remote) + chọn version hoặc merge inline
- Decision log vào DB
Depends: Phase 3.1, Phase 3.6
Tasks:
- [ ] `ConflictDetector.ts` pure function
- [ ] `ConflictQueue` table + API
- [ ] UI `ConflictResolverModal.tsx` (kích hoạt lại bản đã có + mở rộng 3-way)

### F[A.10] Bandwidth Dashboard & Quota — [P2] S
Theo dõi bandwidth theo ngày/tuần/tháng, set quota per connection.
- Dùng `transfer_stats` (sau khi gộp SQLite)
- Alert khi gần đạt quota
Depends: Phase 3.6, F[E.03]

### F[A.11] Sync Dry-Run Preview — [P1] S
Trước khi sync thật, xem trước danh sách file sẽ upload/download/delete + size tổng.
- `SyncService.dryRun()` trả plan không execute
- UI: review + confirm + cherry-pick
Depends: Phase 3.1

### F[A.12] Auto-pause khi mạng yếu — [P2] S
Detect network quality (ping latency, packet loss), auto-pause sync khi mạng xấu, resume khi ổn.
- Health check liên tục, queue transfers chờ
- Tránh fail/retry loop tốn tài nguyên
Depends: F[E.01] (health monitoring)

### F[A.13] Priority Queue — [P2] S
Đánh priority cho file (vd config file ưu tiên hơn video), sync theo priority.
- Cột `priority` trong `sync_transfer_queue`
- PQueue consume theo priority
Depends: Phase 3.1

### F[A.14] Smart Batch Sizing — [P3] S
Tự động tune `parallel_connections` + `buffer_size` theo file profile (nhiều file nhỏ → nhiều connections, file lớn → ít connections, buffer lớn).
- Heuristic dựa scan kết quả
- Override được bằng user
Depends: Phase 3.1

---

## B. Quản lý file & Remote

### F[B.01] Remote File Editor (Monaco) — [P0] M
Edit file remote trực tiếp trong app, save upload lại (đã có Monaco cho diff, mở rộng).
- Double-click file remote → mở editor → edit → save → upload
- Lock file trên remote (nếu support) để tránh concurrent edit
- Conflict check trước save
Depends: Phase 3.4
Tasks:
- [ ] `RemoteFileEditor.tsx` (Monaco + save)
- [ ] Lock/refresh mechanism
- [ ] Open recent files list

### F[B.02] Multi-tab Remote Editor — [P2] S
Mở nhiều file remote cùng lúc theo tab, giống VS Code.
- Tab state trong zustand store
- Dirty indicator, confirm close
Depends: F[B.01], Phase 3.4

### F[B.03] File Preview (image/PDF/video/code) — [P1] M
Preview file remote không cần download: stream về memory + render.
- Image: stream + blob URL
- PDF: pdf.js
- Video/audio: HTML5 + stream
- Code: Monaco read-only
- Text: highlight syntax
Depends: Phase 3.4

### F[B.04] Remote File Search (filename + content grep) — [P0] M
Search file remote theo tên hoặc nội dung.
- Filename: `LIST -R` + filter (nhanh)
- Content: download + grep local (chậm nhưng cần) hoặc SSH `grep -r` (SFTP-only)
- Index option: build cache `remote_file_index` lần scan
Depends: Phase 3.6
Tasks:
- [ ] `RemoteSearchService.ts`
- [ ] UI search bar + results với preview
- [ ] Optional FTS5 SQLite cho content search

### F[B.05] Bulk Rename trên Remote — [P2] S
Rename nhiều file theo pattern (regex, sequence, find/replace).
- Preview trước khi apply
- Undo (rename ngược lại)
Depends: Phase 3.4

### F[B.06] CHMOD / Permissions UI — [P1] S
Đặt permission file/folder remote (chmod octal hay checkbox rwxrwxrwx).
- `SITE CHMOD` FTP, `chmod` SFTP
- Recursive option cho folder
- Presets: 644, 755, 600
Depends: Phase 3.1

### F[B.07] Checksum Verification sau transfer — [P0] S
Tính checksum local + remote sau khi transfer, verify khớp mới đánh dấu done.
- MD5/SHA256
- Nếu mismatch → retry, sau 3 lần fail → flag
- Already partially in `contentDiff` — mở rộng cho mọi transfer
Depends: Phase 3.1
Tasks:
- [ ] `ChecksumVerifier.ts`
- [ ] Cột `checksum_verified` trong `sync_transfer_queue`
- [ ] UI warning khi mismatch

### F[B.08] Archive Operations (zip/unzip remote) — [P2] M
Tạo zip từ folder remote, download zip, unzip upload.
- SFTP: `tar`/`zip` command via SSH (dùng SSHTerminalService)
- FTP: download folder → zip local → upload zip
- Tiện cho backup nhanh
Depends: F[C.05] (SSH command exec)

### F[B.09] Dual-Pane Commander View — [P0] L
Giao diện 2 pane (local | remote) giống Total Commander / FileZilla, kéo-thả giữa 2 pane.
- Tree view + file list mỗi pane
- Drag local → remote upload, drag ngược lại download
- Sync với visual diff tự động
- Tab để mở nhiều connection
Depends: Phase 3.4
Tasks:
- [ ] `CommanderLayout.tsx`
- [ ] `LocalPane.tsx`, `RemotePane.tsx`
- [ ] Drag-drop integration (HTML5 DnD + Electron native)
- [ ] Toolbar (copy, move, delete, sync)

### F[B.10] File Tags & Notes — [P3] S
Đánh tag + note cho file remote để dễ tìm lại.
- Bảng `file_tags (connection_id, path, tags, note)`
- Filter theo tag
Depends: Phase 3.6

### F[B.11] Recent Files / Quick Access — [P2] S
List file remote/local vừa truy cập, click mở lại nhanh.
- Store trong zustand + localStorage
- Pin file quan trọng
Depends: F[B.01]

### F[B.12] File Compare (2 file remote) — [P2] S
So sánh 2 file bất kỳ (không cần local), Monaco diff.
- Pick 2 file từ browser
- Side-by-side
Depends: F[B.01]

### F[B.13] Directory Size Calculator — [P1] S
Tính tổng size + số file của folder remote (đệ quy).
- Progress + cancel
- Cache kết quả 1h
Depends: Phase 3.1

### F[B.14] File Integrity Scan định kỳ — [P2] M
Cron quét hash toàn bộ file remote, so với cache local, flag file bị thay đổi ngoài sync (vd bị hack).
- Weekly report
- Alert khi mismatch
Depends: F[B.07], F[E.03]

---

## C. Terminal & SSH

### F[C.01] SSH Port Forwarding UI — [P0] M
Kích hoạt lại `port_forwards` table (hiện dead) — quản lý local/remote port forward.
- Local forward (-L), remote forward (-R), dynamic SOCKS (-D)
- Auto-start khi app mở (đã có cột `auto_start`)
- Status indicator (active/disconnected)
Depends: Phase 1.3 (migration)
Tasks:
- [ ] `PortForwardService.ts` (ssh2 forward)
- [ ] CRUD routes `/api/port-forwards`
- [ ] UI list + add/edit + start/stop
- [ ] Auto-start on app launch

### F[C.02] SSH Key Management — [P0] M
UI tạo/import/export SSH key pair (RSA, Ed25519, ECDSA).
- Generate key + copy public key
- Import private key file
- Test key against host
- Lưu key mã hóa trong DB (đã có `ssh_private_key` cột)
Depends: Phase 2.2 (encryption)
Tasks:
- [ ] `SSHKeyService.ts` (ssh2 keygen)
- [ ] UI wizard generate/import
- [ ] Install public key to remote (`ssh-copy-id` style)

### F[C.03] SSH Agent Forwarding — [P1] S
Forward agent để SSH từ remote server đến server thứ 3 không cần key trên remote.
- Toggle trong connection form
- ssh2 `agentForward` option
Depends: F[C.02]

### F[C.04] SSH Config Import/Export — [P2] S
Import/Export `~/.ssh/config` định dạng, sync với connections.
- Parse config file
- Map sang `ftp_connections` (SFTP type)
- Export ra file
Depends: F[C.02]

### F[C.05] SSH Command Execution (non-interactive) — [P1] M
Run command SSH 1-shot, không cần terminal full.
- `POST /api/ssh/exec` với command, trả stdout/stderr/exit code
- Output streaming via WebSocket
- Template snippets với biến `${host}`, `${path}`
Depends: Phase 3.1
Tasks:
- [ ] `SSHExecService.ts`
- [ ] Route `/api/ssh/exec`
- [ ] UI "Run Command" panel + snippet library

### F[C.06] Terminal Recording (asciinema) — [P3] M
Record terminal session, replay như video.
- Format asciinema cast JSON
- Save vào DB, list + play
- Share cast file
Depends: Phase 3.6

### F[C.07] Snippet Library nâng cấp — [P1] S
Đã có `command_snippets` — mở rộng: biến số, template, category, favorite, run history.
- Snippet với placeholder `${1:filename}`, Tab để điền
- Category + tag
- Recent run + success/fail count
Depends: F[C.05], Phase 3.4

### F[C.08] Multi-hop SSH (jump host) — [P2] M
SSH qua jump host (bastion) rồi mới đến target — phổ biến trong infra production.
- ssh2 `ready` chain qua nhiều hop
- UI: list hop trong connection form
Depends: F[C.02]

### F[C.09] SFTP Bookmarks — [P2] S
Lưu path remote hay dùng, click để navigate nhanh trong SFTP browser.
- Tree bookmark panel
- Drag folder vào bookmark
Depends: Phase 3.4

### F[C.10] Terminal Search History — [P3] S
Search command history trong terminal (Ctrl+R style), persistent across sessions.
- Lưu history per session trong DB
- Search + autocomplete
Depends: Phase 3.6

### F[C.11] SSH Tunnel Manager — [P3] L
Quản lý nhiều tunnel cùng lúc, status dashboard, auto-reconnect.
- Extend F[C.01]
- Mở rộng cho SOCKS proxy
Depends: F[C.01]

### F[C.12] Web Terminal (browser access) — [P3] L
Truy cập terminal từ browser (LAN) thay vì chỉ trong Electron app.
- xterm.js đã web-ready, chỉ cần auth + HTTPS
- Useful cho headless server mode
Depends: F[J.01] (web mode), Phase 2.1 (auth)

---

## D. Deployment & Release

### F[D.01] Multi-environment Deploy — [P0] M
Triển khai qua dev → staging → prod, mỗi môi trường 1 connection, promote button.
- Pipeline UI: stage卡片, drag file/release qua stage
- Config per stage (env vars, deploy script)
- Promote = deploy từ stage trước + run migrations
Depends: Phase 3.4
Tasks:
- [ ] `DeploymentPipeline.ts` service
- [ ] Bảng `deploy_pipelines (id, name, stages JSON)`
- [ ] UI pipeline view

### F[D.02] Deploy Hooks (pre/post) — [P0] S
Run script trước/sau deploy (vd backup DB, clear cache, run migrations).
- Pre-deploy hook: SSH command
- Post-deploy hook: SSH command
- Fail hook → rollback tự động
Depends: F[C.05]
Tasks:
- [ ] Cột `pre_deploy_hook`, `post_deploy_hook` trong `ftp_connections`
- [ ] `DeploymentService` run hook trước/sau swap
- [ ] Log hook output

### F[D.03] Deploy Approval Workflow — [P1] M
Deploy prod cần approval từ 1+ người trước khi chạy.
- Request deploy → assign approver → approve → execute
- Audit log
- Useful cho team
Depends: Phase 2.1 (auth), F[G.06] (team)

### F[D.04] Rollback to Any Version — [P1] S
Hiện rollback chỉ last backup. Cho rollback về bất kỳ version nào trong list.
- List backups (đã có) → click rollback → atomic swap
- Compare 2 version trước khi rollback
Depends: Phase 3.6

### F[D.05] Blue-Green Deployment — [P2] L
2 environment sống song song, switch traffic instant.
- Manage 2 dir `live_blue`, `live_green`
- Deploy → inactive → health check → switch → keep old làm rollback
Depends: F[D.01], F[E.01]

### F[D.06] Deploy Notifications — [P1] S
Notify qua Discord/Slack/Telegram/email khi deploy thành công/fail.
- Webhook config
- Template message với diff summary
Depends: F[E.04]

### F[D.07] Deploy Diff Preview — [P1] S
Trước khi deploy, show diff giữa local release folder và remote live folder, similar visual diff.
- List file sẽ thay đổi, thêm, xóa
- Click xem content diff
Depends: Phase 3.5 (diff scanner dedup)

### F[D.08] Zero-downtime Deploy cho stack cụ thể — [P3] XL
Template deploy cho Laravel, Node.js, WordPress, static site — biết clear cache, run migration, restart service đúng cách.
- Profile deploy
- Stack-specific post-hook
Depends: F[D.02]

### F[D.09] Deploy Calendar / History — [P2] S
Lịch sử deploy theo timeline, ai deploy khi nào, version nào.
- Timeline UI
- Filter theo connection/env/user
Depends: Phase 3.6, Phase 2.1

### F[D.10] Scheduled Deploy — [P2] S
Cron deploy (vd deploy production lúc 2h sáng).
- Cron config + dry-run trước
- Notify trước 30 phút
Depends: F[A.02] (scheduler), F[D.06]

---

## E. Giám sát & Cảnh báo

### F[E.01] Connection Health Monitor — [P0] M
Ping/latency/uptime mỗi connection, dashboard status.
- Background poll mỗi 30s
- Lưu `connection_health (connection_id, ts, latency_ms, status)`
- UI: status badge per connection, color (green/yellow/red)
- Alert khi down N phút
Depends: Phase 3.6
Tasks:
- [ ] `HealthMonitor.ts` service
- [ ] UI dashboard widget
- [ ] Alert rule config

### F[E.02] Disk Space Monitor (local + remote) — [P1] S
Theo dõi disk usage, cảnh báo khi < 10%.
- Local: `fs.statfs`
- Remote: `df` via SSH hoặc `STAT` (SFTP) / `SIZE` (FTP)
- UI gauge + history graph
Depends: F[E.01], F[C.05]

### F[E.03] Alert System đa kênh — [P0] M
Alert khi: sync fail N lần, connection down, disk full, deploy fail.
- Channel: toast in-app, system tray notification, email (SMTP), webhook (Discord/Slack/Telegram)
- Rule engine: condition → action
- Mute rule (snooze)
Depends: Phase 3.4
Tasks:
- [ ] `AlertRule` table + service
- [ ] `NotificationChannel` abstraction
- [ ] UI rule editor
- [ ] Test channel button

### F[E.04] Webhook Notifications — [P1] S
Bundled trong F[E.03] — webhook cho Discord/Slack/Telegram với template message.
Depends: F[E.03]

### F[E.05] Activity Timeline (unified) — [P1] M
Mọi event (sync, deploy, terminal command, file edit, login) trong 1 timeline thống nhất.
- `activity_log (ts, user_id, connection_id, action, detail JSON)`
- Filter theo type/connection/user/date
- Export CSV
Depends: Phase 2.1, Phase 3.6

### F[E.06] Remote Server Load Monitor — [P2] M
CPU/RAM/load của remote server qua SSH.
- `top`/`htop` parse hoặc `/proc` read
- Live graph (recharts)
- Alert khi load > threshold
Depends: F[C.05], F[E.01]

### F[E.07] Real-time Transfer Graph — [P1] S
Live graph throughput (MB/s) theo thời gian thực, per connection + total.
- WebSocket stream (đã có) → recharts real-time
- History 1h/24h/7d
Depends: Phase 3.4

### F[E.08] Sync Failure Report — [P1] S
Báo cáo tuần/month: sync fail rate, root cause, file hay fail.
- Aggregate từ `sync_logs`
- Email weekly digest
Depends: Phase 3.6, F[E.03]

### F[E.09] Connection Uptime SLA — [P3] S
Tính uptime % per connection theo tuần/tháng.
- Dựa `connection_health`
- SLA badge (99.9%, 99%...)
Depends: F[E.01]

### F[E.10] Anomaly Detection — [P3] L
AI phát hiện sync bất thường (suddenly huge transfer, sync fail lúc lạ, file count spike).
- Statistical baseline + threshold
- Alert khi outlier
Depends: F[F.04] (AI), F[E.01]

---

## F. AI / Copilot mở rộng

### F[F.01] AI Terminal Assistant — [P1] L
Natural language → shell command (vd "list all files modified today" → `find . -mtime 0`).
- Dùng Gemini/GPT/Ollama local
- Inline suggestion trong terminal
- Explain command trước khi run (safety)
- Learn from snippets đã có
Depends: F[C.05], F[F.06]
Tasks:
- [ ] `TerminalCopilot.ts`
- [ ] Inline UI overlay
- [ ] Command explanation
- [ ] "Did you mean" suggestion

### F[F.02] AI Explain Error Logs — [P0] S
Click log error → AI giải thích nguyên nhân + suggest fix.
- Gửi log context cho LLM
- Cache explain để không gọi lại
- Vietnamese prompt (đã có pattern trong `ai.ts`)
Depends: Phase 3.6
Tasks:
- [ ] Button "Giải thích bằng AI" trong log row
- [ ] `explainError` endpoint
- [ ] Markdown render response

### F[F.03] AI Suggest Sync Strategy — [P2] M
Dựa file profile + history, AI gợi ý: nên tăng/giảm parallel, buffer size, schedule.
- Analyze `transfer_stats`, `sync_logs`
- Recommend config change
- Apply button
Depends: Phase 3.6

### F[F.04] AI Detect Anomalous Changes — [P2] M
Flag file thay đổi bất thường (size spike, modified lúc 3h sáng, mass delete).
- Compare với baseline pattern
- Alert trong activity timeline
Depends: F[E.10]

### F[F.05] AI Generate Deployment Script — [P2] M
Mô tả stack ("Laravel app on Ubuntu VPS") → AI generate pre/post deploy hook + folder structure.
- Template + LLM fill
- Edit trước khi save
Depends: F[D.02]

### F[F.06] Local LLM Option (Ollama) — [P1] M
Hỗ trợ Ollama local (Llama 3, Qwen) để privacy — không gửi data ra cloud.
- Endpoint `http://localhost:11434/api/generate`
- Toggle Gemini vs Ollama vs OpenAI-compatible
- Model picker
Depends: Phase 3.4
Tasks:
- [ ] `LLMProvider` abstraction (Gemini, Ollama, OpenAI)
- [ ] Settings UI pick provider
- [ ] Fallback chain (local first, cloud if fail)

### F[F.07] AI Diff Summarization (multi-file) — [P1] S
Hiện AI explain 1 file diff. Mở rộng: summarize toàn bộ batch diff (N file), highlight top changes.
- Batch prompt
- Group theo type (added/modified/deleted)
Depends: Phase 3.4

### F[F.08] AI Chat Assistant — [P3] L
Chat với AI context về connection: hỏi "tại sao sync chậm", "file nào hay fail", AI trả với data thực.
- RAG-style: query DB → context → LLM
- Chat history
Depends: F[F.06], Phase 3.6

### F[F.09] AI Code Review cho diff — [P2] M
Review code change trước khi sync (PHP, JS, TS), flag bug/security issue.
- LLM với diff context
- Comment theo line giống GitHub review
Depends: F[F.06]

### F[F.10] AI Smart Filename / Migration — [P3] S
Suggest rename file theo convention, hoặc sinh migration script từ diff.
Depends: F[F.06]

---

## G. Bảo mật nâng cao

### F[G.01] 2FA / TOTP cho master login — [P1] S
Thêm TOTP (Google Authenticator) cho app local login.
- QR setup wizard
- Backup codes
- Remember device 30 ngày
Depends: Phase 2.1 (auth)
Tasks:
- [ ] `speakeasy` hoặc `otplib` lib
- [ ] Setup flow + verify flow
- [ ] Backup codes generate + verify

### F[G.02] OS Keystore cho credentials — [P0] M
Lưu password FTP/SSH trong Windows Credential Manager / macOS Keychain / Linux Secret Service thay vì DB.
- `keytar` lib
- Fallback DB encrypted nếu keystore unavailable
- Migration wizard
Depends: Phase 2.2
Tasks:
- [ ] `KeystoreService.ts`
- [ ] Toggle "use OS keystore" trong settings
- [ ] Migrate existing passwords

### F[G.03] Client-side Encryption before upload — [P2] L
Mã hóa file local trước khi upload, giải mã khi download — remote chỉ thấy ciphertext.
- AES-256-GCM per file với key derived từ master password
- Streaming encrypt (không load cả file vào RAM)
- Optional: keep plaintext local, encrypted remote only
Depends: Phase 2.2
Tasks:
- [ ] `StreamingCipher.ts`
- [ ] Toggle per connection "encrypt at rest on remote"
- [ ] Key management (rotate, re-encrypt)

### F[G.04] PGP/GPG File Signing — [P3] M
Ký file bằng PGP trước khi upload, verify signature khi download.
- `openpgp.js`
- Sign + verify UI
Depends: F[G.03]

### F[G.05] Session Lock on Inactivity — [P1] S
Tự động lock app (yêu cầu master password lại) sau N phút idle.
- Config idle timeout
- Lock screen overlay
- "Lock now" button
Depends: Phase 2.1

### F[G.06] Multi-user / Team mode — [P2] XL
Nhiều user dùng chung 1 instance (server mode), mỗi user role khác nhau.
- Role: admin (all), operator (sync/deploy), viewer (read-only)
- Per-connection permission
- Audit log who did what
Depends: Phase 2.1, F[J.01]

### F[G.07] Connection Audit Trail — [P1] S
Log mọi action (login, create/edit/delete connection, sync start/stop, deploy, terminal command).
- `audit_log (ts, user_id, action, target, ip)`
- Filter + export
- Tamper-evident (hash chain)
Depends: Phase 2.1, F[E.05]

### F[G.08] Connection Export with Password Strip — [P1] S
Export connections JSON không kèm password (share template cho đồng nghiệp).
- Toggle "include credentials"
- Hash placeholder
Depends: Phase 2.2

### F[G.09] Auto-lock Terminal on disconnect — [P2] S
Khi SSH session disconnect, yêu cầu re-authenticate trước khi reconnect.
- Avoid session hijack trên shared machine
Depends: Phase 2.1

### F[G.10] Rate Limiting per IP — [P2] S
Giới hạn request per IP per phút (chống brute-force local API).
- `express-rate-limit`
- Whitelist 127.0.0.1
Depends: Phase 2.1

### F[G.11] Secret Scanner trong config — [P3] S
Scan file ignore/upload cho secret (API key, password hardcode) trước khi sync.
- Regex pattern (AWS key, GCP key, private key...)
- Warn trước upload
Depends: Phase 3.1

---

## H. Developer Experience

### F[H.01] CLI Tool `omnisync-cli` — [P0] L
Command-line tool để sync/deploy không cần mở app GUI.
- `omnisync sync <connection>` — run sync
- `omnisync deploy <connection>` — deploy
- `omnisync diff <connection>` — show diff
- `omnisync list` — list connections
- Config từ DB chung với app
Depends: Phase 3.1
Tasks:
- [ ] `bin/cli.ts` entry
- [ ] npm package `omnisync` publishable
- [ ] Shell completion (bash/zsh/powershell)
- [ ] CI/CD script integration

### F[H.02] REST API Documentation (OpenAPI) — [P0] M
Swagger/OpenAPI spec cho toàn bộ API, dùng cho integration + AI agent.
- `swagger-jsdoc` từ JSDoc
- UI `/api/docs` (swagger-ui-express)
- Export `openapi.json`
Depends: Phase 3.1
Tasks:
- [ ] Annotate routes với OpenAPI
- [ ] Serve swagger-ui
- [ ] Versioned spec

### F[H.03] Webhook API (programmatic sync trigger) — [P1] S
Endpoint `POST /api/webhook/sync/:token` để trigger sync từ CI/CD hoặc external.
- Token per connection
- Secret verify (HMAC)
- Return sync id để poll status
Depends: Phase 2.1

### F[H.04] Git Integration — [P1] M
Sync chỉ file tracked bởi git (respect `.gitignore`), hoặc sync từ git branch.
- Parse `.gitignore` dùng làm ignore patterns
- `git ls-files` để list tracked
- Branch picker
Depends: Phase 3.5

### F[H.05] Docker Image cho server mode — [P1] M
Docker image chạy server headless (no Electron), dùng cho CI/CD hoặc server.
- `Dockerfile` multi-stage
- Volume cho DB + config
- `docker-compose.yml` example
Depends: F[J.01]
Tasks:
- [ ] Dockerfile
- [ ] Healthcheck endpoint
- [ ] Env config (no GUI)

### F[H.06] MCP Server Integration — [P2] M
Model Context Protocol server để AI assistant (Claude, GPT) gọi được sync/deploy/diff qua chuẩn MCP.
- `@modelcontextprotocol/sdk`
- Tools: `sync`, `deploy`, `diff`, `list_connections`
- Resource: connection configs, logs
Depends: F[H.02], F[F.06]

### F[H.07] Plugin System — [P3] XL
SDK cho phép viết plugin (transfer hook, UI panel, command) bằng JS/TS.
- Hook points: pre/post sync, pre/post transfer, custom panel
- Plugin manifest + sandbox
- Marketplace (future)
Depends: Phase 3.1

### F[H.08] SDK (TypeScript + Python) — [P2] L
Wraper SDK để tích hợp OmniSync vào app khác.
- TypeScript SDK (npm)
- Python SDK (pip)
- Auto-generate từ OpenAPI (F[H.02])
Depends: F[H.02]

### F[H.09] Script Engine (JS sandbox) — [P2] M
Viết script JS chạy trong app để tự động hóa (vd "nếu file X đổi → deploy").
- VM2/isolated-vm sandbox
- API: `omnisync.getConnection()`, `omnisync.sync()`, `omnisync.deploy()`
- Schedule + trigger
Depends: F[H.03], Phase 3.4

### F[H.10] Test Connection Speed Benchmark — [P3] S
Tool đo tốc độ upload/download đến 1 connection, so sánh giữa connections.
- Upload file test 10MB, đo thời gian
- History graph
Depends: Phase 3.1

### F[H.11] Vercel/Cloudflare serverless deploy — [P3] M
Tích hợp deploy lên serverless platform (Vercel CLI, Wrangler).
- Auth token config
- Deploy command
Depends: F[D.02]

### F[H.12] npm Script Runner UI — [P3] S
Quản lý + run npm scripts (package.json) local hoặc remote (via SSH).
- List script, run, log output
Depends: F[C.05]

---

## I. UI / UX

### F[I.01] Command Palette (Cmd+K) — [P0] M
Spotlight search: gõ command → tìm connection, run sync, deploy, open file, navigate.
- `cmdk` lib hoặc tự build
- Fuzzy search
- Recent + frequently used
Depends: Phase 3.4
Tasks:
- [ ] `CommandPalette.tsx`
- [ ] Register commands từ modules
- [ ] Keyboard shortcut global

### F[I.02] Keyboard Shortcuts Manager — [P1] M
Tất cả action có shortcut, user customize được.
- Default: Ctrl+S sync, Ctrl+D diff, Ctrl+Shift+D deploy
- Conflict detection
- Export/import keymap
Depends: Phase 3.4

### F[I.03] Status Bar — [P1] S
Bar dưới app: sync status, queue count, total speed, connection health, notifications.
- Live update via store
- Click → expand detail
Depends: Phase 3.4, F[E.01], F[E.07]

### F[I.04] Notification Center — [P0] S
Bell icon với dropdown list notification (sync done, fail, deploy done), mark read, clear.
- Dùng F[E.03] infrastructure
- Toast + history
Depends: F[E.03]

### F[I.05] Onboarding Wizard — [P1] M
First-run guide: tạo connection đầu, test, sync thử, xem diff, deploy demo.
- Step-by-step overlay
- Skip option
- Re-triggerable từ Help menu
Depends: Phase 3.4

### F[I.06] Empty States & Error Boundaries — [P1] S
Mọi list rỗng có illustration + CTA. React error boundary + fallback UI.
- Consistent empty state component
- Error boundary per route
Depends: Phase 3.4

### F[I.07] Settings Page tập trung — [P0] M
Gom: AI provider (Gemini/Ollama), theme, language, parallel default, buffer, log retention, keystore, 2FA, notifications.
- Tabbed settings
- Search settings
Depends: Phase 3.4, F[F.06], F[G.02], F[G.01]
Tasks:
- [ ] `SettingsPage.tsx`
- [ ] Sub-pages: General, AI, Security, Notifications, Advanced
- [ ] Settings store (zustand)

### F[I.08] Dark/Light Theme (thật) — [P1] S
Kích hoạt `useTheme.ts` + `themeStore`, Tailwind `dark:` variant.
- 3 theme: dark (hiện), light, system
- Toggle trong status bar
Depends: Phase 3.4

### F[I.09] Multi-language (i18n) — [P1] M
`react-i18next` + namespace, file `vi.json` + `en.json`.
- Language switcher trong settings
- Hiện trộn Việt/Anh trong code (ai.ts prompt Việt, error message Anh)
Depends: Phase 3.4
Tasks:
- [ ] Setup i18next
- [ ] Extract strings ra JSON
- [ ] Language picker

### F[I.10] Quick Actions Toolbar — [P1] S
Toolbar trên cùng: New Connection, Sync All, Refresh, Settings, Command Palette.
- Always visible
- Customizable
Depends: F[I.01]

### F[I.11] Tabbed Multi-connection View — [P1] M
Mỗi connection mở 1 tab (giống browser tab), switch nhanh.
- Drag tab reorder
- Pin tab
- Tab persists across restart
Depends: Phase 3.4

### F[I.12] Context Menu (right-click) — [P2] S
Right-click file/folder/connection → menu action (sync, diff, deploy, edit, rename, delete).
- Per-context menu builder
- Customizable
Depends: Phase 3.4

### F[I.13] Spotlight File Search — [P1] S
Tìm file local + remote cùng lúc, fuzzy match.
- Quét index local (Rust scanner đã có) + remote cache
- Open file editor / diff / sync
Depends: F[B.04], F[I.01]

### F[I.14] Tray Quick Actions — [P1] S
System tray menu: list connections + sync/stop toggle, deploy recent, open app.
- Already có tray — extend menu
Depends: Phase 3.4

### F[I.15] Drag-drop upload improvement — [P1] S
Drag file từ desktop → app upload. Drag folder → upload recursive.
- Already partial — extend cho commander view
- Progress indicator per file
Depends: F[B.09]

### F[I.16] Connection Grouping / Folders — [P2] S
Group connection theo folder/tag (vd "Production", "Personal", "Client A").
- Tree view trong connection list
- Bulk action on group
Depends: Phase 3.4

### F[I.17] Pin Favorite Files — [P3] S
Pin file hay edit, quick access panel.
Depends: F[B.11]

### F[I.18] Workspace / Project mode — [P3] M
Workspace = set connections + folders + settings, switch workspace thay đổi context.
- Useful cho nhiều project
Depends: Phase 3.4

---

## J. Nền tảng & Tích hợp

### F[J.01] Web UI Mode (browser access) — [P0] L
Run server headless, access từ browser trong LAN — Electron optional.
- Already có Vercel handler (`api/index.ts`) — expand
- Auth (Phase 2.1) bắt buộc khi expose
- WebSocket works in browser
- Desktop-only features (tray, native DnD) degrade gracefully
Depends: Phase 2.1, F[H.05]
Tasks:
- [ ] Server-only entry point
- [ ] CORS + CSRF protection
- [ ] HTTPS support (self-signed or Let's Encrypt)
- [ ] Mobile-responsive UI

### F[J.02] Mobile Companion (status + trigger) — [P2] L
Mobile web app xem status, trigger sync, nhận notification.
- PWA installable
- Push notification (web push API)
- Read-only + trigger, không edit
Depends: F[J.01]

### F[J.03] Background Service Mode — [P1] M
Run as Windows Service / launchd / systemd thay vì Electron app, sync background.
- `node-windows` / `node-mac` / `node-linux`
- Service config + start/stop
- Log to file
Depends: F[H.05]

### F[J.04] Cross-device Config Sync — [P2] M
Sync config (connections, presets, settings) giữa nhiều máy — không kèm password (qua F[G.08]).
- Export to file / cloud (Google Drive, Dropbox)
- Import on other machine
- Conflict resolution (newest wins)
Depends: F[G.08]

### F[J.05] Cloud Storage Sync Targets — [P0] L
Mở rộng `TransferClient` cho S3, Backblaze B2, Google Cloud Storage, Azure Blob, Wasabi.
- `TransferClientFactory.createClient('s3')` → `S3ClientAdapter`
- Use `@aws-sdk/client-s3`
- Bucket lifecycle rules
- Multipart upload native
Depends: Phase 3.1
Tasks:
- [ ] `S3ClientAdapter.ts`
- [ ] `B2ClientAdapter.ts` (Backblaze)
- [ ] UI protocol picker + credentials form
- [ ] Test connection

### F[J.06] WebDAV Support — [P1] M
`WebdavClientAdapter` dùng `webdav` npm package.
- Many cloud services expose WebDAV (Nextcloud, ownCloud, Box)
Depends: F[J.05]

### F[J.07] Google Drive / Dropbox / OneDrive — [P2] L
OAuth flow cho personal cloud, sync folder như FTP.
- `googleapis`, `dropbox` npm
- OAuth token refresh
- Watch changes via API push
Depends: F[J.05]

### F[J.08] Mount as Drive (FUSE/Dokan) — [P3] XL
Mount remote FTP/SFTP thành ổ đỉa local (Mac/Linux FUSE, Windows Dokan).
- Read/write transparent
- Cache + offline
Depends: F[J.05]

### F[J.09] Local Cache Mode (offline work) — [P2] L
Lưu file remote local, edit offline, sync khi online.
- Conflict khi reconnect
- Show "offline edited" badge
Depends: Phase 3.6

### F[J.10] Auto-update Electron — [P0] S
`electron-updater` + GitHub releases, check + download + install on quit.
- Already have GitHub releases + CI
- Delta update (efficient)
- Channel: stable / beta
Depends: Phase 2.3
Tasks:
- [ ] `electron-updater` integrate
- [ ] Update check on startup
- [ ] Notify + download + install
- [ ] Code signing (pair Phase 2.3)

### F[J.11] Scheduled Task Cron — [P0] S
Per-connection cron schedule (phân biệt với F[A.02] scheduler bandwidth — đây là lịch sync).
- `node-cron` hoặc lib nhẹ
- Per connection 1 task
- Next-run preview
Depends: Phase 3.1
Tasks:
- [ ] `CronScheduler.ts`
- [ ] Cron picker UI (react-cron-picker)
- [ ] Timezone support

### F[J.12] Cross-platform Notif (native) — [P1] S
Native OS notification (Windows toast, macOS notification center, Linux libnotify).
- `node-notifier`
- Click → focus app
Depends: F[E.03]

### F[J.13] Crash Reporter — [P2] M
Tự report crash (Sentry-like, self-hosted hoặc local).
- `electron` crashReporter
- Local log file + optional upload
- Privacy-respecting
Depends: F[J.10]

### F[J.14] Telemetry (opt-in) — [P3] S
Anonymous usage stats để improve (sync frequency, error rate, feature use).
- Opt-in only
- Local first, upload weekly
Depends: Phase 2.1

---

## K. Backup & Khôi phục

### F[K.01] Automatic Backup trước Sync — [P0] M
Trước mỗi sync, snapshot file sẽ bị overwrite → backup dir.
- Already partial (`sync_data/history`) — extend thành policy
- Retention policy (giữ N phiên bản hoặc N ngày)
- Auto-cleanup old backup
Depends: Phase 3.6
Tasks:
- [ ] `BackupPolicy.ts`
- [ ] Retention config per connection
- [ ] Cleanup cron

### F[K.02] Point-in-Time Recovery — [P1] M
Restore folder về bất kỳ thời điểm nào trong history.
- List snapshot theo ts
- Pick ts → restore all files as-of
- Preview diff trước restore
Depends: F[K.01], F[A.07]

### F[K.03] Backup to Cloud — [P1] L
Backup snapshot lên S3/B2/Google Drive (pair với F[J.05]).
- Incremental backup (chỉ file changed)
- Encryption before upload
- Restore from cloud
Depends: F[J.05], F[G.03]

### F[K.04] Backup Verification — [P1] S
Verify backup integrity (checksum, can restore) định kỳ.
- Random sample check
- Alert nếu fail
Depends: F[K.01], F[B.07]

### F[K.05] Restore Wizard — [P1] M
UI step-by-step restore: chọn connection → chọn snapshot → chọn file → restore.
- Preview trước restore
- Conflict handling (file đã đổi sau backup)
Depends: F[K.02]

### F[K.06] Selective Backup — [P2] S
Chỉ backup file match pattern (vd chỉ .php, .env).
- Ignore pattern cho backup
Depends: F[K.01]

### F[K.07] Backup Encryption — [P0] S
Mã hóa backup trước khi lưu (local hoặc cloud).
- AES-256 với key derived từ master password
- Streaming encrypt
Depends: F[G.03]

### F[K.08] Backup Catalog UI — [P2] M
Browse backup tree, xem file, restore từng file/folder.
- Tree view backup snapshot
- File preview
Depends: F[K.01]

### F[K.09] Off-site Backup Rotation — [P3] S
Rotation 3-2-1 backup: 3 copy, 2 media, 1 offsite (cloud).
- Multi-target backup
Depends: F[K.03]

---

## L. Performance & Scale

### F[L.01] Parallel Sync across Connections — [P1] M
Sync nhiều connection song song (hiện từng cái 1), global queue.
- Global PQueue với total concurrency limit
- Priority per connection
Depends: Phase 3.1

### F[L.02] Memory-mapped File Reading — [P2] M
Cho file lớn, dùng mmap để không load vào RAM.
- `mmap-io` hoặc Node stream
- Reduce memory spike
Depends: Phase 3.1

### F[L.03] Worker Thread cho Scan & Hash — [P0] M
Kích hoạt lại `diff.worker.ts` (hiện không dùng) để scan/hash không block main thread.
- Worker pool cho multi-connection scan
- Result streaming
Depends: Phase 3.5
Tasks:
- [ ] Integrate worker vào `files.ts` route
- [ ] Worker pool management
- [ ] Progress reporting from worker

### F[L.04] Globally Limit Concurrent Connections — [P1] S
Tổng số connection mở qua mọi profile có ceiling (vd 50), tránh tràn FTP server.
- Semaphore global
- Queue connection request
Depends: Phase 3.1

### F[L.05] Lazy Load Routes — [P1] S
`React.lazy` + `Suspense` cho terminal, dashboard, connection manager.
- Giảm bundle init
- Terminal session giữ trong store, không cần giữ DOM
Depends: Phase 3.4

### F[L.06] Code-split Monaco — [P1] S
Monaco lazy load chỉ khi mở editor/diff, giảm bundle.
- Bỏ `scripts/copy-monaco.js` manual copy
- Dùng `@monaco-editor/react` native lazy
Depends: Phase 3.4

### F[L.07] Disk-backed Cache cho large diff — [P2] M
Khi diff quá lớn (file > 10000), cache kết quả scan ra disk để không re-scan.
- LRU disk cache
- Invalidate khi file change
Depends: Phase 3.6

### F[L.08] Incremental Scan (only changed) — [P1] M
Scan chỉ file thay đổi từ lần scan trước (dựa mtime), không full scan lại.
- Already có `local_file_cache` — extend
- Watcher event trigger re-scan chỉ file affected
Depends: Phase 3.1

### F[L.09] Connection Warmup Pool — [P2] S
Pool connection pre-warmed sẵn, mượn ngay khi sync (đã có pre-warming — extend cross-connection).
Depends: Phase 3.1

### F[L.10] Benchmark Suite — [P2] S
Benchmark tự động cho sync/deploy/scan, regress detect.
- `vitest bench`
- CI report
Depends: Phase 1.1

### F[L.11] Bundle Size Monitor — [P3] S
CI report bundle size, alert khi tăng quá N%.
- `vite-bundle-visualizer`
Depends: Phase 1.4

### F[L.12] Memory Profiling — [P3] S
Tool đo memory khi sync lớn, leak detection.
- Built-in `--inspect` flag
- Heap snapshot
Depends: Phase 3.1

---

## Ma trận ưu tiên & Lịch trình

### Release v2.0 (Foundation + P0)
> Mục tiêu: sau khi ROADMAP Phase 1–3 xong, ship bản feature-rich đầu tiên.

| ID | Feature | Phần | Est |
|---|---|---|---|
| F[A.01] | Delta/Block-level Sync | Sync | L |
| F[A.02] | Bandwidth Throttling & Scheduler | Sync | S |
| F[A.06] | Chunked/Resumable Upload | Sync | M |
| F[A.09] | Conflict Resolution UI 3-way | Sync | M |
| F[B.01] | Remote File Editor | File | M |
| F[B.04] | Remote File Search | File | M |
| F[B.07] | Checksum Verification | File | S |
| F[B.09] | Dual-Pane Commander View | File | L |
| F[C.01] | SSH Port Forwarding UI | Terminal | M |
| F[C.02] | SSH Key Management | Terminal | M |
| F[D.01] | Multi-environment Deploy | Deploy | M |
| F[D.02] | Deploy Hooks pre/post | Deploy | S |
| F[E.01] | Connection Health Monitor | Monitor | M |
| F[E.03] | Alert System đa kênh | Monitor | M |
| F[F.02] | AI Explain Error Logs | AI | S |
| F[G.02] | OS Keystore | Security | M |
| F[H.01] | CLI Tool `omnisync-cli` | DX | L |
| F[H.02] | REST API Docs (OpenAPI) | DX | M |
| F[I.01] | Command Palette (Cmd+K) | UI | M |
| F[I.04] | Notification Center | UI | S |
| F[I.07] | Settings Page | UI | M |
| F[J.01] | Web UI Mode | Platform | L |
| F[J.05] | Cloud Storage (S3/B2) | Platform | L |
| F[J.10] | Auto-update Electron | Platform | S |
| F[J.11] | Scheduled Task Cron | Platform | S |
| F[K.01] | Automatic Backup pre-Sync | Backup | M |
| F[K.07] | Backup Encryption | Backup | S |
| F[L.03] | Worker Thread Scan & Hash | Perf | M |

**Tổng est v2.0:** ~12–16 tuần nếu 1 dev; ~6–8 tuần nếu 2 dev song song.

### Release v2.1 (High value P1)
F[A.03] Sync Presets, F[A.07] Sync History, F[A.11] Dry-Run, F[B.03] File Preview, F[B.06] CHMOD UI, F[B.13] Dir Size, F[C.03] Agent Forwarding, F[C.05] SSH Command Exec, F[C.07] Snippet Library upgrade, F[D.04] Rollback any version, F[D.06] Deploy Notifications, F[E.02] Disk Monitor, F[E.04] Webhook Notify, F[E.05] Activity Timeline, F[E.07] Real-time Transfer Graph, F[E.08] Sync Failure Report, F[F.01] AI Terminal Assistant, F[F.06] Local LLM (Ollama), F[F.07] AI Multi-file Diff, F[G.01] 2FA TOTP, F[G.05] Session Lock, F[G.07] Audit Trail, F[H.03] Webhook API, F[H.04] Git Integration, F[H.05] Docker Image, F[I.02] Keyboard Shortcuts, F[I.03] Status Bar, F[I.05] Onboarding, F[I.06] Empty States, F[I.08] Dark/Light, F[I.09] i18n, F[I.10] Quick Toolbar, F[I.11] Tabbed Multi-conn, F[I.13] Spotlight Search, F[I.14] Tray Quick Actions, F[J.03] Background Service, F[J.06] WebDAV, F[J.12] Native Notif, F[K.02] Point-in-time Recovery, F[K.03] Backup to Cloud, F[K.05] Restore Wizard, F[L.01] Parallel Cross-conn, F[L.04] Global Conn Limit, F[L.05] Lazy Routes, F[L.06] Code-split Monaco, F[L.08] Incremental Scan

### Release v2.2+ (P2/P3 theo nhu cầu)
F[A.10] Bandwidth Dashboard, F[A.12] Auto-pause mạng yếu, F[A.13] Priority Queue, F[B.02] Multi-tab Editor, F[B.05] Bulk Rename, F[B.08] Archive Ops, F[B.10] File Tags, F[B.12] File Compare, F[B.14] Integrity Scan, F[C.04] SSH Config Import, F[C.06] Terminal Recording, F[C.08] Multi-hop SSH, F[C.09] SFTP Bookmarks, F[D.05] Blue-Green, F[D.08] Stack-specific Deploy, F[D.09] Deploy Calendar, F[D.10] Scheduled Deploy, F[E.06] Remote Load Monitor, F[E.09] SLA Badge, F[E.10] Anomaly Detect, F[F.03] AI Sync Strategy, F[F.04] AI Anomaly, F[F.05] AI Deploy Script, F[F.08] AI Chat, F[F.09] AI Code Review, F[G.03] Client-side Encrypt, F[G.06] Multi-user Team, F[H.06] MCP Server, F[H.08] SDK, F[H.09] Script Engine, F[I.12] Context Menu, F[I.16] Connection Grouping, F[I.18] Workspace mode, F[J.02] Mobile Companion, F[J.04] Cross-device Config, F[J.07] Google Drive, F[J.09] Local Cache Mode, F[J.13] Crash Reporter, F[K.06] Selective Backup, F[K.08] Backup Catalog, F[L.02] Mmap, F[L.07] Disk Cache, F[L.10] Benchmark Suite

### Future (P3 lớn)
F[A.14] Smart Batch, F[B.11] Recent Files, F[C.11] SSH Tunnel Manager, F[C.12] Web Terminal, F[D.08] Zero-downtime Stack, F[F.10] AI Smart Filename, F[G.04] PGP Sign, F[G.11] Secret Scanner, F[H.07] Plugin System, F[H.10] Speed Benchmark, F[H.11] Vercel Deploy, F[H.12] npm Script Runner, F[I.17] Pin Files, F[J.08] Mount as Drive, F[J.14] Telemetry, F[K.09] Off-site Rotation, F[L.11] Bundle Monitor, F[L.12] Memory Profiling

---

## Dependency graph

```
ROADMAP Phase 0 (cleanup) ─┐
                           ├─► Phase 1 (test, strict, migration, CI) ─┐
                           │                                          ├─► Phase 2 (auth, encryption) ─┐
                           │                                          │                                  ├─► Phase 3 (refactor, zustand, gộp persistence, dedup)
                           │                                          │                                  │
                           ▼                                          ▼                                  ▼
                        F[J.10] Auto-update                       F[G.01] 2FA, F[G.02] Keystore     F[A.01] Delta, F[A.06] Chunked
                                                                                                  F[A.09] Conflict UI
                                                                                                  F[B.09] Commander, F[I.01] Cmd-K
                                                                                                  F[J.01] Web Mode, F[J.05] Cloud Storage
                                                                                                  F[L.03] Worker Thread
                                                                                                        │
                                                                                                        ▼
                                                                                                  F[D.01] Multi-env Deploy ← F[C.05] SSH Exec ← F[C.02] SSH Keys
                                                                                                  F[E.01] Health Monitor → F[E.03] Alert → F[I.04] Notif Center
                                                                                                  F[F.02] AI Error → F[F.06] LLM Provider → F[F.01] AI Terminal
                                                                                                  F[H.01] CLI, F[H.02] OpenAPI → F[H.06] MCP, F[H.08] SDK
                                                                                                  F[K.01] Auto Backup → F[K.02] PITR, F[K.03] Cloud Backup → F[K.05] Restore Wizard
```

**Quy tắc phụ thuộc:**
- Mọi feature thuộc sync/file/deploy cần `Phase 3.1` (tách SyncService) xong để không conflict với refactor.
- Feature security (F[G.x]) cần `Phase 2` xong.
- Feature UI (F[I.x]) cần `Phase 3.4` (zustand) để state tập trung.
- Feature platform (F[J.x]) multi-protocol cần `Phase 3.1` (`TransferClient` interface clean).
- Feature AI (F[F.x]) cần `Phase 3.4` cho settings store.

---

## Ghi chú thực thi

- **Mỗi feature = 1 branch + 1 PR** — review độc lập.
- **Mỗi PR phải có**: test (Phase 1 vitest), CHANGELOG entry, docs update, screenshot (nếu UI).
- **Version bump**: patch cho bugfix, minor cho feature, major cho breaking change.
- **Update `ROADMAP2.md` checkbox** khi feature done.
- **Đo lường**: mỗi release report KPI (sync speed, bandwidth saved, error rate, user satisfaction).

---

*ROADMAP2 là living document — ưu tiên có thể thay đổi theo feedback user và nhu cầu thực tế. Mỗi feature hoàn thành nên review lại priority của feature còn lại.*
