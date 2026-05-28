# Realtime Sync Monitor Plan

- **Project Type**: WEB (Vite React + Express / SQLite / Electron)
- **Goal**: Implement real-time sync progress monitoring using Server-Sent Events (SSE) and fallback to polling. Log executions to flat text files.

## Success Criteria
- [ ] SSE endpoint `/api/sync/stream/:id` feeds progress data live.
- [ ] React hook `useSyncProgress` automatically handles connections & falls back to polling on errors.
- [ ] Terminal HUD stays alive with a scanner visual when active but idle.
- [ ] Sync logs are appended to `sync_data/logs/connection_<id>.log` as flat text.
- [ ] Build & TypeScript compiler run cleanly with zero errors.

## Tech Stack
- Frontend: React / TypeScript / CSS
- Backend: Express / Node.js events / fs-extra

## File Changes
- `[MODIFY] api/services/SyncService.ts`
- `[MODIFY] api/routes/sync.ts`
- `[NEW] src/hooks/useSyncProgress.ts`
- `[MODIFY] src/components/FTPConnectionList.tsx`
- `[MODIFY] src/components/VisualDiffModal.tsx`
- `[MODIFY] src/components/UploadProgressBar.tsx`

## Proposed Tasks

### Task 1: Backend Event-Driven Service (P0)
- **Agent**: `backend-specialist`
- **Dependency**: None
- **Actions**:
  - Extend `SyncManager` from `EventEmitter`.
  - Add `onProgress` callback registration in `SyncSession`.
  - Emit `'progress'` event from `SyncManager` on changes.
  - Implement log appending to `sync_data/logs/connection_<id>.log`.
- **INPUT**: `api/services/SyncService.ts`
- **OUTPUT**: Real-time events on queue changes, progress updates, and file-based logging.
- **VERIFY**: Check event emissions via a debugger script or runtime logs.

### Task 2: Backend SSE Stream Router (P0)
- **Agent**: `backend-specialist`
- **Dependency**: Task 1
- **Actions**:
  - Implement GET `/api/sync/stream/:id` in `api/routes/sync.ts`.
  - Handle client connections, write SSE headers, pipe `'progress'` events, keep-alive heartbeats, and handle socket closures.
- **INPUT**: `api/routes/sync.ts`
- **OUTPUT**: `/api/sync/stream/:id` endpoint.
- **VERIFY**: Run curl or test requests against `/api/sync/stream/:id` and check streaming output.

### Task 3: Frontend Custom SSE Hook (P1)
- **Agent**: `frontend-specialist`
- **Dependency**: Task 2
- **Actions**:
  - Implement `useSyncProgress` hook in `src/hooks/useSyncProgress.ts`.
  - Hook establishes `EventSource` connection, handles JSON parsing, and sets up a `setInterval` fallback polling if `onerror` triggers.
- **INPUT**: None (New file)
- **OUTPUT**: `src/hooks/useSyncProgress.ts`
- **VERIFY**: Verify compile-time correctness.

### Task 4: Connect Hook and Enhance HUD (P1)
- **Agent**: `frontend-specialist`
- **Dependency**: Task 3
- **Actions**:
  - Replace polling hooks in `FTPConnectionList.tsx` and `VisualDiffModal.tsx` with `useSyncProgress`.
  - Add scanning state handler to `UploadProgressBar.tsx` when transfers are queued but inactive.
- **INPUT**: React components.
- **OUTPUT**: Components listening to live SSE streams.
- **VERIFY**: Test sync manually in the UI and verify that progress, counts, speed, and status update dynamically in real-time.

## Verification Checklist (Phase X)
- [ ] Run `npm run build` & `npx tsc --noEmit` to verify build.
- [ ] Verify that no purple colors or violation styles are introduced.
