# OmniSync — ROADMAP 3: Terminal Power-Up

> Tài liệu nâng cấp terminal thành workstation-class SSH client, tổng hợp tinh hoa từ iTerm2, Warp, Tabby, Termius, MobaXterm, Kitty, Tmux, Zellij, Windows Terminal, Royal TSX.
>
> Cập nhật: 2026-07-12 · Target: biến terminal OmniSync thành công cụ SSH/SFTP hàng đầu cho developer & sysadmin
>
> Companion: `ROADMAP.md` (foundation), `ROADMAP2.md` (feature tổng quát). File này chỉ về terminal.

---

## Mục lục
1. [Tình trạng terminal hiện tại](#1-tình-trạng-terminal-hiện-tại)
2. [Tham chiếu tinh hoa từ các tool](#2-tham-chiếu-tinh-hoa-từ-các-tool)
3. [Tiers ưu tiên](#3-tiers-ưu-tiên)
4. [A. Core Terminal Engine](#a-core-terminal-engine)
5. [B. Multi-session & Layout](#b-multi-session--layout)
6. [C. SSH Connection Power](#c-ssh-connection-power)
7. [D. SFTP & File Transfer](#d-sftp--file-transfer)
8. [E. AI Copilot cho Terminal](#e-ai-copilot-cho-terminal)
9. [F. Command History & Snippets](#f-command-history--snippets)
10. [G. Search & Navigation](#g-search--navigation)
11. [H. Monitoring & Visualization](#h-monitoring--visualization)
12. [I. Port Forwarding & Tunnel](#i-port-forwarding--tunnel)
13. [J. Security & Access](#j-security--access)
14. [K. Automation & Scripting](#k-automation--scripting)
15. [L. Collaboration & Sharing](#l-collaboration--sharing)
16. [M. UI/UX Polish](#m-uiux-polish)
17. [N. Integration & Platform](#n-integration--platform)
18. [O. Remote Development](#o-remote-development)
19. [P. Terminal Ecosystem](#p-terminal-ecosystem)
20. [Ma trận ưu tiên](#ma-trận-ưu-tiên)
21. [Tham chiếu tool nguồn](#tham-chiếu-tool-nguồn)

---

## 1. Tình trạng terminal hiện tại

### Đã có (từ audit code)
| Feature | File | Ghi chú |
|---|---|---|
| SSH shell PTY (xterm-256color) | `SSHTerminalService.ts:171` | ssh2, keepalive 10s |
| Multi-tab | `TerminalView.tsx` | Tab CRUD, persist localStorage |
| Split view (H/V) | `SplitContainer.tsx` | 2 pane, không grid tự do |
| Quick connect | `SSHTerminalService.ts:74` | Không cần DB |
| Session persistence | `SSHTerminalService.ts:269` | attach/detach, 100KB buffer, 10min cleanup |
| Reconnect auto | `TerminalPane.tsx:136` | Exponential backoff 3s→30s |
| xterm addons | `TerminalPane.tsx:93-99` | Fit, WebLinks, Search |
| SFTP ops | `SSHTerminalService.ts:718-1003` | list, stat, mkdir, rm, rmdir, rename, chmod |
| Sudo fallback | `SSHTerminalService.ts:492` | `sudo -S -p ""` với password |
| Upload drag-drop | `TerminalPane.tsx` | SFTP fastPut, progress |
| Remote file editor | `RemoteFileEditor.tsx` | Monaco editor |
| SFTP browser panel | `SftpFileBrowser.tsx` | Side panel |
| getCwd heuristic | `SSHTerminalService.ts:319` | /proc → lsof → pwd |
| execCommand | `SSHTerminalService.ts:946` | 1-shot command |
| getRemoteDirSize | `SSHTerminalService.ts:1006` | du -sb + SFTP fallback |
| Command snippets | `terminal.ts:522` | CRUD + use_count |
| WS fast-path | `WebSocketService.ts:37` | `D:`/`O:` prefix, tránh JSON overhead |
| Download file | `SSHTerminalService.ts:534` | Binary-safe |
| Context menu | `TerminalPane.tsx:47` | Copy/paste cơ bản |

### Thiếu / yếu (gap)
- Không có: scrollback search nâng cao, command history persistent, snippet template với biến, multi-hop SSH, agent forwarding, port forward (table dead), keygen, terminal recording, session lock, audit log, live monitor (top/htop), log viewer, file watcher, clipboard history, autocomplete, syntax highlight output, themes, profiles, keyboard customization, broadcast input, snapshot, export, find in scrollback, regex search, mark/jump, tmux integration, zellij, custom keybindings, font ligature, truecolor picker, hyperlinks, OSC sequences, notification bell, idle detect, session rename, session group, connection group, proxy jump, SOCKS, health dashboard, reconnect queue, credential rotation, SSH config import, known_hosts mgmt, fingerprint verify, 2FA SSH, MFA, session share, co-browsing, terminal cast (asciinema), macro recorder, expect script, autossh keepalive, connection multiplexing, SCP, rsync, tar streaming, checksum, diff remote file, image preview, PDF preview, hex viewer, binary diff, file watcher trigger, log tail, journalctl, docker exec, kubectl exec, database client, REST client, port scanner, process manager, cron editor, env var manager, workspace, project mode, etc.

---

## 2. Tham chiếu tinh hoa từ các tool

| Tool | Tinh hoa áp dụng |
|---|---|
| **iTerm2** | Split pane grid, Hotkey window, semantic history, Triggers (regex → action), Badge, Status bar, Copy mode, mouseless copy, profile per host, dynamic profile, badge, tips, semantic prompts, Shell Integration, password manager, imgcat, edit in place |
| **Warp** | AI command suggestion, block-based output (mỗi command = 1 block), command search, workflow sharing, command palette, input as IDE (multi-line editor), real-time AI explain |
| **Tabby** | Plugin system, profile, serial port, Telnet, RDP/VNC, connection group, macro, autocomplete, XOR color scheme, terminal themes marketplace |
| **Termius** | Cloud sync, snippets sync, SFTP, port forward, agent forwarding, key generation, server grouping, tags, sync across devices, terminal themes, font custom, import from Putty/SSH config |
| **MobaXterm** | X11 forwarding, built-in SFTP browser (side panel), macro recorder, session saved, multi-exec (broadcast), diff local-remote, SCP, rsync, built-in tools (cygwin), tabs, snippet, RDP/VNC, FTP, serial, Wake-on-LAN, network scanner |
| **Kitty** | GPU rendering, image in terminal, remote control protocol, kitten (plugin), session restore, layout stack/queue/grid/tall, hyperlinks, scrollback pager, OSC, truecolor, font ligature |
| **Tmux** | Session persistent, window, pane, layout, copy mode, buffer, hook, plugin, scripting, status bar, mouse support, popup, menu |
| **Zellij** | Layout declarative, plugin (WASM), floating panes, session resurrection, command palette, tab, constraints, mode indicator |
| **Windows Terminal** | Profile JSON, color scheme, font face, acrylic, tab coloring, command palette, quake mode, pane zoom, focus mode |
| **Royal TSX** | Credential management, folder hierarchy, task, template, ad-hoc command, credential injection, dynamic folder, script runner |
| **Alacritty** | GPU rendering, config TOML, ligature, vi mode, truecolor, scrollback, live config reload |
| **Hyper** | Plugin (JS), theme, layout, hotkey, extensible |
| **WezTerm** | Multiplexer, tab navigator, workspace, key table, domain (SSH), pane zoom, ligature, color scheme, font fallback, image protocol, ssh domain, builtin mux |
| **PowerShell ISE / VS Code** | Integrated terminal, snippet, debugger, IntelliSense |

---

## 3. Tiers ưu tiên

| Tier | Ý nghĩa | Số features |
|---|---|---|
| P0 | Must-have cho terminal-first release | ~25 |
| P1 | High-value, release kế tiếp | ~35 |
| P2 | Should-have, theo nhu cầu | ~35 |
| P3 | Nice-to-have, future | ~30 |
| **Tổng** | | **~125 features** |

---

## A. Core Terminal Engine

### F[T.A.01] GPU/WebGL Rendering — [P0] M
Thay canvas 2D bằng WebGL renderer cho terminal lớn (100K dòng scrollback) mượt.
- xterm `@xterm/addon-webgl` hoặc `@xterm/addon-canvas`
- Benchmark: render 10K dòng < 100ms
- Fallback canvas 2D nếu WebGL unavailable
Depends: none
Tasks:
- [ ] Cài `@xterm/addon-webgl`
- [ ] Detect WebGL support, fallback
- [ ] Benchmark before/after

### F[T.A.02] Unicode 11 + Grapheme Cluster — [P0] S
xterm mới đã support, enable để hiển thị emoji, CJK, ZWJ đúng (hiện font JetBrains Mono).
- Cập nhật xterm lên bản mới nhất
- Test: emoji 👨‍👩‍👧, Vietnamese ơ à, CJK 终端
Depends: none

### F[T.A.03] TrueColor + Color Scheme Manager — [P0] M
Support 24-bit color (truecolor), marketplace theme like iTerm2.
- Built-in themes: Dracula, Solarized, Monokai, Nord, Tokyo Night, Gruvbox, Catppuccin, One Dark, GitHub Dark, OmniSync HUD (hiện tại)
- Color picker custom
- Import iTerm2 `.itermcolors` / `.json` scheme
- Preview live
Depends: none
Tasks:
- [ ] Theme store (zustand)
- [ ] 20 preset themes
- [ ] Import/export format iTerm2, Alacritty, Windows Terminal
- [ ] Live preview

### F[T.A.04] Font Manager + Ligature — [P0] M
Font picker, Fira Code ligature, fallback chain, powerline/Nerd Font.
- Font dropdown + preview
- Ligature toggle (Fira Code, JetBrains Mono Ligatures)
- Nerd Font detect (powerline symbol)
- Font fallback list (CJK, emoji)
- Size + lineHeight + letterSpacing slider
Depends: F[T.A.03]
Tasks:
- [ ] Font settings panel
- [ ] Ligature enable via xterm `fontLigatures`
- [ ] Nerd Font glyph test

### F[T.A.05] Custom Keybindings — [P0] M
Tất cả action có shortcut, user edit được.
- Default: Ctrl+Shift+C copy, Ctrl+Shift+V paste, Ctrl+Shift+F search, Ctrl+Shift+Space palette
- Conflict detect
- Keymap import/export (iTerm2, Windows Terminal format)
- Per-profile override
Depends: none
Tasks:
- [ ] Keybinding store + registry
- [ ] Conflict detection
- [ ] Settings UI editor

### F[T.A.06] Scrollback nâng cao — [P0] M
Scrollback lên 100K dòng, pager mode (less-like), export.
- Configurable scrollback (default 10000, up to 100000)
- Scrollback pager: dùng xterm search + jump
- Export scrollback ra file (txt, ansi, html)
- Clear scrollback button
Depends: F[T.A.01]

### F[T.A.07] Copy Mode (mouseless) — [P0] M
Vào copy mode (vim-like), di chuyển selection bằng keyboard.
- Toggle: Ctrl+Shift+Enter
- Vim motion: h/j/k/l, w/b, 0/$, gg/G
- Selection: v (char), V (line), Ctrl+V (block)
- Yank to clipboard: y
- Search trong copy mode: / forward, ? backward
Depends: F[T.A.05]

### F[T.A.08] Triggers (regex → action) — [P1] M
Khi output match regex → action (highlight, notify, sound, run command).
Ví dụ: match `ERROR.*` → highlight đỏ + notify; match `password:` → auto-fill.
- Trigger list per profile
- Action: highlight, notify, beep, copy match, run snippet, pause
- Regex test tool
Depends: F[T.A.05]

### F[T.A.09] Mark & Jump — [P1] S
Đánh dấu trong scrollback, jump nhanh.
- Auto-mark: mỗi command xong → mark
- Jump: next/prev mark (Ctrl+↓/↑)
- Manual mark (Ctrl+Shift+M)
- Mark list sidebar
Depends: F[T.A.06]

### F[T.A.10] Block-based Output (Warp-like) — [P1] L
Mỗi command + output = 1 block, click để copy chỉ block đó, scroll giữa command.
- Cần Shell Integration (F[T.F.08]) để detect command boundary
- Block: command line + output + exit code + duration
- Click block → copy, re-run, explain with AI
- Collapse block
Depends: F[T.F.08], F[T.A.06]

### F[T.A.11] Semantic History — [P2] M
Click file path trong output → mở editor; click error → xem docs.
- Regex recognize: file:line, URL, git hash, IP, port
- Click → action (open editor, open browser, copy)
- Configurable recognizer
Depends: F[T.A.10]

### F[T.A.12] Status Bar trong terminal — [P1] S
Bottom bar: cwd, host, user, git branch, exit code last, duration, clock.
- Shell integration gửi status qua OSC 1337 / OSC 9;9
- Render bar xterm `overviewRuler` hoặc HTML overlay
Depends: F[T.F.08]

### F[T.A.13] Bell & Notification — [P1] S
Bell (^G) → sound + visual + system notification khi terminal ở background.
- Config: sound file, volume, visual style
- "Quiet hours" schedule
- Notification khi long command xong (dựa shell integration)
Depends: F[T.F.08]

### F[T.A.14] Idle Detection & Auto-lock — [P1] S
Phát hiện idle (no input N phút), lock terminal (yêu cầu master password).
- Config idle timeout
- Lock overlay (blur + password)
- "Keep alive" ping prevent sleep
Depends: ROADMAP Phase 2.1

### F[T.A.15] Hyperlink Detection nâng cao — [P1] S
WebLinksAddon hiện có, mở rộng: file path, URL với port, SSH URL, email, IPv6, magnet link.
- Custom regex
- Click → copy / open / download
- Hover preview tooltip (URL title, file size)
Depends: F[T.A.11]

### F[T.A.16] Image Protocol (iTerm2/ Kitty) — [P2] M
Hiển thị image inline trong terminal (imgcat-like).
- iterm2 protocol (`OSC 1337`) + Kitty graphics protocol
- Drag image → hiển thị
- `cat image.png | display` streaming
- Sixel graphics
Depends: F[T.A.01]

### F[T.A.17] Profile System — [P0] L
Profile = preset (theme, font, keybinding, env, shell command, color, tab title).
- Profile per connection hoặc per group
- Dynamic profile (import folder)
- Profile inheritance (base + override)
- Quick switch profile
Depends: F[T.A.03], F[T.A.04], F[T.A.05]
Tasks:
- [ ] Profile table + store
- [ ] Profile manager UI
- [ ] Apply profile to session

### F[T.A.18] OSC Sequence Support — [P1] M
Hỗ trợ đầy đủ OSC: title, cwd, color, hyperlink, notification, image.
- OSC 0/2: title
- OSC 7: cwd (ghi history)
- OSC 8: hyperlink
- OSC 9: notification
- OSC 1337: image, mark
- OSC 133: prompt mark (shell integration)
Depends: F[T.F.08]

### F[T.A.19] Quake / Dropdown Mode — [P2] M
Terminal toggle global bằng hotkey (Ctrl+`) thả xuống từ trên (Quake-style).
- Global hotkey (Electron globalShortcut)
- Slide animation
- Pin position
- Multi-monitor
Depends: Electron

### F[T.A.20] Focus Mode — [P2] S
Ẩn tab bar, status bar, chỉ terminal fullscreen.
- Toggle: F11 hoặc Ctrl+Shift+F11
- Exit: Esc hoặc toggle lại
Depends: none

### F[T.A.21] Zoom Terminal — [P1] S
Zoom in/out font (Ctrl+= / Ctrl+-), reset (Ctrl+0).
- Per-session zoom (không ảnh hưởng profile)
- Pinch zoom (trackpad)
Depends: F[T.A.04]

### F[T.A.22] Mouse Support nâng cao — [P1] S
Click select word/line/URL, right-click context menu, scroll smooth.
- Triple-click select line
- Ctrl+click URL open
- Shift+click extend selection
- Scroll speed config
Depends: F[T.A.15]

### F[T.A.23] Bracketed Paste — [P0] S
Hỗ trợ bracketed paste mode (ESC[200~ ... ESC[201~) để paste multi-line an toàn.
- xterm đã support, enable
- Detect bracket paste, confirm trước khi paste lớn
Depends: none

### F[T.A.24] Line-based Input Editor — [P2] M
Input multi-line như IDE (Warp), Ctrl+Enter gửi, Shift+Enter xuống dòng.
- Input box overlay trên terminal
- Syntax highlight (shell)
- History navigate trong input box
- Multi-line paste → edit trước send
Depends: F[T.A.10]

---

## B. Multi-session & Layout

### F[T.B.01] Grid Split (N-pane) — [P0] M
Split tự do thành grid N x M pane (hiện chỉ 2 pane H/V).
- Split active pane: Ctrl+Shift+D
- Layout preset: 2-up, 2x2, 3x1, tall-left, tall-right
- Resize pane (drag border, Alt+arrow)
- Move focus (Alt+arrow)
- Close pane
Depends: F[T.B.05]
Tasks:
- [ ] Layout engine (flexbox grid)
- [ ] Pane focus management
- [ ] Resize handle

### F[T.B.02] Tab Grouping & Coloring — [P0] S
Tab group theo connection, color tag, drag reorder.
- Color per tab (match profile)
- Group folder (collapse)
- Drag tab between group
- Tab pin (no close)
Depends: F[T.A.17]

### F[T.B.03] Session Rename & Title — [P1] S
Đổi tên tab manually, auto title từ OSC 0/2 hoặc command.
- Double-click tab → rename
- Auto: host, cwd, command running
- Title template: `${host}:${cwd} (${cmd})`
Depends: F[T.A.18]

### F[T.B.04] Session Restore on Restart — [P0] M
Khởi động lại app → restore toàn bộ tab + split + session SSH.
- Hiện persist tab localStorage, nhưng session backend chết → cần reconnect
- Auto-reconnect all session on app start
- Background reconnect (progress indicator)
Depends: F[T.B.01]

### F[T.B.05] Tab Persistence Backend — [P0] M
Lưu tab/split state vào DB (không chỉ localStorage) để cross-device.
- Table `terminal_layouts (id, name, config JSON, created_at)`
- Named layout (save/load)
- Default layout on startup
Depends: ROADMAP Phase 3.4 (zustand)

### F[T.B.06] Broadcast Input — [P1] S
Gõ 1 lần → gửi đến nhiều session (mobaXterm multi-exec).
- Toggle broadcast mode
- Select target session
- Warning khi dangerous command
- Visual indicator "BROADCAST"
Depends: F[T.B.01]

### F[T.B.07] Synchronized Scroll — [P2] S
Scroll 1 pane → scroll tất cả pane sync (so sánh log 2 server).
Depends: F[T.B.01]

### F[T.B.08] Pane Zoom — [P1] S
Zoom 1 pane fullscreen tạm thời, Esc quay lại grid.
- Ctrl+Shift+Z toggle
- Smooth transition
Depends: F[T.B.01]

### F[T.B.09] Floating Pane (Zellij-like) — [P2] M
Pane floating overlay trên layout (popup), drag move, resize.
- Toggle float: Ctrl+Shift+F
- Stack order
- Pin float
Depends: F[T.B.01]

### F[T.B.10] Layout Template — [P1] S
Save layout hiện tại thành template, apply cho connection khác.
- Template: pane count + arrangement + per-pane command
- Apply: pick connection per pane
- Marketplace template (vd "4 log tail", "dev split")
Depends: F[T.B.05]

### F[T.B.11] Workspace (Project mode) — [P1] M
Workspace = set tabs + layout + connections + env, switch workspace đổi context.
- Table `terminal_workspaces`
- Switch instant
- Recent workspace
Depends: F[T.B.05]

### F[T.B.12] Hotkey Window — [P1] M
Global hotkey (Ctrl+`) toggle 1 "hotkey terminal" luôn sẵn sàng.
- Separate window, always-on-top option
- Quake dropdown animation
- Independent from main window
Depends: F[T.A.19]

### F[T.B.13] Tab Preview (hover) — [P2] S
Hover tab → thumbnail preview pane content.
- Capture xterm canvas → thumbnail
- Hover delay 500ms
Depends: F[T.B.01]

### F[T.B.14] Session Sidebar (tree) — [P1] M
Sidebar tree: connection → session, drag session vào tab/split.
- Tree: group > connection > session
- Drag session to pane
- Right-click: duplicate, close, rename
Depends: F[T.B.02]

### F[T.B.15] Reconnect Queue — [P0] S
Khi mạng về, auto-reconnect queue tất cả session bị disconnect.
- Queue list visible
- Retry with backoff
- Cancel reconnect
Depends: F[T.B.04]

---

## C. SSH Connection Power

### F[T.C.01] SSH Key Management UI — [P0] M
Generate/import/export SSH key (RSA, Ed25519, ECDSA, DSA).
- Generate: key type, bits, comment, passphrase
- Import: from file, paste
- Export: public key copy, private key download
- Install to remote (`ssh-copy-id` style)
- Test key against host
Depends: ROADMAP Phase 2.2
Tasks:
- [ ] `SSHKeyService.ts` (ssh2 keygen)
- [ ] Key manager UI wizard
- [ ] Install public key flow
- [ ] Test connection with key

### F[T.C.02] SSH Config Import/Export — [P0] M
Parse `~/.ssh/config`, import thành connection.
- Parse: Host, HostName, User, Port, IdentityFile, ProxyJump, ForwardAgent, LocalForward
- Import → tạo `ftp_connections` rows
- Export → generate config
- 2-way sync (optional)
Depends: F[T.C.01]

### F[T.C.03] Known Hosts Management — [P0] M
Quản lý `known_hosts`, verify fingerprint, accept/reject.
- Show: host, key type, fingerprint
- Compare với server key
- Accept once / always / reject
- Clear entry
- Strict mode (reject unknown)
Depends: F[T.C.01]

### F[T.C.04] Multi-hop / Jump Host (ProxyJump) — [P0] L
SSH qua bastion → target (common trong production).
- ssh2 chain: connect bastion → from bastion connect target
- UI: hop list trong connection form
- Test chain
- Per-hop timeout
Depends: F[T.C.01]
Tasks:
- [ ] `JumpChainService.ts`
- [ ] Hop config UI
- [ ] Connect via chain

### F[T.C.05] Agent Forwarding — [P1] S
Forward SSH agent để SSH từ remote không cần key trên remote.
- Toggle per connection
- ssh2 `agentForward` option
- Warning security
Depends: F[T.C.01]

### F[T.C.06] SSH Agent Built-in — [P1] M
Built-in SSH agent (proxy) quản lý key trong app, không cần OS agent.
- Load key vào agent
- Sign request from remote SSH
- List loaded key
- Auto-add on connect
Depends: F[T.C.01]

### F[T.C.07] Connection Multiplexing (ControlMaster) — [P1] M
Nhiều session chia sẻ 1 SSH connection (giảm overhead).
- 1 SSH client per host:port:user
- Multiple shell stream từ 1 client
- Auto-dedup
Depends: F[T.C.01]
Tasks:
- [ ] `ConnectionPool` per (host, port, user)
- [ ] Stream multiplex
- [ ] Ref count + cleanup

### F[T.C.08] Auto-reconnect (autossh-like) — [P0] S
Reconnect SSH tự động khi mạng reset, giữ session.
- Detect disconnect, retry with backoff
- Preserve session state (cwd, env)
- Exponential backoff + max retry
- Visible status
Depends: F[T.B.15]

### F[T.C.09] Connection Health Check — [P0] S
Ping SSH mỗi 30s, status badge green/yellow/red.
- ServerAlive ping
- Latency measure
- Alert khi down N phút
Depends: F[T.C.08]

### F[T.C.10] 2FA / TOTP cho SSH — [P2] M
Hỗ trợ SSH server có 2FA (keyboard-interactive) → auto-fill TOTP.
- Detect 2FA prompt
- TOTP generate từ secret (lưu trong app)
- Auto-fill hoặc manual
Depends: F[T.C.01]

### F[T.C.11] Credential Rotation Reminder — [P2] S
Nhắc đổi password/key sau N ngày.
- Track last-change date
- Notify khi quá threshold
- Generate new key button
Depends: F[T.C.01]

### F[T.C.12] SSH Protocol v1 fallback — [P3] S
Hỗ trợ SSH v1 (legacy server). Hiếm nhưng đôi khi cần.
Depends: F[T.C.01]

### F[T.C.13] SSH Compression — [P1] S
Enable zlib compression cho SSH connection (chậm mạng).
- Toggle per connection
- Auto-detect (slow link)
Depends: none

### F[T.C.14] Keepalive Tunable — [P0] S
Config keepalive interval, count max (hiện hardcode 10s/3).
- Per connection
- Adaptive (detect NAT timeout)
Depends: F[T.C.08]

### F[T.C.15] Connection Tag & Group — [P0] S
Tag/group connection (Production, Personal, Client A), filter, bulk action.
- Tag list
- Filter by tag
- Color per group
Depends: F[T.B.02]

### F[T.C.16] Connection Search & Filter — [P1] S
Search connection theo host, name, tag, last-used.
- Search bar trong sidebar
- Recent used section
- Favorite pin
Depends: F[T.C.15]

### F[T.C.17] Duplicate Connection — [P1] S
Clone connection config, đổi name/host.
- Right-click duplicate
- Edit clone
Depends: none

### F[T.C.18] Connection Import (PuTTY, Termius, MobaXterm) — [P1] M
Import session từ tool khác để migrate.
- PuTTY registry export
- Termius JSON
- MobaXterm ini
- FileZilla sitemanager.xml
Depends: F[T.C.02]

### F[T.C.19] Quick Connect History — [P1] S
Lịch sử quick connect, click reconnect nhanh.
- Recent list
- Pin favorite
- Auto-suggest (host, user)
Depends: none

### F[T.C.20] Connection Export (share template) — [P1] S
Export connection không kèm password (share template).
- Toggle include credential
- JSON / ssh config format
- QR code (mobile)
Depends: ROADMAP Phase 2.2

### F[T.C.21] Wake-on-LAN — [P2] S
Gửi WoL packet để wake server trước khi SSH.
- MAC address config
- Broadcast address
- Wait for online then SSH
Depends: F[T.C.09]

---

## D. SFTP & File Transfer

### F[T.D.01] SFTP Dual-Pane (commander view) — [P0] L
2 pane local | remote, drag-drop, sync.
- Tree + list mỗi pane
- Drag local → remote upload, ngược lại download
- Multi-select
- Tab để mở nhiều remote
Depends: F[T.B.01]
Tasks:
- [ ] `CommanderLayout.tsx`
- [ ] `LocalPane.tsx`, `RemotePane.tsx`
- [ ] Drag-drop integration
- [ ] Toolbar (copy, move, delete, sync)

### F[T.D.02] SFTP Bookmarks — [P1] S
Lưu path remote hay dùng, navigate nhanh.
- Bookmark panel
- Drag folder vào bookmark
- Alias name
- Per-connection bookmark
Depends: F[T.D.01]

### F[T.D.03] SFTP Search (filename + content) — [P0] M
Search file remote theo tên hoặc nội dung.
- Filename: `LIST -R` + filter
- Content: download + grep local hoặc SSH `grep -r`
- Index option: `remote_file_index` table
- Result preview
Depends: ROADMAP Phase 3.6

### F[T.D.04] CHMOD UI (visual) — [P1] S
Checkbox rwxrwxrwx thay vì nhập octal.
- Visual 3x3 checkbox (owner/group/other)
- Octal preview
- Presets: 644, 755, 600, 440
- Recursive toggle
- Apply cho multi-select
Depends: F[T.D.01]

### F[T.D.05] SFTP File Preview — [P1] M
Preview image/PDF/video/code/text không download.
- Image: blob URL
- PDF: pdf.js
- Video/audio: HTML5 stream
- Code: Monaco read-only + syntax
- Markdown: render
- CSV: table
Depends: F[T.D.01]

### F[T.D.06] SFTP Bulk Rename — [P2] S
Rename nhiều file theo pattern (regex, sequence, find/replace).
- Preview trước apply
- Undo (rename ngược)
- Pattern: `${index}`, `${date}`, regex
Depends: F[T.D.01]

### F[T.D.07] SFTP File Compare (2 remote file) — [P2] S
So sánh 2 file remote, Monaco diff.
- Pick 2 file từ browser
- Side-by-side
- Merge direction
Depends: F[T.D.01]

### F[T.D.08] SFTP Archive (zip/unzip remote) — [P2] M
Tạo zip từ folder remote, unzip upload.
- SSH `tar`/`zip` command
- Download zip, upload zip
- Progress
Depends: F[T.C.05]

### F[T.D.09] SFTP Checksum Verify — [P0] S
Sau transfer, verify checksum local = remote.
- MD5/SHA256
- Mismatch → retry, flag
- Column `checksum_verified` trong queue
Depends: none

### F[T.D.10] SFTP Directory Size Calculator — [P1] S
Tính tổng size + count file folder remote (đệ quy).
- Progress + cancel
- Cache 1h
- Hiện đã có `getRemoteDirSize` — expose UI
Depends: none

### F[T.D.11] SFTP File Tags & Notes — [P2] S
Tag + note cho file remote để dễ tìm.
- Table `file_tags`
- Filter by tag
- Note inline
Depends: ROADMAP Phase 3.6

### F[T.D.12] SFTP Recent / Quick Access — [P2] S
List file vừa truy cập, click mở nhanh.
- Store zustand + localStorage
- Pin file quan trọng
Depends: F[T.D.05]

### F[T.D.13] SFTP Drag-drop upload cải thiện — [P0] S
Drag folder → upload recursive (hiện drag file). Progress per file.
- Detect folder drag
- Build queue recursive
- Progress tree
Depends: F[T.D.01]

### F[T.D.14] SFTP Transfer Queue Manager — [P1] M
Queue tất cả transfer, pause/resume/reorder/priority.
- Queue list UI
- Pause/resume
- Priority drag reorder
- Retry failed
- Bandwidth limit per queue
Depends: F[T.D.01]

### F[T.D.15] SFTP Resume Upload (chunked) — [P0] M
Upload file lớn theo chunk, resume khi mạng lỗi.
- REST command (FTP) / partial seek (SFTP)
- Checksum per chunk
- Track trong `sync_transfer_queue`
- UI: progress per-chunk + overall
Depends: ROADMAP Phase 3.1

### F[T.D.16] SFTP Sync Folder (mini) — [P1] M
Đồng bộ 1 folder local ↔ remote ngay trong terminal (không cần sync service full).
- Compare mtime/size
- Upload/download diff
- Dry-run preview
Depends: F[T.D.01]

### F[T.D.17] SFTP Permissions Bulk — [P1] S
Áp chmod cho nhiều file/folder cùng lúc.
- Multi-select → chmod dialog
- Recursive option
- Different per type (file 644, folder 755)
Depends: F[T.D.04]

### F[T.D.18] SFTP File Watch (remote change detect) — [P2] M
Watch file/folder remote thay đổi (poll stat hoặc inotify via SSH).
- Poll interval config
- Alert khi change
- Auto-tail log option
Depends: F[T.C.09]

### F[T.D.19] SFTP Edit Remote (Monaco) nâng cao — [P0] M
Edit file remote, save upload, multi-tab, conflict check.
- Double-click → editor tab
- Multi-tab editor
- Save → upload (confirm nếu remote changed)
- Diff local edit vs remote before save
- Lock file (advisory)
Depends: F[T.D.01]

### F[T.D.20] SFTP Hex Viewer — [P2] M
Xem file binary dạng hex, edit byte.
- Hex + ASCII view
- Search hex/string
- Edit byte
- Save
Depends: F[T.D.19]

### F[T.D.21] SFTP Symlink Create/Follow — [P1] S
Tạo symlink, follow khi browse.
- Create: ln -s via SFTP/SSH
- Show symlink target
- Follow option
Depends: none

### F[T.D.22] SFTP Quota / Disk Free — [P1] S
Hiển thị disk free remote, quota.
- `df -h` via SSH
- Quota check `quota` command
- Warning khi < 10%
Depends: F[T.C.09]

### F[T.D.23] SFTP Drag-drop Download — [P1] S
Drag file remote → desktop download.
- HTML5 download or Electron file save
- Multi-select
- Folder → zip download
Depends: F[T.D.01]

### F[T.D.24] SFTP Context Menu (right-click) — [P1] S
Right-click file → menu: open, edit, download, rename, delete, chmod, copy path, hash.
- Per-context menu builder
- Customizable
Depends: F[T.D.01]

### F[T.D.25] SFTP Clipboard Path — [P1] S
Copy path file remote (absolute, relative, scp format, sftp uri).
- Right-click → copy path as: absolute, scp `user@host:path`, sftp uri
- Click đường dẫn trong terminal → copy
Depends: F[T.D.24]

---

## E. AI Copilot cho Terminal

### F[T.E.01] AI Command Suggestion (inline) — [P0] L
Gõ natural language → AI suggest shell command.
- Gray text inline suggestion (ghost text)
- Tab accept, Esc dismiss
- Context: cwd, history, OS detect
- Example: "list all php file modified today" → `find . -name '*.php' -mtime 0`
Depends: F[T.F.08] (shell integration cho context)
Tasks:
- [ ] `TerminalCopilot.ts`
- [ ] Ghost text overlay
- [ ] LLM provider (Gemini/Ollama/OpenAI)
- [ ] Context builder

### F[T.E.02] AI Explain Command — [P0] S
Hover command → AI giải thích lệnh + rủi ro.
- Parse current line
- Explain flag, pipe, redirect
- Risk level (destructive?, needs sudo?)
- "Are you sure" warning
Depends: F[T.E.01]

### F[T.E.03] AI Explain Output/Error — [P0] S
Select output → AI giải thích + suggest fix.
- Right-click → "Explain with AI"
- Send context (command + output) → LLM
- Markdown render response
- Cache để không recall
Depends: F[T.E.01]

### F[T.E.04] AI Auto-complete (shell) — [P1] L
Auto-complete command/flag/path dựa AI.
- Ghost text suggestion
- Tab accept
- Learn từ history + snippet
- Fuzzy match
Depends: F[T.E.01]

### F[T.E.05] AI Generate Script from Description — [P1] M
"Backup DB daily keep 7 ngày" → AI generate bash script.
- Natural language → bash/python
- Edit trước khi run
- Save as snippet
Depends: F[T.E.01]

### F[T.E.06] AI Fix Command (error) — [P1] S
Command fail → AI suggest fix (typo, missing flag, permission).
- Detect error
- Suggest fix inline
- Apply fix → re-run
Depends: F[T.E.03]

### F[T.E.07] AI Translate Windows→Linux — [P2] S
Dịch command Windows sang Linux (dir → ls, type → cat).
- Detect platform context
- Translate
- Explain khác biệt
Depends: F[T.E.01]

### F[T.E.08] AI Security Audit — [P1] S
Warn command nguy hiểm (rm -rf /, dd, chmod 777, curl | bash).
- Pattern match + AI
- Confirm dialog với giải thích
- Block list
Depends: F[T.E.02]

### F[T.E.09] AI Workflow Builder — [P2] M
Hỏi "monitor nginx log for 500" → AI build workflow (tail + grep + alert).
- Generate multi-step
- Save as workflow
Depends: F[T.E.05]

### F[T.E.10] AI Anomaly Detection trong output — [P2] M
Detect output bất thường (error spike, unknown IP login, disk full warning).
- Compare baseline
- Alert trong timeline
Depends: F[T.E.03]

### F[T.E.11] LLM Provider abstraction — [P0] M
Support Gemini, OpenAI, Anthropic, Ollama (local), LM Studio.
- Provider config (endpoint, key, model)
- Fallback chain (local first, cloud if fail)
- Cost estimate
- Token usage tracking
Depends: ROADMAP Phase 3.4
Tasks:
- [ ] `LLMProvider` interface
- [ ] Adapter: Gemini, OpenAI, Anthropic, Ollama
- [ ] Settings UI
- [ ] Fallback + retry

### F[T.E.12] AI Chat Sidebar — [P1] L
Chat với AI context về server (log, config, command history).
- Sidebar panel
- RAG: query DB → context → LLM
- Chat history per session
- Pin/quote code
Depends: F[T.E.11]

### F[T.E.13] AI Prompt Library — [P2] S
Template prompt cho AI (vd "explain nginx error", "optimize this query").
- Prompt CRUD
- Share/import
- Variable placeholder
Depends: F[T.E.11]

### F[T.E.14] AI Voice Command — [P3] M
Nói → AI chuyển command (accessibility + hands-free).
- Web Speech API
- Transcript → AI → command
- Confirm trước run
Depends: F[T.E.01]

### F[T.E.15] AI Diff Explainer (file edit) — [P1] S
Edit file remote xong → AI explain diff trước save.
- Monaco diff → AI
- Summary change
- Risk flag
Depends: F[T.D.19]

---

## F. Command History & Snippets

### F[T.F.01] Persistent Command History — [P0] M
Lưu mọi command chạy, search Ctrl+R style, per session + global.
- Table `command_history (id, session_id, connection_id, command, cwd, ts, exit_code)`
- Search fuzzy
- Filter per connection/date
- Export CSV
- Privacy: option disable cho command nhạy cảm
Depends: F[T.F.08]
Tasks:
- [ ] Shell integration capture command
- [ ] History store + search UI
- [ ] Ctrl+R overlay

### F[T.F.02] History Search (Ctrl+R) — [P0] S
Search history backward, multi-match, preview.
- Overlay widget
- Fuzzy match
- Multi-line preview
- Run / copy / delete entry
Depends: F[T.F.01]

### F[T.F.03] Snippet Template với biến — [P0] M
Snippet có placeholder `${1:path}`, Tab điền.
- Snippet editor với syntax
- Run → prompt fill biến
- Multi-line snippet
- Category + tag
Depends: F[T.F.08]

### F[T.F.04] Snippet Library nâng cao — [P0] M
Mở rộng `command_snippets` hiện có: category, favorite, run history, sync.
- Category tree
- Favorite pin
- Run history (last run, success count)
- Search + filter
- Share/import library (JSON)
- Variable scope (per connection, global)
Depends: F[T.F.03]

### F[T.F.05] Snippet Run từ Terminal — [P0] S
Gõ `/snippet-name` hoặc Ctrl+Space → chọn snippet, fill biến, run.
- Slash command trigger
- Autocomplete snippet name
- Inline variable fill
Depends: F[T.F.03]

### F[T.F.06] Snippet Sync across Device — [P2] M
Sync snippet library giữa nhiều máy (pair với cross-device config).
- Export/import
- Cloud sync (optional)
- Conflict resolve
Depends: ROADMAP F[J.04]

### F[T.F.07] Macro Recorder — [P1] M
Record keystroke sequence, replay (mobaXterm macro).
- Record start/stop
- Replay (loop N times)
- Edit macro
- Bind macro to key
- Conditional (wait for output match)
Depends: F[T.A.05]

### F[T.F.08] Shell Integration — [P0] L
Cài shell script (bash/zsh/fish) cho remote để: mark command, cwd, exit code, history.
- OSC 133 marks: prompt start, command start, output start
- OSC 7 cwd report
- OSC 0 title
- Auto-install on connect (detect shell, inject)
- Fallback nếu không cài được
Depends: F[T.A.18]
Tasks:
- [ ] `shell-integration.sh` / `.zsh` / `.fish`
- [ ] Auto-inject on connect
- [ ] Detect shell type
- [ ] Disable option

### F[T.F.09] Autocomplete (command/path) — [P1] L
Auto-complete command, flag, path, hostname.
- Parse history + snippet
- Path complete từ SFTP cache
- Hostname complete từ connection list
- Tab trigger
- Ghost text preview
Depends: F[T.F.01], F[T.E.04]

### F[T.F.10] Command Palette (Ctrl+Shift+P) — [P0] M
Spotlight search: gõ → action, snippet, connection, file.
- `cmdk` lib
- Fuzzy search
- Recent + frequent
- Register command từ module
Depends: ROADMAP Phase 3.4

### F[T.F.11] Bookmark Command — [P1] S
Bookmark command hay dùng, click run nhanh (quick action bar).
- Pin to top
- One-click run
- Edit bookmark
Depends: F[T.F.04]

### F[T.F.12] Recent Connection Quick Bar — [P1] S
Bar top: list connection recently used, click open terminal.
- Recent N
- Favorite
- Click → new tab
Depends: F[T.C.19]

### F[T.F.13] Expect Script (auto-respond) — [P2] M
Expect-like: khi output match → auto input (vd password prompt → fill).
- Rule: pattern → response
- Chain rule
- Security: warning cho password rule
- Disable globally
Depends: F[T.A.08]

### F[T.F.14] Command Tagging — [P2] S
Tag command trong history (vd "debugging", "deploy"), filter by tag.
- Add tag after run
- Filter
- Search within tag
Depends: F[T.F.01]

### F[T.F.15] Snippet Versioning — [P3] S
Lưu version cũ snippet, rollback.
- Version history
- Diff version
- Restore
Depends: F[T.F.04]

---

## G. Search & Navigation

### F[T.G.01] Search trong Scrollback (regex) — [P0] S
Search regex trong scrollback, highlight all match.
- Regex toggle
- Case sensitive toggle
- Next/prev (F3/Shift+F3)
- Match count
Depends: F[T.A.06]

### F[T.G.02] Search across Session — [P1] M
Search trong tất cả session đang mở, click → jump session.
- Multi-session search
- Result list
- Jump to match
Depends: F[T.G.01], F[T.B.01]

### F[T.G.03] Filter Output (grep live) — [P1] S
Lọc output theo regex realtime, ẩn dòng không match.
- Filter bar
- Invert filter
- Save filter preset
Depends: F[T.G.01]

### F[T.G.04] Jump to Mark — [P1] S
Jump giữa các mark (F[T.A.09]), popover list.
- Mark list sidebar
- Click jump
- Filter mark by tag
Depends: F[T.A.09]

### F[T.G.05] Find File trong output — [P2] S
Click file path → mở SFTP browser tại đó hoặc editor.
- Recognize path pattern
- Jump action
Depends: F[T.A.11]

### F[T.G.06] Timeline Navigation — [P2] M
Thanh timeline theo thời gian, click jump đến output thời điểm đó.
- Record output timestamp
- Scrub bar
- Zoom in/out
Depends: F[T.A.06]

### F[T.G.07] Diff 2 Output — [P2] M
So sánh output 2 session (vd trước/sau deploy).
- Pick 2 session
- Monaco diff
- Sync scroll
Depends: F[T.B.07]

### F[T.G.08] Copy Output as HTML/ANSI — [P1] S
Copy selection giữ màu ANSI, paste vào doc.
- HTML format (keep color)
- ANSI format (paste vào terminal khác)
- Plain text
- Markdown code block
Depends: F[T.A.06]

### F[T.G.09] Export Session (asciinema/text) — [P1] S
Export toàn bộ session thành file asciinema cast hoặc text.
- asciinema cast JSON (replay)
- Plain text (strip ANSI)
- HTML with color
- Share link (future)
Depends: F[T.A.06]

---

## H. Monitoring & Visualization

### F[T.H.01] Remote Process Monitor (top/htop) — [P0] M
Hiển thị CPU/RAM per process remote, sort, kill.
- SSH `top -b` parse hoặc `ps aux`
- Table: PID, CPU, RAM, command
- Sort column
- Kill button (SIGTERM/SIGKILL)
- Refresh interval
Depends: F[T.C.05]

### F[T.H.02] System Resource Dashboard — [P0] M
CPU/RAM/disk/network graph realtime, multi-server.
- `top` / `/proc/stat` / `df` / `ifconfig`
- Recharts live graph
- Multi-server panel
- Alert threshold
Depends: F[T.H.01]

### F[T.H.03] Log Tail (follow) — [P0] M
Tail log file remote realtime (tail -f), filter, highlight.
- `tail -f` via SSH exec stream
- Filter regex
- Highlight pattern
- Pause/resume
- Multi-file tail
Depends: F[T.C.05]

### F[T.H.04] Log Viewer (large file) — [P1] M
Xem file log lớn không load hết, paged, search.
- Stream read chunk
- Goto line
- Search
- Filter level (ERROR/WARN/INFO)
- Syntax highlight (log format)
Depends: F[T.D.05]

### F[T.H.05] Service Manager (systemd) — [P1] M
List/start/stop/restart/enable service systemd.
- `systemctl list-units`
- Status badge
- Action button
- Log journalctl per service
Depends: F[T.C.05]

### F[T.H.06] Docker Manager — [P1] L
List container, start/stop/logs/exec, image, volume.
- `docker ps -a`, `docker stats`
- Container action
- Log stream
- Exec vào container
- Image list, prune
- Volume list
Depends: F[T.C.05]
Tasks:
- [ ] `DockerService.ts`
- [ ] Docker panel UI
- [ ] Container stats stream

### F[T.H.07] Cron Job Manager — [P1] M
List/edit/create/delete crontab, see next run.
- `crontab -l` parse
- Edit in editor
- Add cron
- Next run preview
- History (if available)
Depends: F[T.D.19]

### F[T.H.08] Network Connection Monitor — [P2] M
List `ss` / `netstat`, established, listening, kill connection.
- `ss -tunap` parse
- Filter by port/state
- Kill connection
- GeoIP (optional)
Depends: F[T.C.05]

### F[T.H.09] Disk Usage Analyzer — [P1] S
Tree map disk usage, tìm file lớn nhất.
- `du` / `ncdu` output parse
- Sunburst / treemap chart
- Drill down
- Delete from chart
Depends: F[T.D.10]

### F[T.H.10] Uptime & Load History — [P2] S
Lưu load history, graph 24h/7d.
- Poll `uptime`, `/proc/loadavg`
- Store `server_metrics (ts, connection_id, load, cpu, ram)`
- Graph
Depends: F[T.H.02]

### F[T.H.11] Real-time Transfer Graph — [P1] S
Graph throughput MB/s realtime, per session + total.
- WebSocket stream → recharts
- History 1h/24h/7d
Depends: F[T.D.14]

### F[T.H.12] Custom Dashboard Widget — [P2] L
User build dashboard (drag widget: CPU chart, log tail, metric).
- Widget library
- Drag-drop layout
- Per-connection or global
- Save/load
Depends: F[T.H.02]

### F[T.H.13] Alert trong Terminal — [P1] S
Alert khi pattern xuất hiện (vd disk 90%, SSH fail).
- Rule: pattern → alert
- Toast + sound + log
- Mute
Depends: F[T.A.08]

### F[T.H.14] Remote Environment Variable Viewer — [P2] S
Xem env var remote, search, copy.
- `env` or `printenv`
- Search
- Copy value
- Diff env 2 server
Depends: F[T.C.05]

### F[T.H.15] Process Tree View — [P2] S
Tree view process (parent-child), giống `pstree`.
- `pstree` or parse
- Expand/collapse
- Kill branch
Depends: F[T.H.01]

---

## I. Port Forwarding & Tunnel

### F[T.I.01] Port Forwarding UI (L/R/D) — [P0] M
Kích hoạt `port_forwards` table (hiện dead) — local (-L), remote (-R), dynamic SOCKS (-D).
- CRUD forward
- Start/stop
- Status indicator
- Auto-start on app open
- Log forwarded connection
Depends: F[T.C.01]
Tasks:
- [ ] `PortForwardService.ts` (ssh2 forward)
- [ ] Routes `/api/port-forwards`
- [ ] UI list + add/edit
- [ ] Auto-start

### F[T.I.02] SOCKS Proxy Manager — [P1] S
Dynamic port forward → SOCKS5 proxy, dùng cho browser/app.
- Create SOCKS via SSH
- Config browser proxy
- PAC file generate
- Test proxy
Depends: F[T.I.01]

### F[T.I.03] Tunnel Dashboard — [P1] S
Overview all tunnel active, traffic counter, reconnect.
- List tunnel
- Bytes counter
- Reconnect button
- Auto-reconnect (pair F[T.C.08])
Depends: F[T.I.01]

### F[T.I.04] Multi-hop Tunnel — [P2] M
Tunnel qua nhiều hop (bastion → internal → target).
- Chain forward
- Per-hop status
Depends: F[T.C.04], F[T.I.01]

### F[T.I.05] Reverse Tunnel Access — [P2] S
Remote (-R) để access local service từ remote server.
- Common dev (expose localhost)
- Template (ssh -R 8080:localhost:80)
Depends: F[T.I.01]

### F[T.I.06] Tunnel Preset — [P2] S
Preset forward hay dùng (DB, web, adminer).
- Template library
- One-click start
- Custom preset
Depends: F[T.I.01]

### F[T.I.07] Auto-tunnel on Connect — [P1] S
Khi SSH connect, auto-start tunnel đã config.
- Per connection config
- Delay start (wait for service)
Depends: F[T.I.01]

### F[T.I.08] X11 Forwarding — [P3] L
Forward X11 để chạy GUI app remote.
- ssh2 X11 forward
- Local X server (Xming/VcXsrv detect)
- App launch
Depends: F[T.I.01]

---

## J. Security & Access

### F[T.J.01] Session Lock (inactivity) — [P0] S
Lock terminal sau N phút idle, yêu cầu master password.
- Idle timeout config
- Lock overlay
- "Lock all" button
Depends: ROADMAP Phase 2.1

### F[T.J.02] Audit Log (who did what) — [P0] M
Log mọi command, file edit, transfer, login.
- Table `terminal_audit_log (ts, user, connection, action, detail)`
- Filter + export
- Tamper-evident (hash chain)
Depends: ROADMAP Phase 2.1

### F[T.J.03] Sudo Password Cache (session) — [P1] S
Cache sudo password trong session (memory), không lưu disk, clear on close.
- Already có `session.sshPassword` — explicit toggle
- Security warning
- Auto-clear after 30min idle
Depends: none

### F[T.J.04] 2FA cho Terminal App — [P1] S
TOTP mở terminal app (pair với master login).
Depends: ROADMAP Phase 2.1

### F[T.J.05] Command Blacklist — [P1] S
Block command nguy hiểm (configurable), require confirm.
- Pattern list (rm -rf, dd, mkfs)
- Action: block / confirm / warn
- Per-profile
Depends: F[T.E.08]

### F[T.J.06] Session Recording (audit) — [P1] M
Record terminal session (asciinema), lưu cho audit.
- Record start/stop
- Auto-record for specific connection
- Storage policy
- Replay
Depends: F[T.G.09]

### F[T.J.07] Credential Vault — [P0] M
Lưu password/key trong OS keystore (Windows Credential Manager, macOS Keychain).
- `keytar` lib
- Fallback DB encrypted
- Migration
Depends: ROADMAP Phase 2.2

### F[T.J.08] SSH Fingerprint Verification — [P0] S
Verify host key fingerprint, alert nếu thay đổi (MITM detect).
- Compare với known_hosts
- Accept once/always/reject
- Visual fingerprint (random art)
Depends: F[T.C.03]

### F[T.J.09] Tab Lock — [P2] S
Lock tab không cho close/freeze.
- Pin tab (already have in F[T.B.02])
- Confirm close
Depends: F[T.B.02]

### F[T.J.10] Auto-clear Scrollback on Connect — [P2] S
Clear scrollback cũ khi reconnect (privacy), toggle.
Depends: F[T.A.06]

### F[T.J.11] Multi-user Terminal (team) — [P3] XL
Nhiều user dùng chung server, terminal share với permission.
- Role: admin, operator, viewer
- Shared session (view-only or co-edit)
- Audit per user
Depends: ROADMAP Phase 2.1

---

## K. Automation & Scripting

### F[T.K.01] Macro Recorder nâng cao — [P1] M
Record keystroke + wait + condition, replay, loop, schedule.
- Record with timing
- Edit macro (insert wait, condition)
- Loop N times
- Schedule cron
Depends: F[T.F.07]

### F[T.K.02] Workflow Builder (visual) — [P2] L
Drag-drop workflow: SSH step, SFTP step, condition, loop, notify.
- Visual editor (react-flow)
- Step library
- Run + debug
- Save as template
Depends: F[T.F.10]

### F[T.K.03] Script Runner (bash/python/node remote) — [P1] M
Upload script, run remote, stream output, exit code.
- Detect runtime (bash/python/node)
- Upload temp, exec, cleanup
- Stream stdout/stderr
- Kill
Depends: F[T.D.13]

### F[T.K.04] Scheduled Command (cron) — [P1] M
Schedule command chạy remote theo cron, notify result.
- Cron config
- Run + capture output
- Notify success/fail
- History
Depends: F[T.F.10], ROADMAP F[J.11]

### F[T.K.05] Auto-run on Connect — [P1] S
Khi SSH connect, auto-run command (vd `cd /var/www`, `docker ps`).
- Per-connection config
- Sequence command
- Fail handling
Depends: F[T.F.08]

### F[T.K.06] Batch Command across Server — [P1] M
Run 1 command trên N server song song, aggregate result.
- Select N connection
- Run command
- Result table (server | output | exit)
- Export
Depends: F[T.B.06]

### F[T.K.07] Conditional Command (if output match) — [P2] M
Command chain: if A match → run B, else C.
- Pipeline builder
- Test mode
- Save as workflow
Depends: F[T.K.02]

### F[T.K.08] Webhook Trigger — [P2] S
Endpoint trigger command remote từ external (CI/CD).
- Token per command
- HMAC verify
- Async + result poll
Depends: ROADMAP Phase 2.1

### F[T.K.09] Plugin System (terminal) — [P3] XL
SDK viết plugin JS: custom command, panel, hook.
- Hook: onCommand, onOutput, onConnect
- Sandbox (isolated-vm)
- Plugin manifest + marketplace
Depends: ROADMAP Phase 3.1

### F[T.K.10] REST API cho Terminal — [P1] M
API programmatic: open session, send command, read output, close.
- `POST /api/terminal/exec` (1-shot)
- `POST /api/terminal/sessions/:id/send`
- `GET /api/terminal/sessions/:id/output` (stream)
- WebSocket for live
- Token auth
Depends: F[T.J.02]

### F[T.K.11] Event Hook (post-command) — [P2] S
Sau mỗi command → trigger (webhook, snippet, log).
- Rule: pattern → action
- Example: after deploy → notify Slack
Depends: F[T.A.08]

---

## L. Collaboration & Sharing

### F[T.L.01] Session Share (co-browsing) — [P2] L
Share terminal session realtime cho đồng nghiệp (view hoặc co-edit).
- WebRTC or server relay
- Permission: view-only / shared input
- Read-only mode
- Session link (expire)
Depends: F[T.J.11]

### F[T.L.02] Session Export (asciinema cast) — [P1] S
Export session thành asciinema cast file, share replay.
- Record output (timing + data)
- asciinema cast JSON
- Embed player
Depends: F[T.G.09]

### F[T.L.03] Snippet Share (library) — [P1] S
Share snippet library giữa team, import/export JSON.
- Export package
- Import merge
- Conflict resolve
- Version
Depends: F[T.F.04]

### F[T.L.04] Session Handoff — [P2] M
Chuyển session cho đồng nghiệp (vd giờ tan ca), keep context.
- Transfer ownership
- Brief notes
- Accept/reject
Depends: F[T.J.11]

### F[T.L.05] Terminal Recording Playback — [P1] M
Replay session recording, pause/seek/speed.
- Player UI (timeline)
- Speed 0.5x/1x/2x
- Search trong recording
- Export frame
Depends: F[T.L.02]

### F[T.L.06] Comment on Session — [P3] S
Comment tại 1 thời điểm trong session (review code-style).
- Bookmark + note
- Share comment
- Resolve
Depends: F[T.G.06]

### F[T.L.07] Collaborative Snippet Edit — [P3] M
Real-time co-edit snippet (Google Docs style).
- CRDT (Yjs)
- Cursor share
- History
Depends: F[T.L.01]

---

## M. UI/UX Polish

### F[T.M.01] Status Bar (bottom) — [P0] S
Bar dưới: connection status, cwd, git branch, last exit, duration, clock, encoding.
- Live update
- Click expand
- Customizable widget
Depends: F[T.A.12]

### F[T.M.02] Quick Action Toolbar — [P0] S
Toolbar top: new tab, split, search, snippet, sftp, screenshot, settings.
- Customizable
- Tooltip
Depends: F[T.F.10]

### F[T.M.03] Tab Context Menu — [P1] S
Right-click tab: rename, duplicate, close, close other, close right, pin, color, split.
- Full menu
- Shortcut hint
Depends: F[T.B.02]

### F[T.M.04] Connection Sidebar (collapsible) — [P0] S
Sidebar tree connection, collapse/expand, search.
- Toggle show/hide
- Width resize
- Drag connection to pane
Depends: F[T.B.14]

### F[T.M.05] Notification Toast — [P0] S
Toast cho: connection lost, command done, upload complete, error.
- Stack top-right
- Action button (reconnect, view)
- Auto-dismiss
Depends: none

### F[T.M.06] Progress Indicator (tab) — [P1] S
Tab đang chạy command → spinner, done → green/red dot.
- Exit code badge
- Running indicator
Depends: F[T.F.08]

### F[T.M.07] Empty State — [P1] S
No session → illustration + "Open terminal" CTA + recent connection.
Depends: F[T.M.04]

### F[T.M.08] Error Boundary — [P0] S
React error boundary per pane, fallback UI + reload.
- Catch render error
- Show error + stack (dev)
- Reload pane button
Depends: none

### F[T.M.09] Onboarding Tour (terminal) — [P1] S
First-run guide: open connection, split, snippet, AI copilot, SFTP.
- Step overlay
- Skip
- Re-trigger
Depends: F[T.F.10]

### F[T.M.10] Theme Auto-switch (system) — [P1] S
Theme theo system dark/light, hoặc time-based.
- Detect OS theme
- Custom schedule
Depends: F[T.A.03]

### F[T.M.11] Multi-language (terminal UI) — [P2] M
i18n terminal UI string (menu, tooltip, error).
- vi/en
- Language picker
Depends: ROADMAP Phase 3.4

### F[T.M.12] Font Size Wheel Zoom — [P2] S
Ctrl+wheel zoom font per session.
Depends: F[T.A.21]

### F[T.M.13] Compact Mode — [P2] S
Hide all chrome (sidebar, toolbar, status bar), chỉ terminal.
- Toggle: Ctrl+Shift+F11
Depends: F[T.A.20]

### F[T.M.14] Animated Tab Transition — [P3] S
Smooth animation khi switch tab/split.
- Fade/slide
- Config disable
Depends: none

### F[T.M.15] Drag Tab Reorder — [P0] S
Drag tab reorder, drag out thành window (future).
- Already partial — polish
Depends: F[T.B.02]

---

## N. Integration & Platform

### F[T.N.01] tmux Integration — [P0] L
Attach tmux session remote, control như native tab.
- Detect tmux, attach
- Parse tmux layout → pane
- Detach/reattach
- Sync title
Depends: F[T.B.01]
Tasks:
- [ ] `TmuxService.ts` (tmux command parse)
- [ ] Attach flow
- [ ] Layout sync

### F[T.N.02] zellij Integration — [P2] M
Attach zellij session, layout declarative.
- zellij attach
- Layout parse
- Tab sync
Depends: F[T.N.01]

### F[T.N.03] VS Code Remote SSH — [P2] M
Open remote folder trong VS Code Remote SSH từ connection.
- Generate SSH config entry
- Launch `code --remote ssh-remote+host path`
- Or open in Electron integrated
Depends: F[T.C.02]

### F[T.N.04] Git Remote Operation — [P1] M
Git command remote (status, log, diff, pull, push) từ terminal context.
- Detect git repo
- Quick action
- Show diff trong Monaco
Depends: F[T.C.05]

### F[T.N.05] Database Client (SSH tunnel) — [P2] L
Tunnel DB port + built-in SQL client (query, table view).
- Forward MySQL/PostgreSQL port
- Simple query UI (Monaco SQL + result table)
- Export result
- Save query
Depends: F[T.I.01]

### F[T.N.06] Docker Compose Manager — [P2] M
List compose project, up/down/logs, service list.
- `docker compose ps`
- Action up/down/restart
- Log stream per service
- Environment edit
Depends: F[T.H.06]

### F[T.N.07] Kubernetes kubectl exec — [P3] L
List pod, exec vào container, logs, port-forward.
- `kubectl get pods`
- Exec shell
- Log stream
- Port-forward
Depends: F[T.H.06]

### F[T.N.08] Cloud Provider Integration — [P3] L
List instance EC2/GCP/Azure, SSH by tag, start/stop instance.
- Provider config (credential)
- List instance
- SSH from instance metadata
- Action start/stop
Depends: F[T.C.01]

### F[T.N.09] Web Terminal (browser access) — [P1] L
Truy cập terminal từ browser (LAN) thay vì chỉ Electron.
- xterm.js web-ready
- Auth + HTTPS
- Desktop-only feature degrade
Depends: ROADMAP Phase 2.1

### F[T.N.10] Mobile Terminal (PWA) — [P3] L
Mobile web terminal, touch keyboard, quick command.
- PWA installable
- Custom key (Ctrl, Esc, Tab, arrow)
- Snippet quick run
- Read-only mode
Depends: F[T.N.09]

### F[T.N.11] Electron Global Hotkey — [P1] S
Global hotkey toggle terminal (Ctrl+`), independent focus.
- `globalShortcut`
- Quake dropdown
Depends: F[T.A.19]

### F[T.N.12] System Tray Menu extend — [P1] S
Tray menu: quick connect recent, active session list, open terminal.
- List active session
- Click → focus
- Quick connect
Depends: F[T.C.19]

### F[T.N.13] Clipboard Manager — [P2] S
History clipboard, paste từ history (Ctrl+Shift+V cycle).
- Store N item
- Search
- Pin
- Secure (no password)
Depends: none

### F[T.N.14] Screenshot Terminal — [P1] S
Capture terminal thành PNG, copy hoặc save.
- xterm `canvas.toDataURL`
- Region select
- Annotate (arrow, text)
- Copy to clipboard
Depends: F[T.A.01]

### F[T.N.15] Open in Editor (VS Code/Sublime) — [P2] S
Right-click file remote → "Open in VS Code via SSH".
- Generate SSH config
- Launch editor
Depends: F[T.N.03]

---

## O. Remote Development

### F[T.O.01] Remote File Watch (live edit) — [P1] M
Edit local → auto-upload remote (mini sync trong terminal context).
- Watch local folder
- Debounce upload
- Conflict check
Depends: F[T.D.13]

### F[T.O.02] Remote Build & Run — [P2] M
Run build command remote, parse error, jump to local editor.
- `npm run build` remote
- Parse output (file:line)
- Click → open local editor at line
- Fix → auto-upload (F[T.O.01])
Depends: F[T.O.01]

### F[T.O.03] Remote Debug (port forward + debugger) — [P3] L
Forward debug port, attach debugger (Node, Python).
- Forward port 9229 (Node)
- Launch chrome://inspect
- Or DAP protocol
Depends: F[T.I.01]

### F[T.O.04] Git Pull Before Deploy — [P1] S
Pre-deploy hook: git pull remote, run migration, then deploy.
- Hook chain
- Fail → abort
Depends: ROADMAP F[D.02]

### F[T.O.05] Environment Variable Manager — [P2] M
Manage `.env` remote, edit, diff, push from local.
- Read `.env` remote
- Edit trong Monaco
- Diff local vs remote
- Template (dev/staging/prod)
Depends: F[T.D.19]

### F[T.O.06] Secret Manager (remote) — [P2] M
Quản lý secret remote (API key, DB password) mã hóa.
- Store encrypted trong DB
- Inject vào env khi run
- Rotate
Depends: F[T.J.07]

### F[T.O.07] Container Exec (docker exec) — [P1] S
Exec vào container 1-shot hoặc shell, từ terminal.
- `docker exec -it` via SSH
- List container
- Shell or command
Depends: F[T.H.06]

### F[T.O.08] Database Migration Runner — [P2] M
Run migration (Laravel migrate, prisma migrate) remote, rollback.
- Detect framework
- Run + output
- Status
- Rollback
Depends: F[T.O.05]

---

## P. Terminal Ecosystem

### F[T.P.01] Theme Marketplace — [P3] M
Share/download theme (color scheme + font + background).
- Marketplace UI
- Import/export
- Rating
Depends: F[T.A.03]

### F[T.P.02] Snippet Marketplace — [P3] M
Share/download snippet pack (per stack: Laravel, Node, Docker).
- Pack library
- Import
- Contribute
Depends: F[T.F.04]

### F[T.P.03] Plugin Marketplace — [P3] XL
Install plugin (custom command, panel, hook) từ community.
- Registry
- Install/uninstall
- Update
- Sandbox
Depends: F[T.K.09]

### F[T.P.04] Profile Sync Cloud — [P3] M
Sync profile/keybinding/snippet qua cloud (opt-in, encrypted).
- E2E encrypt
- Multi-device
- Conflict resolve
Depends: F[T.F.06]

### F[T.P.05] Terminal Sound Pack — [P3] S
Custom sound cho bell, connect, complete (retro, sci-fi).
- Sound pack
- Import
- Per-profile
Depends: F[T.A.13]

### F[T.P.06] Background Image — [P3] S
Terminal background image, opacity, blur (iTerm2).
- Image picker
- Opacity slider
- Blur
- Per-profile
Depends: F[T.A.03]

### F[T.P.07] Powerline / Starship Prompt Integration — [P2] S
Auto-detect + install starship/oh-my-posh, suggest config.
- Detect prompt
- Install script
- Theme picker
Depends: F[T.F.08]

### F[T.P.08] oh-my-zsh / fish plugin helper — [P2] S
Suggest + install shell plugin (zsh-autosuggestions, fish-ai).
- Detect shell
- Plugin list
- Install command
Depends: F[T.F.08]

### F[T.P.09] Terminal Cheat Sheet — [P3] S
Cheat sheet overlay: phím tắt, command hay dùng, snippet.
- Per-shell cheat sheet
- Search
- Pin
Depends: F[T.F.10]

### F[T.P.10] Community Workflow Library — [P3] M
Pre-built workflow (backup DB, deploy Laravel, log rotate) download run.
- Library
- Template
- Customize before run
Depends: F[T.K.02]

---

## Ma trận ưu tiên

### Release v2.0 Terminal (P0, ~25 features)
> Mục tiêu: terminal-first release, sau ROADMAP Phase 1–3 xong.

| ID | Feature | Phần | Est |
|---|---|---|---|
| F[T.A.01] | GPU/WebGL Rendering | Engine | M |
| F[T.A.02] | Unicode 11 + Grapheme | Engine | S |
| F[T.A.03] | TrueColor + Color Scheme | Engine | M |
| F[T.A.04] | Font Manager + Ligature | Engine | M |
| F[T.A.05] | Custom Keybindings | Engine | M |
| F[T.A.06] | Scrollback nâng cao | Engine | M |
| F[T.A.07] | Copy Mode (mouseless) | Engine | M |
| F[T.A.17] | Profile System | Engine | L |
| F[T.A.23] | Bracketed Paste | Engine | S |
| F[T.B.01] | Grid Split N-pane | Layout | M |
| F[T.B.02] | Tab Grouping & Coloring | Layout | S |
| F[T.B.04] | Session Restore | Layout | M |
| F[T.B.05] | Tab Persistence Backend | Layout | M |
| F[T.B.15] | Reconnect Queue | Layout | S |
| F[T.C.01] | SSH Key Management | SSH | M |
| F[T.C.02] | SSH Config Import | SSH | M |
| F[T.C.03] | Known Hosts Mgmt | SSH | M |
| F[T.C.04] | Multi-hop / Jump Host | SSH | L |
| F[T.C.08] | Auto-reconnect (autossh) | SSH | S |
| F[T.C.09] | Connection Health Check | SSH | S |
| F[T.C.14] | Keepalive Tunable | SSH | S |
| F[T.C.15] | Connection Tag & Group | SSH | S |
| F[T.D.01] | SFTP Dual-Pane Commander | SFTP | L |
| F[T.D.03] | SFTP Search | SFTP | M |
| F[T.D.09] | SFTP Checksum Verify | SFTP | S |
| F[T.D.13] | SFTP Drag-drop folder | SFTP | S |
| F[T.D.15] | SFTP Resume Upload chunked | SFTP | M |
| F[T.D.19] | SFTP Edit Remote nâng cao | SFTP | M |
| F[T.E.01] | AI Command Suggestion | AI | L |
| F[T.E.02] | AI Explain Command | AI | S |
| F[T.E.03] | AI Explain Error | AI | S |
| F[T.E.11] | LLM Provider abstraction | AI | M |
| F[T.F.01] | Persistent History | History | M |
| F[T.F.02] | History Search (Ctrl+R) | History | S |
| F[T.F.03] | Snippet Template biến | History | M |
| F[T.F.04] | Snippet Library nâng cao | History | M |
| F[T.F.05] | Snippet Run từ Terminal | History | S |
| F[T.F.08] | Shell Integration | History | L |
| F[T.F.10] | Command Palette | History | M |
| F[T.G.01] | Search Scrollback regex | Search | S |
| F[T.G.08] | Copy Output as HTML/ANSI | Search | S |
| F[T.G.09] | Export Session (asciinema) | Search | S |
| F[T.H.01] | Remote Process Monitor | Monitor | M |
| F[T.H.02] | System Resource Dashboard | Monitor | M |
| F[T.H.03] | Log Tail (follow) | Monitor | M |
| F[T.I.01] | Port Forwarding UI | Tunnel | M |
| F[T.J.01] | Session Lock | Security | S |
| F[T.J.02] | Audit Log | Security | M |
| F[T.J.07] | Credential Vault (keystore) | Security | M |
| F[T.J.08] | SSH Fingerprint Verify | Security | S |
| F[T.M.01] | Status Bar | UI | S |
| F[T.M.02] | Quick Action Toolbar | UI | S |
| F[T.M.04] | Connection Sidebar | UI | S |
| F[T.M.05] | Notification Toast | UI | S |
| F[T.M.08] | Error Boundary | UI | S |
| F[T.M.15] | Drag Tab Reorder | UI | S |
| F[T.N.01] | tmux Integration | Integration | L |

**Tổng est v2.0 terminal:** ~14–18 tuần nếu 1 dev专注 terminal; ~8–10 tuần nếu 2 dev.

### Release v2.1 Terminal (P1, ~35 features)
F[T.A.08] Triggers, F[T.A.09] Mark & Jump, F[T.A.10] Block Output, F[T.A.12] Status Bar terminal, F[T.A.13] Bell, F[T.A.14] Idle Auto-lock, F[T.A.15] Hyperlink nâng cao, F[T.A.18] OSC, F[T.A.21] Zoom, F[T.A.22] Mouse nâng cao, F[T.B.03] Session Rename, F[T.B.06] Broadcast Input, F[T.B.08] Pane Zoom, F[T.B.10] Layout Template, F[T.B.11] Workspace, F[T.B.12] Hotkey Window, F[T.B.14] Session Sidebar, F[T.C.05] Agent Forwarding, F[T.C.06] SSH Agent built-in, F[T.C.07] Connection Multiplexing, F[T.C.13] SSH Compression, F[T.C.16] Connection Search, F[T.C.17] Duplicate Connection, F[T.C.18] Import PuTTY/Termius, F[T.C.19] Quick Connect History, F[T.C.20] Export share, F[T.D.02] SFTP Bookmarks, F[T.D.04] CHMOD visual, F[T.D.05] SFTP File Preview, F[T.D.10] Dir Size, F[T.D.14] Transfer Queue Manager, F[T.D.16] SFTP Sync mini, F[T.D.17] Bulk chmod, F[T.D.22] SFTP Disk Free, F[T.D.23] Drag-drop Download, F[T.D.24] Context Menu, F[T.D.25] Clipboard Path, F[T.E.04] AI Auto-complete, F[T.E.05] AI Generate Script, F[T.E.06] AI Fix Command, F[T.E.08] AI Security Audit, F[T.E.12] AI Chat Sidebar, F[T.E.15] AI Diff Explainer, F[T.F.07] Macro Recorder, F[T.F.09] Autocomplete, F[T.F.11] Bookmark Command, F[T.F.12] Recent Connection Bar, F[T.G.02] Search across Session, F[T.G.03] Filter Output, F[T.G.04] Jump to Mark, F[T.G.08] Copy HTML, F[T.G.09] Export asciinema, F[T.H.04] Log Viewer large, F[T.H.05] Service Manager, F[T.H.06] Docker Manager, F[T.H.07] Cron Manager, F[T.H.09] Disk Usage, F[T.H.11] Transfer Graph, F[T.H.13] Alert in Terminal, F[T.I.02] SOCKS Proxy, F[T.I.03] Tunnel Dashboard, F[T.I.07] Auto-tunnel, F[T.J.03] Sudo Cache, F[T.J.04] 2FA app, F[T.J.05] Command Blacklist, F[T.J.06] Session Recording, F[T.K.01] Macro nâng cao, F[T.K.03] Script Runner, F[T.K.04] Scheduled Command, F[T.K.05] Auto-run on Connect, F[T.K.06] Batch Command, F[T.K.10] REST API Terminal, F[T.L.02] Export asciinema, F[T.L.03] Snippet Share, F[T.L.05] Recording Playback, F[T.M.03] Tab Context Menu, F[T.M.06] Progress tab, F[T.M.07] Empty State, F[T.M.09] Onboarding, F[T.M.10] Theme Auto, F[T.N.04] Git Remote, F[T.N.11] Global Hotkey, F[T.N.12] Tray extend, F[T.N.14] Screenshot, F[T.O.01] Remote File Watch, F[T.O.04] Git Pull pre-deploy, F[T.O.07] Container Exec, F[T.P.07] Starship helper

### Release v2.2+ (P2/P3, ~65 features)
Toàn bộ P2 và P3 theo nhu cầu — xem chi tiết trong các section.

---

## Tham chiếu tool nguồn

| Feature | Lấy ý tưởng từ |
|---|---|
| F[T.A.01] GPU render | Kitty, Alacritty, WezTerm |
| F[T.A.03] Theme marketplace | iTerm2 Color Schemes, Tabby |
| F[T.A.07] Copy Mode | Tmux, Vim |
| F[T.A.08] Triggers | iTerm2 Triggers |
| F[T.A.10] Block output | Warp Blocks |
| F[T.A.11] Semantic history | iTerm2 Semantic History |
| F[T.A.16] Image protocol | iTerm2 imgcat, Kitty graphics |
| F[T.A.17] Profile | iTerm2 Profile, Windows Terminal |
| F[T.A.19] Quake mode | Guake, Windows Terminal |
| F[T.B.01] Grid split | iTerm2, Tmux, Kitty |
| F[T.B.06] Broadcast | MobaXterm multi-exec |
| F[T.B.09] Floating pane | Zellij |
| F[T.B.11] Workspace | WezTerm workspace |
| F[T.B.12] Hotkey window | iTerm2 Hotkey Window |
| F[T.C.01] Key mgmt | Termius, Tabby |
| F[T.C.02] SSH config import | Termius, Tabby |
| F[T.C.04] Jump host | ssh ProxyJump, Termius |
| F[T.C.07] Multiplexing | ssh ControlMaster, WezTerm |
| F[T.C.08] Auto-reconnect | autossh |
| F[T.C.18] Import PuTTY | Termius, Tabby |
| F[T.D.01] Dual-pane | MobaXterm, FileZilla |
| F[T.D.05] File preview | VS Code, Tabby |
| F[T.E.01] AI suggest | Warp AI |
| F[T.E.04] Auto-complete | Warp, Fig |
| F[T.F.01] History | zsh-history, atuin |
| F[T.F.08] Shell integration | iTerm2, Warp, Fig |
| F[T.G.09] Export asciinema | asciinema |
| F[T.H.01] Process monitor | htop, MobaXterm |
| F[T.H.06] Docker | lazydocker, Portainer |
| F[T.I.01] Port forward | Termius, MobaXterm |
| F[T.J.02] Audit log | Royal TSX |
| F[T.J.07] Credential vault | Royal TSX, Termius |
| F[T.K.02] Workflow builder | n8n, Zapier |
| F[T.L.01] Session share | Tmate |
| F[T.N.01] tmux | tmux |
| F[T.N.09] Web terminal | ttyd, Gotty |
| F[T.P.01] Theme marketplace | iTerm2, Tabby |

---

## Ghi chú thực thi

- **Terminal là feature flagship** của OmniSync v2 — đầu tư xứng đáng.
- **Mỗi feature = 1 PR** với test (ROADMAP Phase 1 vitest) + screenshot.
- **Shell Integration (F[T.F.08])** là foundation cho nhiều feature (block, history, mark, status bar, AI context) — làm sớm.
- **Profile System (F[T.A.17])** là foundation cho theme/font/keybinding per connection.
- **Update CHANGELOG + ROADMAP3 checkbox** khi done.
- **Benchmark** trước/sau mỗi perf feature (F[T.A.01], F[T.A.06], F[T.L.01]).

---

*ROADMAP3 là living document. Priority thay đổi theo feedback. Mỗi release review lại.*
