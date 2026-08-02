# Test inventory

Static inventory of the test source in the working tree on **2026-08-01 (America/Detroit)**. Paths in file headings are relative to that package's root. Line numbers and titles refer to this exact, uncommitted snapshot.

## Scope, counts, and terminology

| Package                         | Package root                | Syntactic declarations | Expanded runnable cases |
| ------------------------------- | --------------------------- | ---------------------: | ----------------------: |
| `client`                        | `packages/app/client`       |                    170 |                     181 |
| `agent-bridge`                  | `packages/app/agent-bridge` |                     43 |                      50 |
| `server`                        | `packages/app/server`       |                     45 |                      72 |
| `@job-search-facilitator/core`  | `packages/core`             |                      9 |                       9 |
| `@job-search-facilitator/utils` | `packages/utils`            |                      0 |                       0 |
| **Total**                       |                             |                **267** |                 **312** |

- **Syntactic declaration** means one source invocation matched as `it(...)`, `it.each(...)(...)`, or Node `test(...)`: **258 `it*` + 9 `node:test` = 267**. A parameterized declaration counts once in that column.
- **Expanded case** means what the runner schedules after expanding every `it.each` and enclosing `describe.each` row. Every row and expanded title is listed under its declaration.
- **Exact title/template** is copied from the first argument in source. For ordinary `it`, the expanded title is the same title. For templates, interpolation follows Vitest's `%s`, `%i`, or `$property` behavior.
- **Exact verification** below preserves the source matcher and expected expression/value. A source identifier such as `startedTask`, `savedContact`, or `input` means the exact fixture object declared in that file; it is intentionally not replaced by a looser paraphrase. “No body assertion” means the test checks only the HTTP status.
- **Environment** means the runtime that actually executes the file, not the production runtime of its target.

### Working-tree caveat

This is a current-working-tree inventory, not an inventory of `HEAD`. Before this report was added, `git status --short` showed user-owned modifications in:

```text
packages/app/agent-bridge/tests/fake-runtime.ts
packages/app/agent-bridge/tests/task-manager.test.ts
packages/app/client/src/__tests__/agent-lifecycle.integration.test.ts
packages/app/client/src/__tests__/agent-store.test.ts
packages/app/client/src/__tests__/agent-stream.test.ts
packages/app/client/src/__tests__/apply-view.test.ts
packages/app/client/src/__tests__/panel-layout.browser.test.ts
packages/app/client/src/__tests__/review-routing.test.ts
packages/app/client/src/__tests__/stores.test.ts
packages/app/client/src/components/agent/AgentStream.vue
packages/app/client/src/components/agent/AgentTaskPanel.vue
packages/app/client/src/components/outreach/OutreachPanel.vue
packages/app/client/src/components/review/JobPostImportPanel.vue
packages/app/client/src/services/agent/agent-session.ts
packages/app/client/src/stores/agent.ts
packages/app/client/src/stores/job-post-import.ts
packages/app/client/src/stores/outreach.ts
packages/app/client/src/views/ApplyView.vue
packages/app/client/src/views/ReviewView.vue
```

No test body was executed for this inventory; all verification descriptions are a static source audit. Read-only Vitest collection commands were used to reconcile expanded names and counts: client 181, Agent Bridge 50, server unit 60, and server integration 12 via `--staticParse`. Core's 9 cases were reconciled directly from its `node:test` source.

Collection-host caveat: the available shell reported Node `v25.6.1`, while the repository declares Node `>=24 <25`. The environments below therefore describe the configured execution environments; they are not a claim that test bodies were run successfully under the collector's Node version.

## Package `client`

### Package/config method overview

- `pnpm --filter client test` runs `vitest run`; `test:unit` selects project `unit`, and `test:browser` selects project `browser`.
- The **unit project** includes `src/**/*.test.ts`, excludes `src/**/*.browser.test.ts`, and loads `src/test/setup.ts`. Unless a file has `/** @vitest-environment jsdom */`, Vitest's default **Node** environment applies.
- The shared setup cleans registered Vue mounts, clears `sessionStorage` and `localStorage` when present, restores all mocks, and unstubs globals after every test.
- The **browser project** includes `src/**/*.browser.test.ts`, loads the same setup, and uses `@vitest/browser-playwright` with headless Chromium, a default `1024 × 768` viewport, and failure screenshots disabled. Those tests use real browser focus, pointer, visibility, and layout geometry.

### Method/tier: state and service unit/integration tests (Vitest unit project, Node)

#### File `src/__tests__/agent-store.test.ts`

Environment: Vitest unit project, default Node/TS-ESM; fake `fetch`, in-memory storage, deterministic `crypto.randomUUID`, and `FakeEventSource`. Production target: Pinia `useAgentStore` task/session lifecycle. Exact describe block: `describe('agent store', ...)` (L85).

##### `describe('agent store', ...)` (L85)

- **L95 — `it('keeps active import and outreach tasks independently connected and addressable', ...)`.** Starts import/outreach lanes and exercises `startTask`, selectors, permission resolution, and cancellation. Verifies fetch calls #2/#4 are exact task `PUT`s with `JSON.stringify(taskInput)`; exact scoped sessions/tasks and two stream URLs; both become `connected`; emitted events remain lane-isolated. Approval is exact call #5 `POST /tasks/{started}/permissions/{firstPermissionId}` with `{decision:'approve'}`; import pending/submitting state changes while outreach state remains the same reference and neither stream closes. Cancellation is exact call #6 `POST /tasks/{started}/cancel`; import matches `cancelledImportTask`, retained `[importActivity, firstPermissionRequired]`, and `closed`; outreach still matches `nextTask`, its two events, pending second permission, and `connected`; `sessions` has length 2 and only import source `close` is called once.
- **L219 — `it('starts outreach for different posts concurrently and isolates each session', ...)`.** Starts two post scopes, attempts a duplicate same-post start, and emits first-lane activity. Verifies duplicate `rejects.toThrow('Another outreach Agent task is already active')`; distinct promises resolve `[startedTask, nextTask]`; exact scoped owners/states, both active, two streams; first events `[firstActivity]`, second `[]`; storage exactly `{version:2,sessions:[first outreach owner, second outreach owner]}`.
- **L288 — `it('rejects a second start in the same scope while the first start is pending', ...)`.** Holds the first health request. The second import start `rejects.toThrow('Another job-post-import Agent task is already active')`; `fetch` is called once while pending. Resolving `{status:'healthy',capabilities:['chrome']}` makes the first resolve `startedTask`, fetch count 2, and stream count 1.
- **L312 — `it('keeps a running task active while its event stream reconnects', ...)`.** Verifies fetch #1 exactly health `GET`/`undefined`, #2 exact task `PUT`/JSON, and one exact event URL. After open/activity/disconnect, state is `reconnecting` with task still `running` and source not closed; reopen/completed yields `closed`, task `completed`, output `{title:'Example Domain'}`, event types exactly `['activity','completed']`, and one close.
- **L374 — `it('restores persisted import and multiple outreach scopes', ...)`.** Seeds exact v2 import plus two outreach sessions, creates a fresh store, then restores. Verifies hydrated sessions exact and all task values initially `null`; fetch calls #7–#9 are exact task `GET`s with `undefined`; each state has exact task, `restoring:false`, `sessionUnavailable:false`; three ordered exact event URLs; opening all makes all `connected`.
- **L468 — `it('rejects a mismatched restore response without mutating the other lane', ...)`.** A deferred import restore returns a cancelled task with the wrong ID while outreach is live. Restore `rejects.toThrow('Agent returned a different task than the reserved session')`; call #3 is exact reserved-task `GET`; failed import matches `task:null`, `restoring:false`, `sessionUnavailable:false`, `disconnected`, and exact error. Outreach stays the identical state reference and connected; its only stream is not closed. Import becomes inactive/dismissible and its session clears; restarting creates its exact owner while outreach stays unchanged/open.
- **L535 — `it('persists the task owner before the bridge can create its task', ...)`.** Holds health. Before resolution, `getSession` equals the import owner/reserved ID; state matches `task:null`, `starting:true`, `sessionUnavailable:false`; storage equals the single-session v2 envelope; `dismissSession` is `false` and session remains. Resolving health completes the start.
- **L570 — `it('reads a v1 persisted session and restores it through the multi-session API', ...)`.** Seeds v1 outreach. Verifies exact hydrated session/scope and active `true`; `restoreSessions` issues exact task `GET`/`undefined`; state is `startedTask`, `connecting`, `restoring:false`; stream URL is exact.
- **L604 — `it('retains valid v2 sessions when another stored entry is structurally invalid', ...)`.** Seeds a valid import and outreach with empty `postId`. Verifies only the import survives and state exactly `{taskId,task:null,events:[],connectionState:'idle',pendingPermission:null,alwaysAllowBrowserActions:false,permissionSubmitting:false,cancelling:false,starting:false,restoring:false,sessionUnavailable:false,error:null}`; storage remains non-null.
- **L636 — `it('reads one import and multiple outreach sessions with distinct scopes', ...)`.** Verifies `sessions.toEqual(storedSessions)`; import/first/second scope task IDs are exactly `startedTask.id`, `nextTask.id`, and `thirdTask.id`; both outreach `getSessionTaskState` IDs are exact.
- **L657 — `it.each(... )('rejects a v2 envelope with a duplicate $scope scope', ...)`.** Each row seeds the duplicate envelope, then verifies `sessions` equals `[]` and persisted storage is `null`.
    - Row `{scope:'job-post-import', ...}` → **`rejects a v2 envelope with a duplicate 'job-post-import' scope`**; two import owners have different IDs/URLs.
    - Row `{scope:'outreach post', ...}` → **`rejects a v2 envelope with a duplicate 'outreach post' scope`**; contact and draft owners share one post.
- **L685 — `it('rejects a v2 envelope with duplicate valid task IDs', ...)`.** Import and outreach reuse `startedTask.id`; verifies `sessions.toEqual([])` and storage `toBeNull()`.
- **L703 — `it('keeps a cancelled task in memory without restoring it after refresh', ...)`.** Starts/cancels; verifies in-memory status `cancelled` and outreach owner retained, but persisted storage `null`; a fresh store has `sessions:[]` and null scoped state.
- **L728 — `it('restores another post after one of two Outreach tasks is cancelled', ...)`.** Starts two and cancels first. Original store still maps both scopes; storage exactly contains only the other-post session. Fresh store has cancelled scope `null`, other scope `nextTask.id`; restore makes it active and opens one stream.
- **L783 — `it('rejects an invalid health response before creating a task or event stream', ...)`.** Health returns `{status:'ready',capabilities:['chrome']}`. Start `rejects.toThrow('Agent /health returned invalid data')`; fetch once, zero streams; reservation state matches `task:null`, `disconnected`, `sessionUnavailable:true`, exact error.
- **L803 — `it('reuses an unavailable reservation for its exact owner', ...)`.** First start gets 500; retry gets healthy/start. Verifies first `rejects.toThrow('Agent request failed (500)')`, second resolves `startedTask`; UUID called once; owner still has started ID and scoped task equals `startedTask`.
- **L825 — `it('replaces an unavailable reservation only within its outreach post scope', ...)`.** Another post succeeds, target post fails 500, target draft retry starts `thirdTask`. Verifies exact reject/resolve, UUID call count 3, failed `nextTask.id` state null, target owner/task exact, other scope/state unchanged and stream never closed; storage exactly `[other owner+started ID, draft owner+third ID]`.
- **L873 — `it('rejects a contradictory task response before opening its event stream', ...)`.** Accepted response says `completed` with null output. Start `rejects.toThrow('Agent /tasks/{startedTask.id} returned invalid data')`; fetch count 2, zero streams; state matches null task/disconnected/exact error.
- **L895 — `it('keeps running task state when the event stream violates its contract', ...)`.** Sends invalid completed SSE output `[]`. Verifies state still contains original running `startedTask`, error exactly `Agent stream returned invalid data`, `disconnected`, and `cancelling:false`.
- **L918 — `it('keeps a task cancellable and reconnects it after its event stream closes', ...)`.** Emits activity then a terminal close. Verifies task remains `startedTask`, events `[replayedActivity]`, error exactly `Agent stream closed before the task finished`, and disconnected. `restoreTask` opens a second exact stream and resets to connecting/events `[]`/error null; replayed activity appears exactly once.
- **L958 — `it('rejects a mismatched cancel response without mutating the other lane', ...)`.** Import cancel returns a cancelled outreach ID. Cancellation rejects mismatch; fetch #5 is exact import cancel `POST`. Import keeps `startedTask`, `cancelling:false`, `sessionUnavailable:false`, connected, exact error; outreach remains the same reference/connected; neither source closes.
- **L1002 — `it('cancels a running task and closes its event stream', ...)`.** Cancel resolves `cancelledTask`; fetch #3 is exact cancel `POST`; state has cancelled status, `closed`, `cancelling:false`; source closes once.
- **L1030 — `it('keeps a running task available when cancellation fails', ...)`.** Cancel returns 500. Promise `rejects.toThrow('Agent request failed (500)')`; state retains exact `startedTask`, `cancelling:false`, exact error, `connected`; source is not closed.
- **L1052 — `it('does not create a task when the requested capability is unavailable', ...)`.** Health capabilities are `[]`. Start `rejects.toThrow('Agent capability is unavailable: chrome')`; fetch once, no stream; state disconnected, `sessionUnavailable:true`, exact error.
- **L1071 — `it('resumes the same task after a required browser permission is approved', ...)`.** Emits LinkedIn permission. During approval, submitting is true; fetch #3 is exact permission `POST` with `{decision:'approve'}`; one stream remains open. Permission-resolved makes submitting false; completed makes pending null, output `{personName:'Ada Lovelace'}`, and closes once.
- **L1123 — `it('asks again after an always-allowed task completes', ...)`.** `allowBrowserActionsForTask` makes first state true; completion resets it false. A second task uses `nextTask.id`; its permission remains pending with `alwaysAllowBrowserActions:false`.
- **L1168 — `it('automatically approves later browser actions for the same task', ...)`.** After allowing/resolving permission one, emits permission two. `waitFor` verifies fetch #4 is exact second permission `POST` with `{decision:'approve'}`; state holds second pending permission, `alwaysAllowBrowserActions:true`, `permissionSubmitting:true`.
- **L1207 — `it('restores attention without disconnecting when automatic browser approval fails', ...)`.** Automatic second approval returns 500. `waitFor` verifies exact error `Agent request failed (500)`; state keeps second pending permission, resets always-allow/submitting to false, and remains connected.

#### File `src/__tests__/stores.test.ts`

Environment: Vitest unit project, default Node/TS-ESM with mocked `fetch` and Agent store/stream collaborators. Production targets: Pinia report, post, and outreach stores. This file has three exact describe blocks.

##### `describe('report store', ...)` (L91)

- **L97 — `it('loads reports and refreshes one by id without discarding forward-compatible fields', ...)`.** Calls `fetchReports` then `fetchReport`; responses include unknown `scoringVersion`, `modelNote`, and nested `sourceMetadata`. Verifies initial report `toMatchObject` with those exact fields; fetch #1/#2 exact collection/report-ID `GET`s with `undefined`; final `{id,summary}` list equals refreshed then earlier report; canonical nested post still matches `{sourceMetadata:{importedBy:'agent'}}`.
- **L152 — `it('rejects an unsafe nested post link before changing report state', ...)`.** Returns nested `postUrl:'javascript:...'`. `fetchReports` `rejects.toThrow('API /job-search-reports returned invalid data')`; existing `[report]` remains and `loading` is false.
- **L177 — `it('exposes failed requests to the UI', ...)`.** Returns HTTP 500 text `Search reports unavailable`. Promise rejects with that exact message; `store.error` equals it and `loading` is false.

##### `describe('post store', ...)` (L190)

- **L197 — `it('keeps one canonical post across reports, reads, and PATCH responses', ...)`.** Loads two report copies, post list, newer PATCH, then equal-timestamp stale GET. Verifies canonical non-null and both report post references `toBe(canonical)`; fetch #1 reports GET, #2 posts GET, #3 exact PATCH ID with `JSON.stringify({applicationStatus:'awaiting-response',userLabel:'forgo'})`, #4 exact post GET. Update result and stale read both `toBe(canonical)`; canonical `toEqual(updatedPost)` and unrelated equals `secondPost`.
- **L296 — `it('loads the Apply queue from its endpoint', ...)`.** Calls `fetchApplyQueue`; verifies one exact `/api/job-posts/apply-queue` GET with `undefined`, `store.posts.toEqual([applyQueuePost])`, returned `recommendationContext` equals fixture, and returned post is the same reference as `store.posts[0]`.

##### `describe('outreach store', ...)` (L324)

- **L386 — `it('restores completed contact discovery without creating a duplicate contact', ...)`.** Restores v1 completed discovery then loads existing `[savedContact]`. `waitFor` expects selected contact exactly `savedContact`; fetch count exactly 2 (task GET + contact GET, no POST); scoped session is null.
- **L433 — `it('retries failed context loading before applying a restored discovery result', ...)`.** First contact GET is 500, retry is `[]`, POST saves contact. First restore resolves true with retry available/session retained; second `restoreTaskContext(post.id)` resolves true; waits for session null, exact saved contact, and `agentStore.startTask` never called.
- **L490 — `it('clears a draft session when restore finds that Agent cancelled it', ...)`.** Restores persisted draft plus cancelled task; verifies contact null, draft `''`, `drafting:false`, and session null.
- **L534 — `it('applies a completed draft revision and clears its task automatically', ...)`.** Completed output contains `revisedDraft` and `Made the introduction warmer.`; waits for exact draft, exact assistant reply, `taskVisible:false`, and session null.
- **L582 — `it('keeps a restored draft task when its saved contact is missing', ...)`.** Contacts response is `[]`. Restore resolves true; contact and assistant reply null, `taskVisible:true`, and session task ID equals restored ID.
- **L632 — `it('updates the selected and saved contact from the messaged PATCH response', ...)`.** Calls `updateContactMessaged`; verifies synchronous updating true; exact PATCH URL/options/body `{messaged:true}`; selected contact equals `updatedContact`, contacts `[updatedContact]`, local edited draft retained, updating false, error null.
- **L664 — `it('rejects unsafe contact links before changing outreach state', ...)`.** Contact response uses a JavaScript profile URL. Promise `rejects.toThrow('API /job-posts/{id}/outreach-contacts returned invalid data')`; prior `[savedContact]` is unchanged and `contactsLoading:false`.
- **L680 — `it('keeps the saved status and exposes an error when the messaged update fails', ...)`.** PATCH returns 500. Promise `rejects.toThrow('API request failed (500)')`; selected/list contact remain `savedContact`; updating false and error exact.
- **L697 — `it('finishes a contact update for its post after outreach moves elsewhere', ...)`.** Defers update, navigates to post 2, then resolves. Promise result exactly `updatedContact`; current post 2 has contact null/list `[]`/updating false/error null. Reopening original selects `updatedContact` and `[updatedContact]`.
- **L728 — `it('starts contact discovery while a job-post import task is active', ...)`.** Starts import then discovery with deterministic IDs/health/start. Discovery resolves true; exact import owner/task and exact outreach-contact owner/task coexist.
- **L786 — `it('saves concurrent discoveries to their posts when results settle out of order', ...)`.** Starts two seeded tasks with deferred per-post saves. Both resolve `[true,true]`; waits for two pending saves. Resolving second clears only its session and selects `secondContact`; resolving first clears its session; opening each post shows its exact contact and singleton list.
- **L892 — `it('cancels only the selected post task while another outreach task stays active', ...)`.** Seeds two tasks and cancels first. Verifies result true; cancel spy exactly once with first ID; first status cancelled; second active with exact scoped ID; navigating second yields its task ID and `taskRunning:true`.
- **L949 — `it('does not restore a cancelled post after navigation while cancellation is pending', ...)`.** Defers cancel and navigates to second before resolve. Cancellation resolves true; return-state storage null; current task ID is second and running true.
- **L1000 — `it('restores every outreach post context before processing completed tasks', ...)`.** Restores two persisted sessions with both contact loads deferred. `pendingContactLoads.size` becomes 2; completing/resolving second clears only second session and stores `[secondContact]`; completing/resolving first makes restore true and sessions `[]`. Reopening yields `[savedContact]` and `[secondContact]`; agent-session storage null.
- **L1119 — `it('persists and selects a discovered contact when Agent completes without a mounted panel', ...)`.** Starts already-completed output with padded fields. Waits for `savedContact`; verifies exactly one contact POST with normalized/trimmed `contactInput` JSON; contacts `[savedContact]`; draft equals saved draft.
- **L1163 — `it('does not select a contact when completed discovery persistence fails', ...)`.** Completed discovery POST returns 500. Waits for exact `resultError:'API request failed (500)'`; `contactSaving:false`, contact null, contacts `[]`.
- **L1192 — `it('updates the draft and assistant reply when draft Agent completes', ...)`.** Revision resolves true; seeded completion makes draft exactly `A warmer draft` and reply `I made the introduction warmer.`.
- **L1218 — `it('does not apply a draft result after another contact is selected', ...)`.** Starts revision, selects `otherContact`, then completes original. Waits for `drafting:false`; contact remains `otherContact`, draft its original `draftMessage`, reply null.
- **L1255 — `it('keeps cancelled outreach visible until the stream is left', ...)`.** Defers cancellation. `discovering` stays true before/after result true; cancel called once with running ID; session retains that ID; return-state storage equals `post.id`. `clearInactiveTask()` returns true then makes discovering false.
- **L1289 — `it('retries cancelled contact discovery without preserving its return state', ...)`.** After cancel, retry available and return marker equals post ID. Retry resolves true; `startTask` count 2 and call #2 exactly `createContactDiscoveryTask(post)` with `{kind:'outreach-contact',postId}`; return marker null, retry false, task active true.
- **L1328 — `it('retries a cancelled draft revision with its original request', ...)`.** Retry resolves true; `startTask` count 2 and call #2 exactly `createDraftRevisionTask(post,savedContact,savedContact.draftMessage,request)` with exact draft owner `{kind:'outreach-draft',postId,contactId,draft,request}`; retry false, task active true.
- **L1368 — `it('does not discard a draft task when its contact context is unavailable', ...)`.** Failed draft has no contact context. Verifies retry unavailable; `retryTask` resolves false; session retains failed task ID.
- **L1391 — `it('keeps retry available when a replacement task fails to start', ...)`.** Initial start/cancel succeeds; replacement returns 503 `Agent bridge unavailable`. Retry rejects that exact message; retry remains true, task running false, session has exact replacement reserved ID.
- **L1430 — `it('preserves active outreach when Agent cancellation fails', ...)`.** Cancel rejects `Could not cancel task`; store promise has same rejection, cancel called exactly with running ID, and discovering remains true.
- **L1447 — `it('clears failed outreach when the stream is left', ...)`.** Task becomes failed with `Chrome stopped responding`; waits for that exact result error; fetch never called; discovering remains true. `clearInactiveTask()` returns true then makes it false.
- **L1467 — `it('keeps a task running when its outreach view is reset during startup', ...)`.** Defers Agent start and resets the view before resolve. Start resolves true; cancel never called; current `postId:null`/discovering false; scoped owner has exact running ID and Agent `isTaskActive` is true.
- **L1494 — `it('does not persist or select an invalid completed discovery', ...)`.** Completes with only `{personName}`. Waits for exact error `Agent returned an invalid outreach result`; fetch never called; contact null, contacts `[]`.
- **L1515 — `it('finishes a pending discovery save after its outreach view is reset', ...)`.** Defers save and waits for `contactSaving:true`; resetting makes `postId:null` while session remains. Resolving save clears session; reopening selects `savedContact` and `[savedContact]`.

#### File `src/__tests__/user-added-job-posts.store.test.ts`

Environment: Vitest unit project, default Node/TS-ESM, mocked `fetch`. Production target: `usePostStore` user-added membership/canonical-post logic. Exact describe block: `describe('user-added posts in the post store', ...)` (L78).

##### `describe('user-added posts in the post store', ...)` (L78)

- **L84 — `it('loads user-added memberships with the canonical post object', ...)`.** Upserts canonical post then calls `fetchUserAddedPosts`. Verifies fetch exactly once with `/api/job-posts/user-added`, `undefined`; return is same reference as `store.userAddedPosts`; nested post is same canonical object.
- **L101 — `it('preserves user-added memberships when the API response is invalid', ...)`.** Response contains nested JavaScript `postUrl`. Promise `rejects.toThrow('API /job-posts/user-added returned invalid data')`; array is same prior reference.
- **L121 — `it('saves the exact input and replaces the canonical membership in deterministic order', ...)`.** Calls add. Verifies exact POST `/api/job-posts`, `Content-Type`, and `JSON.stringify(createUserAddedPostInput)`; IDs exactly `[tieItem.post.id, post.id, olderItem.post.id]`; one matching post ID; saved item is array index 1 and its post is canonical reference.
- **L159 — `it('keeps a completed add when an older list request finishes afterward', ...)`.** Defers stale GET and finishes POST first. After stale response, IDs remain exactly `[userAddedPost.post.id, existingItem.post.id]`.
- **L196 — `it('preserves user-added memberships when a save response is invalid', ...)`.** 201 response omits `addedAt`. Add `rejects.toThrow('API /job-posts returned invalid data')`; membership array stays same reference.

#### File `src/__tests__/agent-lifecycle.integration.test.ts`

Environment: Vitest unit project, default Node/TS-ESM; route-aware fake bridge/fetch, storage, and event streams. Production integration target: `useAgentStore`, `useJobPostImportStore`, `useOutreachStore`, and `usePostStore`. Exact describe block: `describe('Agent feature lifecycle integration', ...)` (L228).

##### `describe('Agent feature lifecycle integration', ...)` (L228)

- **L233 — `it.each(... )('persists %s and %s results once while their lanes complete independently', ...)`.** Both rows start import and outreach, assert both running/open, complete the named first lane, and verify its one API write/session clear while the other lane stays active with unchanged owner/state and open source; storage contains only second session. Completing second produces imports `[importOutput]`, contacts `[contactOutput]`, user-added `[savedImportedItem]`, outreach `[savedContact]`, sessions `[]`, storage null, and each source closed once.
    - Row `['job-post-import','outreach']` → **`persists job-post-import and outreach results once while their lanes complete independently`**.
    - Row `['outreach','job-post-import']` → **`persists outreach and job-post-import results once while their lanes complete independently`**.
- **L271 — `it.each(... )('keeps concurrent completions isolated when the %s save settles before %s', ...)`.** Completes both with deferred writes; verifies sorted pending lane names exactly `['job-post-import','outreach']` and both sessions non-null. Resolving first clears only first; resolving second clears all. Final exact imports/contacts/store collections match fixtures, storage is null, each stream closes once.
    - Row `['job-post-import','outreach']` → **`keeps concurrent completions isolated when the job-post-import save settles before outreach`**.
    - Row `['outreach','job-post-import']` → **`keeps concurrent completions isolated when the outreach save settles before job-post-import`**.
- **L313 — `it.each(... )('does not restore a cancelled $cancelledLane task while $remainingLane stays restorable', ...)`.** Cancels selected lane; cancelled source closes once, remaining source never closes, statuses are cancelled/running, and storage exactly contains remaining session. Fresh stores hydrate only remaining scope; restore GET IDs exactly `[remainingTaskId]`, status running, one stream, open → connected. Completing the remaining branch writes exactly its one import/contact and no other write, clears session/storage, and closes remaining source once.
    - Row `{cancelledLane:'job-post-import',remainingLane:'outreach'}` → **`does not restore a cancelled 'job-post-import' task while 'outreach' stays restorable`**.
    - Row `{cancelledLane:'outreach',remainingLane:'job-post-import'}` → **`does not restore a cancelled 'outreach' task while 'job-post-import' stays restorable`**.
- **L399 — `it.each(... )('restores $restoredLane when the persisted $failedLane task cannot be restored', ...)`.** Persists both and configures one restore error `Agent restore unavailable`. `restoreSessions` resolves; failed state exactly matches `{task:null,restoring:false,connectionState:'disconnected',error:'Agent restore unavailable'}`; restored status is running; failed scope inactive, restored active, no failed stream. Opening restored stream makes it connected; storage intentionally remains exact two-session envelope. Branch UI exposes exact error on failed lane and running/active on restored lane.
    - Row `{restoredLane:'outreach',failedLane:'job-post-import'}` → **`restores 'outreach' when the persisted 'job-post-import' task cannot be restored`**.
    - Row `{restoredLane:'job-post-import',failedLane:'outreach'}` → **`restores 'job-post-import' when the persisted 'outreach' task cannot be restored`**.

### Method/tier: component, router, and task-contract unit tests

#### File `src/__tests__/agent-tasks.test.ts`

Environment: Vitest unit project, default Node/TS-ESM. Production target: task builders `createContactDiscoveryTask`, `createDraftRevisionTask`, and `createJobPostImportTask`. Exact describe block: `describe('outreach agent tasks', ...)` (L46).

##### `describe('outreach agent tasks', ...)` (L46)

- **L47 — `it('defines the contact discovery capability and output contract', ...)`.** Verifies `discoveryTask.capabilities.toEqual(['chrome'])` and `outputSchema.required.toEqual(['personName','personTitle','profileUrl','relevanceRationale','draftMessage'])`.
- **L58 — `it('defines the draft revision capability and output contract', ...)`.** Verifies capabilities `toEqual([])` and required fields `toEqual(['draftMessage','response'])`.
- **L63 — `it('defines the job-post import capability and nested output contract', ...)`.** Verifies capabilities `['chrome']`; schema `toMatchObject` requiring top-level `agentLabel`, `fitRationale`, `applicationFlow`, `keyLegitimacySignals`, `recommendedResume`, `recommendedAction`, `legitimacyNotes`, `post`, and nested post fields `sourceKey`, `roleTitle`, `company`, `location`, `compensation`, `techStack`, `postSource`, `postUrl`, `applicationUrl`, `postStatus`.

#### File `src/__tests__/agent-stream.test.ts`

Environment: Vitest unit project with explicit jsdom pragma; Vue/Pinia mount. Production target: `AgentStream.vue` rendering, scrolling, permission controls, focus, and connection status. Exact describe block: `describe('agent stream', ...)` (L82).

##### `describe('agent stream', ...)` (L82)

- **L104 — `it('renders fragmented reasoning sections as clean, separate statements', ...)`.** Injects four message fragments with statement flags `true,false,true,false`. Verifies commentary node count `toHaveLength(1)` and copy text exactly `Reviewing the role\nFinding the **right** person`.
- **L128 — `it.each(... )('isolates activity and actions by task ID', ...)`.** Mounts both import/outreach tasks, selects one, and spies `resolvePermission`. For each row, `waitFor` expects copy text exactly selected activity and prompt text to contain selected permission; root does not contain excluded activity/permission. Clicking approve verifies `toHaveBeenCalledExactlyOnceWith(selected.taskId,'approve')`.
    - Row `{selected:taskContent.import,excluded:taskContent.outreach}` → expanded title **`isolates activity and actions by task ID`**.
    - Row `{selected:taskContent.outreach,excluded:taskContent.import}` → expanded title **`isolates activity and actions by task ID`** (same title; template has no placeholder).
- **L191 — `it('replaces the latest activity icon with progress without attaching it to commentary', ...)`.** Injects two activities and commentary. Verifies progress indicators length 1, latest activity contains one, commentary contains none. After a new activity, old activity progress is null and newest is non-null.
- **L234 — `it('follows new updates until the user scrolls up and resumes at the bottom', ...)`.** Stubs `clientHeight:100`, mutable `scrollHeight/scrollTop`, and counts writes. Initial event waits for `scrollTop.toBe(80)`; after user scroll-up/new message it stays 20; returning bottom/new fragment waits for 160; another activity leaves `scrollTop` 160 and write count unchanged.
- **L305 — `it('routes required permissions and resets confirmation for the next permission', ...)`.** Injects permission 1 and waits for prompt to be `document.activeElement`; approve calls `resolvePermission(taskId,'approve')` exactly once. Opens always-allow confirmation and waits for cancel focus; injecting permission 2 resets focus to prompt; confirming always-allow calls `allowBrowserActionsForTask(taskId)` exactly once.
- **L364 — `it('focuses an Agent issue so the failure is announced', ...)`.** Mounts issue `Could not cancel task`; `waitFor` expects `[role='alert']` to be `document.activeElement`.
- **L372 — `it('announces reconnecting until the Agent stream reconnects', ...)`.** Sets connection to reconnecting and expects reconnect element role `toBe('status')`; sets connected and expects it `toBeNull()`.

#### File `src/__tests__/agent-task-panel.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue/Pinia mount. Production target: `AgentTaskPanel.vue`. Exact describe block: `describe('AgentTaskPanel', ...)` (L36).

##### `describe('AgentTaskPanel', ...)` (L36)

- **L37 — `it('keeps back available while a running task can be cancelled', ...)`.** Mounts `running:true`; expects back non-null, cancel disabled false/text `Cancel`, retry null. Clicking back/cancel makes each callback `toHaveBeenCalledOnce()`.
- **L54 — `it('blocks another cancellation while cancellation is pending', ...)`.** Mounts `cancelling:true,running:true`; cancel `disabled.toBe(true)`; click leaves callback `not.toHaveBeenCalled()`.
- **L65 — `it('keeps back available when a terminal task can be retried', ...)`.** Mounts `retryAvailable:true`; back/retry non-null, retry text `Retry`, cancel null; clicks make back and retry callbacks each called once.
- **L82 — `it('keeps back available when a terminal task has no action', ...)`.** Default terminal panel: back non-null, cancel/retry null; back click calls callback once.

#### File `src/__tests__/app-error-handling.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue and memory-router mount. Production target: `App.vue` error boundary plus router `navigationFailed`. Exact describe block: `describe('application error handling', ...)` (L35).

##### `describe('application error handling', ...)` (L35)

- **L44 — `it('replaces a failed route subtree with document recovery', ...)`.** Mounts a route component whose setup throws `Route render failed`; `waitFor` expects `[data-testid='app-error-reload']` non-null.
- **L58 — `it('offers document recovery when a lazy route cannot load', ...)`.** Adds ready and lazy-rejecting routes (`Route chunk unavailable`), navigates ready, mounts app, suppresses console error, then catches broken navigation. `waitFor` expects reload recovery non-null.

#### File `src/__tests__/base-card.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue mount. Production target: `BaseCard.vue`. Exact describe block: `describe('BaseCard', ...)` (L7).

##### `describe('BaseCard', ...)` (L7)

- **L8 — `it('forwards clicks from button cards with a non-submit type', ...)`.** Mounts `as:'button'`; expects DOM button `type.toBe('button')`; click makes `onClick.toHaveBeenCalledOnce()`.

#### File `src/__tests__/base-panel.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue render fixture. Production target: `BasePanel.vue`. Exact describe block: `describe('BasePanel', ...)` (L8).

##### `describe('BasePanel', ...)` (L8)

- **L9 — `it('keeps its back control and slotted controls wired independently', ...)`.** Mounts back and slotted extra button. Both elements are non-null; clicking each makes its own callback `toHaveBeenCalledOnce()`.

#### File `src/__tests__/base-popup.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue mount; native dialog methods are temporarily stubbed and restored. Production target: controlled `BasePopUp.vue`. Exact describe block: `describe('BasePopUp', ...)` (L53).

##### `describe('BasePopUp', ...)` (L53)

- **L88 — `it('syncs its native open state and requests close through its controlled contract', ...)`.** Starts closed (`dialog.open.toBe(false)`), sets prop true (`toBe(true)`), clicks close (`onClose` once, open false), reopens and dispatches cancel (`onClose` twice, open false).
- **L119 — `it('renders slotted body content and connects it to the error prop', ...)`.** Initially input non-null and error node null. Sets error `Could not complete the action.`; error becomes non-null and input `aria-describedby.toBe(errorMessage.id)`.

#### File `src/__tests__/job-post-list-panel.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue mount. Production target: `JobPostListPanel.vue`. Exact describe block: `describe('JobPostListPanel', ...)` (L34).

##### `describe('JobPostListPanel', ...)` (L34)

- **L35 — `it('keeps an in-progress import reachable when loading saved posts fails', ...)`.** Mounts empty/error/pending panel. Import progress and list retry elements are both `not.toBeNull()`.
- **L55 — `it('moves forgone posts last and restores source order when the label is removed', ...)`.** Mounts reactive `[forgoneFirst,normalFirst,forgoneSecond,normalSecond]`. Rendered IDs first equal `[normalFirst.id,normalSecond.id,forgoneFirst.id,forgoneSecond.id]`; clearing first label and ticking makes them exactly `[forgoneFirst.id,normalFirst.id,normalSecond.id,forgoneSecond.id]`.

#### File `src/__tests__/job-post-view-panel.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue mount. Production target: `JobPostViewPanel.vue`. Exact describe block: `describe('JobPostViewPanel', ...)` (L69). The `openLabelOptions` helper also waits for label menu `not.toBeNull()`.

##### `describe('JobPostViewPanel', ...)` (L69)

- **L70 — `it('exposes distinct safe post and application destinations', ...)`.** Expects link `href`s exactly `post.postUrl`/`post.applicationUrl`; for both, target `_blank` and rel `noopener noreferrer`.
- **L86 — `it('deduplicates a shared destination in review mode', ...)`.** Sets application URL equal to post URL; post link non-null, application link null.
- **L93 — `it('omits unsafe external destinations', ...)`.** Uses `javascript:` post and `data:` application URLs; both links null.
- **L103 — `it('keeps recommendation sections absent when no recommendation is provided', ...)`.** Facts non-null; recommendation and legitimacy nodes null.
- **L111 — `it('exposes recommendation and legitimacy sections when that context is available', ...)`.** With `recommendation`, both nodes non-null.
- **L118 — `it('omits empty optional recommendation sections', ...)`.** Uses no compensation, `Not recorded` stack, empty source, and empty recommendation text/null notes. Facts non-null; recommendation and legitimacy null.
- **L141 — `it.each(... )('sets clear-label availability for $userLabel', ...)`.** Opens label menu; verifies `(clear option !== null).toBe(expected)`.
    - `{userLabel:null,expected:false}` → **`sets clear-label availability for null`**.
    - `{userLabel:'P1',expected:true}` → **`sets clear-label availability for 'P1'`**.

#### File `src/__tests__/outreach-contact-card.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue mount. Production target: `OutreachContactCard.vue`. Exact describe block: `describe('OutreachContactCard', ...)` (L46).

##### `describe('OutreachContactCard', ...)` (L46)

- **L47 — `it.each(... )('emits the inverse messaged state from $current', ...)`.** Expects toggle `aria-pressed.toBe(String(current))`; click calls `onUpdateMessaged` exactly once with `next`.
    - `{current:true,next:false}` → **`emits the inverse messaged state from true`**.
    - `{current:false,next:true}` → **`emits the inverse messaged state from false`**.
- **L58 — `it('blocks another messaged update while one is pending', ...)`.** Mounts updating; card `aria-busy.toBe('true')`, toggle disabled true; click leaves callback uncalled.

#### File `src/__tests__/outreach-contact-list.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue mount. Production target: `OutreachContactList.vue`. Exact describe block: `describe('OutreachContactList', ...)` (L41). Filter helper waits menu non-null before and null after selection; presence helper expects each card boolean to equal membership in requested IDs.

##### `describe('OutreachContactList', ...)` (L41)

- **L42 — `it('filters saved contacts by messaged status', ...)`.** With messaged contact 1 and non-messaged contact 2, exact visible IDs progress `['contact-1','contact-2']` → after `messaged`, `['contact-1']` → after `not-messaged`, `['contact-2']` → after `all`, both.

#### File `src/__tests__/restore-agent-session.test.ts`

Environment: Vitest unit project with explicit jsdom; Vue Router memory history. Production target: `createPersistedAgentSessionGuard`. Exact describe block: `describe('persisted Agent session startup', ...)` (L21).

##### `describe('persisted Agent session startup', ...)` (L21)

- **L22 — `it.each(... )('opens $routeName and reconnects its owner task', ...)`.** Starts navigation at `/results`; each row expects `router.currentRoute.value.name.toBe(routeName)` and `restoreSessions.toHaveBeenCalledOnce()`.
    - Import session/`routeName:'review'` → **`opens 'review' and reconnects its owner task`**.
    - Outreach session/`routeName:'apply'` → **`opens 'apply' and reconnects its owner task`**.
- **L53 — `it('opens the route for the most recently persisted session and restores all tasks', ...)`.** Stores outreach then import; navigating `/results` expects route name `review` and restore called once.
- **L79 — `it('allows later navigation while an active session remains persisted', ...)`.** With active import, first `/results` is guard-redirected; second `/results` succeeds; final route name `toBe('results')`.

### Method/tier: mounted view integration tests (Vitest unit project, jsdom)

#### File `src/__tests__/apply-view.test.ts`

Environment: explicit jsdom; mounted Vue/Pinia view, route-aware `fetch`, storage, and fake EventSource. Production targets: `ApplyView.vue`, post/outreach/Agent stores, and panel navigation. Exact describe block: `describe('apply view', ...)` (L125).

##### `describe('apply view', ...)` (L125)

Shared verification executed by callers: unless `waitForQueue=false`, `mountApplyView` waits for card `30000000-0000-4000-8000-000000000001` `not.toBeNull()`; `selectPost(id)` clicks its card and waits for viewer `data-post-id.toBe(id)`; `chooseJobPostAction(value)` opens the dropdown, waits for exact option `not.toBeNull()`, then clicks it. Setup clears session storage, stubs UUID to the running task ID, and defaults `fetch` to the three-item Apply queue.

- **L138 — `it('filters application candidates by user label', ...)`.** Opens filter and selects `P2`; verifies P1 card null, P2 card non-null, quick-app card null (plus shared queue/option waits).
- **L158 — `it('announces and retries a failed Apply queue load', ...)`.** Holds initial queue then resolves HTTP 500; retry returns `applyQueueItems`. While pending `[role='status']` non-null; after failure `[role='alert']` non-null; clicking retry makes first queue card non-null.
- **L183 — `it('does not admit a fetched post outside the current Apply queue', ...)`.** Loads queue then directly `postStore.fetchPost(outsideId)` for an outside P1 post; after tick its card `toBeNull()`.
- **L200 — `it('selects a post and returns to the queue', ...)`.** Shared-selects P2; posts panel `data-active.toBe('false')`, viewer `true`, card `aria-pressed:'true'`. Clicking back-to-posts makes posts panel active `true`.
- **L224 — `it('reuses saved contacts and navigates between contact and draft panels', ...)`.** Queue then `[savedContact]`, fake EventSource. Contact select non-null and streams length 0; outreach panel active `true`; selecting contact makes draft non-null; back makes contact list non-null; back-to-post makes viewer active `true`.
- **L266 — `it('preserves navigation without exposing stale contacts across saved-contact load outcomes', ...)`.** Seeds stale contact; initial contact load 500, pending successful retry, then pending failed reload. Error role equals `alert`; retry shows loading non-null and saved-contact select null. Navigating back then success leaves loading null/viewer active `true`; repeating and resolving 500 also clears loading and preserves viewer active `true`.
- **L326 — `it('shows an Agent failure while revising an outreach draft', ...)`.** Queue/contact then revision HTTP 503 `{error:'Agent bridge unavailable'}`. Draft request exists; inputs exact `Make the introduction warmer` and submits; afterward alert and back-to-saved-contacts are non-null.
- **L361 — `it('keeps a disconnected draft task visible and cancellable', ...)`.** Queue/contact/healthy Chrome/task 202. Submits draft, opens stream, disconnects, reopens, then fails. Back-to-saved exists while running; disconnect gives reconnect status role `status`; reopen makes it null; terminal failure exposes alert and cancel, both non-null.
- **L428 — `it('only exposes cancellation after contact discovery starts running', ...)`.** Queue/no contacts; holds health then returns task 202. Before health resolves, task status non-null/cancel null. After resolution, one EventSource, progress and cancel non-null, outreach active `true`.
- **L465 — `it('starts contact discovery while a persisted job import task is active', ...)`.** Seeds persisted v2 import, restores it, then starts outreach. Before click: import session `toMatchObject({kind:'job-post-import',taskId:importTaskId})`, state task matches `runningImportTask`, one exact import stream URL, and discover disabled false. After click: two streams; import owner/state unchanged; outreach owner matches `{kind:'outreach-contact',taskId:runningAgentTask.id,postId:posts[0].id}`; task matches `runningAgentTask`; URLs exactly `[import URL,outreach URL]`.
- **L559 — `it('restores the contact list without restoring a cancelled outreach task', ...)`.** Seeds only contact-list-return marker. Verifies outreach active `true`, contact list/back non-null, return marker null, Agent session key null.
- **L594 — `it('returns to a cancelled post while another restored outreach task stays active', ...)`.** Active task belongs P2, return marker P1, P2 contacts pending. P1 list/outreach active; resolver `toBeTypeOf('function')`; marker null; Agent `isTaskActive(id).toBe(true)`. Navigate P2: discover disabled false, cancel non-null, owner task ID exact, one stream; resolving contacts makes `contactsLoading:false`.
- **L683 — `it('keeps every restored active outreach task reachable when the Apply queue omits its posts', ...)`.** Seeds two outreach sessions, empty queue, hydrates both posts/empty contacts. Both omitted cards and cancel are non-null; opening first/second makes `outreachStore.taskId` exactly first/second task ID.
- **L770 — `it('keeps a restored running draft task in its Agent stream', ...)`.** Seeds legacy v1 draft session. Cancel and progress are non-null; static draft node null; `outreachStore.contact.toEqual(savedContact)`.
- **L816 — `it('processes a restored result before the Apply queue finishes loading', ...)`.** Completed contact task, queue held, contact POST returns saved contact. Before queue: outreach session null, contact equals saved, owner card null. Resolve owner-less queue: draft non-null, owner card still null.
- **L885 — `it('keeps active outreach navigable while preserving its task session', ...)`.** Running cancel non-null; collapsing yields contact list; back yields viewer active `true` and back-to-posts; another back yields posts active `true`. Stored owner `toMatchObject({taskId,postId})`; Agent storage key non-null.
- **L936 — `it('returns to the task stream when outreach fails behind the contact list', ...)`.** Collapses running task, then emits exact failed event `{type:'failed',error:'Agent task failed',createdAt:'2026-07-20T12:00:00.000Z'}`. Initially cancel/list non-null; failure makes retry non-null and list null.
- **L978 — `it('replaces outreach cancellation with a retry that starts a new task', ...)`.** Uses deterministic first/retry IDs and queue/contact/health/task/cancel/health/retry responses. Initially cancel non-null; after cancel cancel null/retry non-null; after retry retry null/cancel non-null; stored outreach task ID `toBe(retryTask.id)`.
- **L1031 — `it('keeps a restored task reachable when its owner post cannot be loaded', ...)`.** Owner post GET returns 500 but task/contact context restores. Outreach active `true`, cancel non-null; cancel then back-to-saved non-null; back leaves posts active `true`.
- **L1101 — `it('does not start discovery after the Apply view unmounts', ...)`.** Holds contacts; health/task routes would succeed. After outreach click, fetch `toHaveBeenCalledTimes(2)`; unmount and resolve contacts; predicate for any `/health` call `toBe(false)`; EventSources length 0.
- **L1151 — `it('keeps concurrent contact lookups isolated by post', ...)`.** Makes per-post contact GETs independently resolvable. Pending lengths `1`, `2`; revisiting P1 makes discover disabled true/length 2. Resolve first → disabled false; retry → length 3; retry response saved contact exposes select; late P2 empty result does not remove it; streams length 0.
- **L1216 — `it('keeps applied and forgone posts in the filtered queue for the current visit', ...)`.** Two P1 entries; applied PATCH and delayed forgo PATCH both return `inApplyQueue:false`. Shared option assertions run; applied trigger becomes disabled true; forgo trigger true while pending then false; after returning, card-presence values `toEqual([true,true])`.
- **L1290 — `it('shows a label failure only on its originating selected post', ...)`.** First PATCH 500; second held then 500. P1 error non-null; selecting/filtering P2 gives exact viewer P2/error null. After second action fetch called 3 times; switching P1 gives exact ID and, after late P2 failure, P2 trigger re-enabled (`disabled:false`) while P1 error remains null.

#### File `src/__tests__/review-routing.test.ts`

Environment: explicit jsdom; mounted Vue/Pinia/Vue Router with memory history, route-aware fetch/Agent fakes. Production targets: `ReviewView.vue`, report/post/import/Agent stores, and hidden-history routing. Exact describe block: `describe('review route selection', ...)` (L302).

##### `describe('review route selection', ...)` (L302)

Shared verification executed by callers: unless `waitForReports=false`, mount waits for the second report card `not.toBeNull()`; label helper waits for exact option non-null before click; `expectReportCards(ids)` checks each of all three card-presence booleans with `toBe(ids.includes(report.id))`. Setup clears session storage, installs default reports/user-added API, and starts match-media at width 0.

- **L315 — `it('keeps the selected report id out of the visible URL', ...)`.** Selects second report; route `fullPath.toBe('/')`; history `toMatchObject({reviewReportId:secondReport.id})`.
- **L328 — `it('announces and retries a failed report load', ...)`.** Holds initial report GET, resolves 500, retry returns reports. Status then alert are non-null; clicking retry makes second report card non-null.
- **L370 — `it('keeps user-added posts usable when report loading fails', ...)`.** Report load fails while user-added succeeds. Report retry, user-added source, add button all non-null; selecting user-added makes its post card non-null.
- **L401 — `it('keeps Added by you outside report date filters and opens its standalone analysis', ...)`.** Sets from date `2026-07-16`. Report list null; user-added source/card non-null; viewer ID exactly user-added ID; recommendation/legitimacy non-null; history matches `{reviewCollection:'user-added',reviewPostId:id}` and `reviewReportId.toBeUndefined()`.
- **L434 — `it('opens the add form and rejects a non-http URL before starting Agent', ...)`.** Submits `javascript:alert(1)`; URL error non-null and `startTask.not.toHaveBeenCalled()`.
- **L446 — `it('normalizes and starts a job-post import while a persisted outreach task remains active', ...)`.** Submits uppercase-scheme URL while restoring outreach. Outreach status `running`; `startTask.toHaveBeenCalledWith(createJobPostImportTask(normalizedUrl),{kind:'job-post-import',url:normalizedUrl})`; import owner `toEqual(...)`, import task `toEqual(importTask)`, and existing outreach owner/task remain exactly equal.
- **L526 — `it('does not carry an open add-post popup into a fresh view', ...)`.** Opens/fills, unmounts, remounts. Restored dialog `hasAttribute('open').toBe(false)` and input value `toBe('')`.
- **L560 — `it('does not restore a cancelled import after refresh', ...)`.** Starts/cancels then remounts. Persisted session key null; sources panel active `true`; cancel-import null.
- **L625 — `it('saves matching completed Agent output and opens the imported user-added post', ...)`.** Verifies `startTask.toHaveBeenCalledOnce()`; after valid completion, POST count 1; viewer ID equals saved imported ID; history matches user-added collection/post.
- **L672 — `it('keeps invalid completed Agent output away from persistence and exposes retry', ...)`.** Initial start once; invalid output makes retry and alert non-null; POST count 0; retry click makes start count 2.
- **L716 — `it('shows a selectable in-progress card after leaving a running import', ...)`.** Start once; back makes Job posts active `true` and progress card non-null; selecting progress makes Add job post active `true` and cancel non-null.
- **L752 — `it('keeps a running import intact when cancellation fails', ...)`.** `cancelTask` rejects `Could not cancel import`. Verifies `toHaveBeenCalledExactlyOnceWith(runningTask.id)`; alert and cancel non-null; retry null.
- **L780 — `it('shows retry without an error after an import is cancelled', ...)`.** Cancel exactly once with task ID; dialog open false; back/retry non-null; cancel/alert null; Add job post active `true`; back makes Job posts active `true`.
- **L830 — `it('filters report posts by review state', ...)`.** Selects `labeled`; option non-null; labeled card non-null; unlabeled second and forgone cards null.
- **L864 — `it('filters reports by an inclusive open-ended date range and clears it', ...)`.** Initially both dates `''` and all card booleans true. From `2026-07-15` → second/third only and `to.min` same date. To same date → same cards and `from.max` same. Only to `2026-07-10` → first only. Clear → values `''` and all cards.
- **L908 — `it('explains when no reports fall within the selected date range', ...)`.** Sets `2026-07-11` through `2026-07-14`; empty-state non-null, report-list null.
- **L921 — `it('keeps the selected report open when the range excludes its card', ...)`.** Before exclusion second post card non-null and hidden report ID exact. Set `to=2026-07-10`; second report card null, second post card remains non-null, hidden ID unchanged.
- **L945 — `it('keeps the selected post id out of the visible URL', ...)`.** Selects post; route full path `/`; history matches second report and second post IDs.
- **L965 — `it('shows a label failure only on its originating selected post', ...)`.** First PATCH 500, second held/500. Viewer IDs progress labeled→second; first failure error shown; `router.back()` returns labeled/error null; request count 2; forward returns second; late failure re-enables trigger (`false`) while error remains null.
- **L1041 — `it('removes only the hidden post state when returning to the report posts', ...)`.** Initial history matches report+post; back keeps full path `/`, state matching report only, and `reviewPostId.toBeUndefined()`.
- **L1069 — `it('keeps the selected report when returning to the review sources', ...)`.** At width 848, selects report/post then backs. URL remains `/`; report ID retained, post ID removed; sources active `true`; report card `aria-pressed.toBe('true')`.
- **L1097 — `it('restores the selected report and post from hidden history state', ...)`.** Seeds second report/post hidden state. Full path `/`; viewer ID second post; report card pressed `true`.
- **L1112 — `it('keeps user-added posts selected when returning from its viewer to review sources', ...)`.** Restores user-added post; viewer exact ID. Back leaves collection `user-added`, report/post IDs undefined, sources active `true`, source pressed `true`, post card non-null.
- **L1142 — `it('restores ready user-added history without waiting for reports', ...)`.** Holds reports, returns user-added immediately. Viewer opens exact ID before reports; after report resolve, first report card non-null and viewer remains same ID.
- **L1186 — `it('migrates legacy visible ids into hidden history state', ...)`.** Starts `/?reportId={second}&postId={secondPost}`. Normalized full path `/`; history matches both IDs; viewer ID second post.
- **L1203 — `it('removes stale legacy ids from the visible URL', ...)`.** Starts missing report/post query. Full path `/`; both hidden IDs undefined; first report pressed `true`; viewer null.
- **L1215 — `it('keeps valid hidden report state when removing a stale post id', ...)`.** Starts valid second report plus missing post. Full path `/`; history matches second report; post ID undefined; second report pressed `true`; viewer null.

### Method/tier: real-browser interaction and layout tests (Vitest browser project)

#### File `src/__tests__/panel-layout.browser.test.ts`

Environment: Playwright provider, headless Chromium; real visibility, pointer behavior, responsive CSS, and geometry. Production targets: `ReviewView`, `ApplyView`, `BasePanel`, and live Agent task navigation.

##### `describe.each([{width:847,desktop:false},{width:848,desktop:true}])('panel layout at $width pixels', ...)` (L112)

Exact expanded describe names are `panel layout at 847 pixels` and `panel layout at 848 pixels`. Browser helpers also require the initial report/Apply card `toBeVisible()` before each body.

- **L116 — `it('keeps Review panel visibility and back transitions consistent', ...)`.** Initial sources visible; posts visible iff `desktop`; import not visible; viewer not in document. Report click: posts visible, sources iff desktop. Post click: viewer visible, posts iff desktop, sources/import absent, viewer-back iff mobile. Mobile back: posts visible, viewer/sources hidden. Back-to-reports: sources visible, posts iff desktop, viewer absent.
    - **`panel layout at 847 pixels > keeps Review panel visibility and back transitions consistent`**.
    - **`panel layout at 848 pixels > keeps Review panel visibility and back transitions consistent`**.
- **L160 — `it('keeps Apply panel visibility and back transitions consistent', ...)`.** Initial posts visible; viewer iff desktop; outreach/back-to-posts absent. Select P2: viewer visible, posts iff desktop, viewer-back iff mobile; mobile back restores posts. Select P1 then discover: outreach visible, posts hidden, viewer iff desktop, viewer-back iff desktop, contact-back iff mobile. Desktop back restores posts/viewer and hides outreach. Mobile contact-back then viewer-back restores viewer then posts with the exact asserted visibility at each step.
    - **`panel layout at 847 pixels > keeps Apply panel visibility and back transitions consistent`**.
    - **`panel layout at 848 pixels > keeps Apply panel visibility and back transitions consistent`**.

##### `describe('running Agent task panel layout', ...)` (L222)

- **L223 — `it('keeps an import navigable while the mounted Review layout crosses the panel breakpoint', ...)`.** Runs live import across widths 390→847→848→847. At 390/847 import/back/cancel visible and sources/posts hidden; at 848 import/back/cancel/sources visible, posts hidden. Geometry: `sources.left >= 0`, `sources.right <= import.left`, `import.right <= 848`. Back: posts/sources visible, import hidden, progress visible; geometry `sources.right <= posts.left`, `posts.right <= 848`. Reopen retains import controls/sources; resize 847 hides sources/posts while import controls remain.
- **L299 — `it('keeps outreach running while Apply navigates through neighboring panels', ...)`.** At 848 after start, outreach/back/cancel/viewer/viewer-back visible and posts hidden; geometry `viewer.left >= 0`, `viewer.right <= outreach.left`, `outreach.right <= 848`. Collapse shows contact list/progress/viewer, hides posts/back-to-job-post, keeps viewer-back. Viewer back shows posts/viewer, hides outreach and viewer-back. Reopen contacts restores exact list/back visibility; progress click restores outreach controls/viewer.
- **L365 — `it('runs outreach for two posts and keeps their task controls isolated', ...)`.** First cancel visible/task count 1. Second discover `toBeEnabled()`, cancel visible/task count 2; both statuses exactly `running`. Cancel first and wait status `cancelled`; second remains `running`. Returning second keeps cancel visible and second running.

#### File `src/__tests__/browser-contracts.browser.test.ts`

Environment: Playwright/headless Chromium. Production targets: shared dropdown/header/popup/button/panel/list/contact components and real focus/layout contracts.

##### `describe('browser interaction contracts', ...)` (L29)

- **L30 — `it('keeps dropdown keyboard focus inside its menu and restores it after selection', ...)`.** Focus trigger + ArrowDown → first option `toHaveFocus`; End → last option focus; Escape → menu not in document and trigger focused. Pointer-select `applied` calls `onSelect.toHaveBeenCalledExactlyOnceWith('applied')`, closes menu, restores trigger focus.
- **L72 — `it('makes retracted navigation operable by pointer and keyboard', ...)`.** Focusing hidden Apply link results `not.toHaveFocus()`. Hover/unhover makes trigger `aria-expanded` `'true'`/`'false'`; Enter opens; link then focuses; Escape closes and returns trigger focus.
- **L107 — `it('closes navigation after following a route without hiding the focused link', ...)`.** A `MutationObserver` records whether an element receives `aria-hidden=true` while containing active element. Clicking Apply makes route path `/apply`, trigger expanded `'false'`, and observer flag `toBe(false)`.
- **L152 — `it('keeps the add-post tooltip hidden when its dialog restores trigger focus', ...)`.** Hover shows tooltip; click shows dialog/hides tooltip; close hides dialog, restores trigger focus, and tooltip remains hidden.

##### `describe('browser layout contracts', ...)` (L219)

- **L220 — `it('anchors a back-preset tooltip to its control, keeps it inside the viewport, and dismisses it with Escape', ...)`.** At 320×600, wrapper hover does not show tooltip, button hover does. Verifies tooltip bottom `< button.top`; button `aria-describedby === tooltip.id`; absolute center delta `<=1`; left `>=11`; right `<=309`; Escape hides it.
- **L279 — `it('switches adjacent panels at the shared 848px breakpoint', ...)`.** Adjacent inactive panel `not.toBeVisible()` at 847 and `toBeVisible()` at 848.
- **L301 — `it('keeps shared panel spacing below the job-post list back control', ...)`.** After two animation frames, verifies `headingRect.top - backButtonRect.bottom >= 16`.
- **L330 — `it('offers rationale expansion only when real layout overflows', ...)`.** Short-card toggle not in document; long-card toggle in document and clamped `scrollHeight > clientHeight`. Click makes `aria-expanded:'true'`; after layout flush, `scrollHeight - clientHeight <= 1`.

#### File `src/__tests__/job-post-facts-layout.browser.test.ts`

Environment: Playwright/headless Chromium. Production target: `JobPostViewPanel` fact-grid CSS. Exact describe block: `describe('job post facts layout', ...)` (L55).

##### `describe('job post facts layout', ...)` (L55)

- **L56 — `it('keeps the tech stack full-width below the facts in the narrow layout', ...)`.** At 560×900, verifies `compensation.left > resume.left`, `techStack.left === resume.left`, `techStack.right === compensation.right`, and `techStack.top > resume.bottom`.
- **L65 — `it('places compensation and tech stack together on the right in the wide layout', ...)`.** At 800×900, verifies `compensation.left > resume.right`, tech-stack left/right exactly compensation left/right, and `techStack.top > compensation.bottom`.

## Package `agent-bridge`

### Package/config method overview

`pnpm --filter agent-bridge test` runs Vitest 4.1.9 as `vitest run`. There is no Vitest config or environment pragma, so every file runs in the default Node/TS-ESM environment. `FakeRuntime` is in-memory: it advertises healthy Chrome, records start attempts/permission decisions/interruptions, and emits events. HTTP tests use in-process Express/Supertest except the one real loopback SSE listener; Codex-runtime tests use a fake child process and do not launch Codex or Chrome.

### Method/tier: configuration unit test

#### File `tests/config.test.ts`

Environment: Vitest Node; dynamic module import. Production target: config `env.AGENT_CWD`. Exact describe block: `describe('Agent bridge config', ...)` (L17).

##### `describe('Agent bridge config', ...)` (L17)

- **L18 — `it('defaults task context to the repository root', ...)`.** Deletes `process.env.AGENT_CWD`, imports config, computes root with `dirname(fileURLToPath(new URL('../../../../package.json',import.meta.url)))`, and verifies `expect(env.AGENT_CWD).toBe(repositoryRoot)`. `afterEach` resets modules and restores original env.

### Method/tier: in-process HTTP/SSE route tests

#### File `tests/app.test.ts`

Environment: Vitest Node; Express/Supertest + `FakeRuntime`, with an ephemeral `127.0.0.1` server only for resumable SSE. Production targets: `createApp` HTTP routes and `AgentTaskManager`. Exact describe block: `describe('Agent bridge routes', ...)` (L36).

##### `describe('Agent bridge routes', ...)` (L36)

- **L37 — `it('reports available capabilities and starts a task', ...)`.** GET `/health` exactly `.expect(200,{status:'healthy',capabilities:['chrome']})`; POST `/tasks` with exact prompt/schema/capability expects 202; body `toMatchObject({status:'running',threadId:'thread-id',turnId:'turn-id'})`.
- **L54 — `it('reuses a client-specified task without starting the runtime twice', ...)`.** PUTs identical input twice to fixed UUID; both `.expect(202)`. First body ID `toBe(taskId)`, repeated body `toEqual(first.body)`, `runtime.startAttempts.toBe(1)`.
- **L67 — `it('reports runtime failure and refuses new tasks without hiding existing task state', ...)`.** Starts task 202 then emits `Error('runtime unavailable')`. Health exactly 503 `{status:'unavailable',capabilities:[],error:'runtime unavailable'}`; new POST exactly 503 `{error:'runtime unavailable'}`; GET existing exactly 200 `{...started.body,status:'failed',error:'runtime unavailable'}`; attempts exactly 1.
- **L93 — `it('returns unavailable when the runtime fails during task creation', ...)`.** Configures `failNextStart(Error('task creation failed'))`; POST expects exactly 503 `{error:'task creation failed'}`.
- **L104 — `it('rejects an unsupported capability', ...)`.** POST with `computer-use` expects status 400 only; no response-body matcher.
- **L114 — `it('maps an invalid output schema to a client error before starting a task', ...)`.** Sends draft-07 `$schema` marker; expects status 400 and `startAttempts.toBe(0)`.
- **L132 — `it('streams live task events and resumes after the last received event', ...)`.** Starts manager task, fetches SSE from ephemeral loopback, emits web-search, final `{"contacts":[]}`, completed. Content-Type `toContain('text/event-stream')`; parsed `[id,type]` exactly `[[1,'activity'],[2,'activity'],[3,'completed']]`; reconnect with `Last-Event-ID:2` yields exactly `[[3,'completed']]`; server closes in `finally`.
- **L184 — `it('cancels a running task and closes its event stream with cancellation', ...)`.** Cancel POST expects 202; body matches `{id:task.id,status:'cancelled'}`. Events GET 200; types contain `cancelled` and do not contain `failed`.
- **L201 — `it('rejects cancellation after a task finishes', ...)`.** Emits final JSON/completed; cancel expects 409 and interruptions length 0.
- **L225 — `it('resumes a task after its browser-origin permission is approved', ...)`.** Emits fixed permission; latest event matches permission-required/ID. Decision POST expects exactly 202 `{status:'accepted'}`; runtime decisions exactly `[{permissionId,decision:'approve'}]`. After resolved event, latest matches `{type:'permission-resolved',permissionId}`.

### Method/tier: Codex process/protocol adapter unit tests

#### File `tests/codex-runtime.test.ts`

Environment: Vitest Node; fake EventEmitter child process with PassThrough stdout/stderr and Writable stdin; it auto-replies to initialize/plugin/thread/turn/interrupt messages and records parsed JSON-RPC writes. No real Codex or browser. Production target: `CodexRuntime`, with selected manager integration. Exact describe block: `describe('Codex runtime', ...)` (L119).

##### `describe('Codex runtime', ...)` (L119)

- **L120 — `it('discovers Chrome and starts a structured read-only task', ...)`.** Starts runtime/task with fixed prompt/object schema/Chrome. Health equals healthy+Chrome; task exactly thread/turn IDs. Recorded requests contain exact initialized message; initialize capability `mcpServerOpenaiFormElicitation:true`; thread/start granular flags `{sandbox_approval:false,rules:false,skill_approval:false,request_permissions:false,mcp_elicitations:true}`, `approvalsReviewer:'user'`, `sandbox:'read-only'`, Chrome plugin root/location `environment:'workspace'`; turn/start contains task ID, exact text/schema, `summary:'concise'`; then closes.
- **L192 — `it('declines an unexpected command approval', ...)`.** Injects server request ID 99 `item/commandExecution/requestApproval`; after immediate, requests `toContainEqual({id:99,result:{decision:'decline'}})`; closes.
- **L212 — `it('interrupts the active turn', ...)`.** Starts then `interruptTask('thread-id','turn-id')`; requests contain turn/interrupt with those exact params; closes.
- **L231 — `it('resumes a browser-origin request after the client approves it', ...)`.** Injects ID-99 form elicitation with LinkedIn origin/message. Events length 1 and first matches permission-required exact thread/turn/message/origin; derived permission non-null. First approve true; requests contain exactly `{id:99,result:{action:'accept',content:null,_meta:null}}`; repeated approve true, decline false, only one ID-99 write. Injecting `serverRequest/resolved` yields exact permission-resolved event; later approve false; closes.
- **L297 — `it('translates supported notifications and ignores unknown notifications', ...)`.** Injects web search, reasoning delta (item ID/index 2/text), final contacts JSON, plan update, failed turn `Model unavailable`, and unknown future event. `events.toEqual` exactly five translated objects in that order: activity, reasoning-delta with identities/index/text, final-message exact JSON, plan activity, failed turn-completed/error. Health status remains `healthy`; closes.
- **L398 — `it('rejects an invalid task response and becomes unavailable', ...)`.** Suppresses thread/start auto-reply then answers with `{result:{thread:{}}}`. Task `rejects.toThrow('Agent runtime returned invalid response for "thread/start"')`; health exactly unavailable/empty capabilities/same error.
- **L423 — `it('fails closed when a recognized notification is malformed', ...)`.** Injects turn completion with `future-status`. Events equal one runtime-failed whose error message is `Agent runtime returned invalid "turn/completed" notification`; health status unavailable.
- **L453 — `it('keeps terminal events ahead of an immediate runtime exit', ...)`.** Fake emits final/completed during turn/start, manager starts, process exits code 17. After tick, task matches completed/output contacts; runtime health exactly unavailable/`[]`/`Agent runtime exited with code 17`.
- **L480 — `it('drains terminal notifications emitted after process exit', ...)`.** Starts manager task, process exits 17, then writes final contacts/completed and ends stdout. After tick, task matches completed/output contacts.
- **L522 — `it('fails running tasks when exited process streams never close', ...)`.** Sets drain timeout 10 ms, starts, exits 17 without closing streams, waits 20 ms/tick. Task matches failed/error `Agent runtime exited with code 17`.
- **L546 — `it('rejects an ambiguous JSON-RPC envelope immediately', ...)`.** Suppresses initialize reply then answers same ID with both `method:'unexpected'` and `result`. Start `rejects.toThrow('Agent runtime returned an invalid JSON-RPC message')`.
- **L559 — `it('reports stdin failure with bounded private stderr diagnostics', ...)`.** Buffer size 12; writes `0123456789abcdef`, emits stdin `broken pipe`, writes `tail`, closes. Failure promise resolves matching message `broken pipe`; diagnostic sink exactly `['Agent runtime stderr before failure:\n89abcdeftail']`; after close health exactly unavailable/empty capabilities/`broken pipe`.
- **L591 — `it('becomes unavailable when the protocol output closes', ...)`.** Ends stdout after start. Runtime-failed promise resolves matching `Agent runtime protocol stream closed unexpectedly`; health status unavailable.
- **L613 — `it('times out a silent request and becomes unavailable', ...)`.** Suppresses initialize; timeout 10 ms. `runtime.start()` rejects exact `Agent runtime request "initialize" timed out after 10ms`; health exactly unavailable/empty capabilities/same error.

### Method/tier: task-manager state-machine unit tests

#### File `tests/task-manager.test.ts`

Environment: Vitest Node with `FakeRuntime`. Production target: `AgentTaskManager` start/get/connect/cancel/permission APIs and runtime-event handling. Exact describe block: `describe('Agent task manager', ...)` (L52).

##### `describe('Agent task manager', ...)` (L52)

- **L53 — `it('keeps concurrent task streams, results, and cancellation isolated', ...)`.** Concurrently starts fixed first/second IDs and separate listeners. Initial statuses exactly `['running','running']`; thread/turn objects differ. After first reasoning, second search, first final/completion: first types exactly `['message','completed']`, second `['activity']`; first completed/output `{contacts:[]}`, second running/output null. Cancelling second records exact interruption `{threadId,turnId}`; first remains completed/output, second cancelled/output null; final types remain first list and second exactly `['activity','cancelled']`.
- **L127 — `it('routes concurrent permission requests to their exact task', ...)`.** Emits different permissions for two tasks. Cross-task resolutions return false; correct first approve/second decline true; decisions exactly `[{permissionId:'first-permission',decision:'approve'},{permissionId:'second-permission',decision:'decline'}]`; each replay's latest event matches its own permission-required ID.
- **L178 — `it('delivers live events only while a listener is subscribed', ...)`.** Subscribes, emits `First update`, unsubscribes, emits `Second update`; streamed `[id,type]` exactly `[[2,'message']]`.
- **L204 — `it('stores final structured output and replays its ordered event sequence', ...)`.** Emits reasoning `Comparing relevant employees`, final contacts JSON, completion. Task matches completed/output contacts; replay `[id,type]` exactly `[[1,'activity'],[2,'message'],[3,'completed']]`; second event matches `{type:'message',textDelta:'Comparing relevant employees'}`.
- **L245 — `it.each(... )('accepts output satisfying the generated %s contract', ...)`.** Each starts with its generated schema, emits `JSON.stringify(output)` then completed, and verifies `manager.get(id).toEqual({...started,status:'completed',output})`.
    - Contact-discovery output `{personName:'Ada Lovelace',personTitle:'Engineering Manager',profileUrl:'https://www.linkedin.com/in/ada-lovelace',relevanceRationale:'Her visible role aligns with the team.',draftMessage:'Hi Ada, could I ask about the team?'}` → **`accepts output satisfying the generated contact discovery contract`**.
    - Draft output `{draftMessage:'Hi Ada, could I ask about the engineering team?',response:'I made the message more specific.'}` → **`accepts output satisfying the generated draft revision contract`**.
    - Full strict user-added fixture → **`accepts output satisfying the generated user-added job post contract`**.
- **L296 — `it('rejects report-only fields from the generated user-added post contract', ...)`.** Emits full fixture plus `agentRank:1`, then completes. Task `toMatchObject({status:'failed',output:null,error:expect.any(String)})`.
- **L323 — `it('rejects malformed URLs from the generated user-added post contract', ...)`.** Emits fixture with `postUrl:'https://%'`, completes; same exact failed/null/string match.
- **L353 — `it.each(... )('rejects a %s output schema before starting the runtime', ...)`.** Every `manager.start` `rejects.toBeInstanceOf(InvalidAgentOutputSchemaError)` and `runtime.startAttempts.toBe(0)`.
    - `malformed`, schema `{type:'not-a-json-schema-type'}` → **`rejects a malformed output schema before starting the runtime`**.
    - `asynchronous`, schema `{$async:true,type:'object'}` → **`rejects a asynchronous output schema before starting the runtime`**.
    - `non-object`, schema `{type:'array'}` → **`rejects a non-object output schema before starting the runtime`**.
    - `dialect marker`, root draft-07 `$schema` → **`rejects a dialect marker output schema before starting the runtime`**.
    - `nested dialect marker`, `properties.value` has draft-07 `$schema`/string → **`rejects a nested dialect marker output schema before starting the runtime`**.
    - `unsupported format`, `properties.email={type:'string',format:'email'}` → **`rejects a unsupported format output schema before starting the runtime`**.
- **L390 — `it('marks boundaries between fragmented reasoning summary sections', ...)`.** Emits indexed deltas `[0,'**Reviewing ']`, `[0,'the role**']`, `[1,'**Finding ']`, `[1,'the team**']`; message array exactly equals four `expect.objectContaining` values with those texts and statement flags `true,false,true,false`.
- **L422 — `it('fails a completed turn whose final output is not JSON', ...)`.** Emits final `not json` and completed; task matches `{status:'failed',output:null,error:expect.any(String)}`.
- **L442 — `it('fails a completed turn whose output does not match the requested schema', ...)`.** Emits `{"wrong":true}` and completed; task has failed/null/string error; replay `.some(type==='completed')` is false.
- **L467 — `it('preserves the runtime error when a turn fails', ...)`.** Emits failed turn completion/error `runtime failure`; task matches `{status:'failed',error:'runtime failure'}`.
- **L485 — `it('interrupts a running task and records cancellation as a terminal event', ...)`.** Cancels; interruptions exactly one matching started thread/turn; result matches `{accepted:true,task:{status:'cancelled',output:null,error:null}}`; latest event matches cancelled.
- **L504 — `it('coalesces concurrent cancellation requests', ...)`.** Holds one interrupt and calls cancel twice. After one resolution, interruptions length 1; results equal two `expect.objectContaining({accepted:true})`; cancelled events length 1.
- **L533 — `it('keeps a completed result when completion wins the cancellation race', ...)`.** Holds then rejects interrupt after final contacts/completed. Result matches `{accepted:true,task:{status:'completed',output:{contacts:[]}}}`; cancelled event count 0.
- **L571 — `it('keeps a task running when interruption fails before a terminal event', ...)`.** Interrupt throws `Could not interrupt turn`; cancel rejects exact text; task matches running/output null/error null; cancelled count 0.
- **L592 — `it('records an interrupted turn as cancelled instead of failed', ...)`.** Emits completion status `interrupted`; task matches cancelled/output null/error null; latest event matches cancelled.
- **L614 — `it('fails running tasks once when the runtime fails and preserves completed tasks', ...)`.** Completes first, starts second, emits identical `Error('Agent runtime exited')` twice. First matches completed/output contacts/error null; second failed/output null/exact error; failed events length 1.

## Package `server`

### Package/config method overview

- Unit command: `pnpm --filter server test` → `vitest run --exclude 'tests/integration/**'`; Vitest 4.1.9, no config/pragma, default Node/TS-ESM. Route tests use in-process Express/Supertest and `vi.fn` repositories, not a database. `health.test.ts` imports the full app but requests only health/invalid-ID paths.
- Integration entry: root `pnpm test:integration` runs `node packages/app/server/tests/run-integration.ts`. It requires `TEST_DATABASE_URL`, decodes its database name and refuses anything not ending `_test`, exports it as `DATABASE_URL`, runs Prisma generate and migrate deploy, then `vitest run tests/integration`.
- The integration file repeats the `DATABASE_URL`/`_test` guard, uses real PostgreSQL/Prisma repositories, deletes `outreachContact`, `outreachRun`, `userAddedJobPost`, `jobSearchResult`, `jobSearchReport`, then `jobPost` before each test, and disconnects after all.

### Method/tier: in-process HTTP route unit tests

#### File `tests/health.test.ts`

Environment: Vitest Node + Supertest/full app.

##### `describe('GET /health', ...)` (L5)

- **L6 — `it('reports that the server is healthy', ...)`.** GET `/health` exactly `.expect(200,{status:'healthy'})`.

##### `describe('API routes', ...)` (L11)

- **L12 — `it.each(['/api/job-posts/invalid-id','/api/job-search-reports/invalid-id'])('mounts %s', ...)`.** Each GET checks status 400 only; no body assertion.
    - **`mounts /api/job-posts/invalid-id`**.
    - **`mounts /api/job-search-reports/invalid-id`**.

#### File `tests/outreach-run.test.ts`

Environment: Vitest Node, Express/Supertest, fake repository. Production target: `createOutreachRunRouter` and repository create/find/update contract. Exact describe block: `describe('outreach run routes', ...)` (L55).

##### `describe('outreach run routes', ...)` (L55)

- **L56 — `it.each([2,3] as const)('creates a run for %i requested contacts', ...)`.** POST exact `{jobPostId:existingRun.jobPostId,requestedContactCount:count}`; expects exactly 201 `{...existingRun,...input}`; create called exactly once with input.
    - **`creates a run for 2 requested contacts`**.
    - **`creates a run for 3 requested contacts`**.
- **L71 — `it.each(... )('rejects %s', ...)`.** Each POST expects status 400 only and `create.not.toHaveBeenCalled()`.
    - Unsupported count input `{jobPostId,requestedContactCount:4}` → **`rejects an unsupported contact count`**.
    - Extra-field input `{...existingRun,requestedContactCount:2}` → **`rejects an extra field`**.
- **L85 — `it('returns 404 when the job post does not exist', ...)`.** Repository create resolves null; valid POST expects status 404 only (no body or call matcher).
- **L95 — `it('gets a run by id', ...)`.** GET exact run URL expects exactly 200 and `existingRun`.
- **L103 — `it('records the Agent thread and turn when a run starts', ...)`.** PATCH exact running payload with fixed agent task/thread/turn IDs; expects exactly 200 `{...existingRun,...input}` and update called exactly once with `(existingRun.id,input)`.
- **L120 — `it.each(... )('rejects a run marked %s', ...)`.** Every PATCH expects status 400 only and update not called.
    - `{status:'running'}` → **`rejects a run marked running without task ids`**.
    - `{status:'completed',error:'Unexpected'}` → **`rejects a run marked completed with an error`**.
    - `{status:'failed'}` → **`rejects a run marked failed without an error`**.

#### File `tests/outreach-contact.test.ts`

Environment: Vitest Node, Express/Supertest, fake repository. Production target: nested contact router/repository contract. Exact describe block: `describe('outreach contact routes', ...)` (L60).

##### `describe('outreach contact routes', ...)` (L60)

- **L61 — `it('lists previously discovered contacts for a job post', ...)`.** GET nested route expects exactly 200 `[existingContact]`; `findByJobPostId.toHaveBeenCalledExactlyOnceWith(jobPostId)`.
- **L71 — `it('saves a discovered contact for a job post', ...)`.** POST exact five-field `contactInput`; expects 201 `{...existingContact,messaged:false}`; create exactly once with `(jobPostId,contactInput)`.
- **L82 — `it.each([true,false])('updates a saved contact messaged status to %s', ...)`.** PATCH `{messaged}` expects 200 `{...existingContact,messaged}`; update exactly once `(jobPostId,existingContact.id,{messaged})`.
    - **`updates a saved contact messaged status to true`**.
    - **`updates a saved contact messaged status to false`**.
- **L95 — `it.each(... )('rejects an update with %s', ...)`.** Every PATCH expects status 400 only and update not called.
    - Invalid post ID → **`rejects an update with an invalid job post id`**.
    - Invalid contact ID → **`rejects an update with an invalid contact id`**.
    - `{messaged:'yes'}` → **`rejects an update with a non-boolean status`**.
    - `{messaged:true,personName:'Grace'}` → **`rejects an update with an extra field`**.
    - `{}` → **`rejects an update with an empty body`**.
- **L112 — `it('returns 404 when updating a missing outreach contact', ...)`.** Update resolves null; valid `{messaged:true}` PATCH expects status 404 only (no body/call matcher).
- **L122 — `it.each(... )('rejects %s', ...)`.** Each POST expects status 400 only and create not called.
    - `postId:'invalid-id'` → **`rejects an invalid job post id`**.
    - `profileUrl:'https://example.com/ada-lovelace'` → **`rejects a non-LinkedIn profile URL`**.
    - Input plus `messaged:true` → **`rejects a client-provided messaged status`**.
- **L141 — `it('returns 404 when saving against a missing job post', ...)`.** Create resolves null; valid POST expects status 404 only (no body/call matcher).

#### File `tests/job-post.test.ts`

Environment: Vitest Node, Express/Supertest, fake repository. Production target: `createJobPostRouter` list/get/add/refresh/update routes. Exact describe block: `describe('job post routes', ...)` (L112).

##### `describe('job post routes', ...)` (L112)

- **L113 — `it('lists job posts', ...)`.** GET `/job-posts` exactly 200 `[existingPost]`; `findMany.toHaveBeenCalledOnce()`.
- **L121 — `it('lists posts in the Apply queue', ...)`.** GET `/job-posts/apply-queue` exactly 200 `[applyQueueItem]`; `findApplyQueue` called once.
- **L131 — `it('lists posts added by the user', ...)`.** GET `/job-posts/user-added` exactly 200 `[userAddedPost]`; `findUserAdded` called once.
- **L141 — `it('adds a new user-added post', ...)`.** POST exact `createUserAddedPostInput` expects exactly 201 `userAddedPost`; `upsertUserAdded` exactly once with input.
- **L152 — `it('refreshes an existing user-added post', ...)`.** Mock returns `{item:userAddedPost,created:false}`; same POST expects exactly 200 `userAddedPost`; exact upsert call with input.
- **L167 — `it.each(... )('rejects %s without adding a post', ...)`.** Every POST expects status 400 only and upsert not called.
    - Adds top-level `agentRank:1` → **`rejects a report-only recommendation field without adding a post`**.
    - Adds `post.applicationStatus:'interviewing'` → **`rejects a user-owned post field without adding a post`**.
    - Sets `postUrl:'ftp://example.com/jobs/123'` → **`rejects an invalid listing URL without adding a post`**.
- **L197 — `it('gets a job post by id', ...)`.** GET fixed existing UUID exactly 200 `existingPost`; `findById.toHaveBeenCalledExactlyOnceWith(existingPost.id)`.
- **L207 — `it('forwards an allowed update and returns the updated post', ...)`.** PATCH exact `{applicationStatus:'interviewing',postStatus:'closed',userLabel:'forgo',archivedAt:'2026-07-12T12:00:00.000Z'}`; expects 200 `{post:{...existingPost,...input},inApplyQueue:false}`; update exactly once with ID/input.
- **L227 — `it.each(... )('rejects %s without updating', ...)`.** Each PATCH expects status 400 only and update not called.
    - `{archivedAt:'not-a-date'}` → **`rejects an invalid field value without updating`**.
    - `{roleTitle:'Changed title'}` → **`rejects an extra field without updating`**.
    - `{}` → **`rejects an empty body without updating`**.
- **L242 — `it('returns 404 for a missing valid UUID', ...)`.** `findById` returns null; GET fixed missing UUID expects status 404 only and exact repository call with missing ID.

#### File `tests/search-report.test.ts`

Environment: Vitest Node, Express/Supertest, fake repository. Production target: `createSearchReportRouter` list/get/deterministic snapshot replacement validation. Exact describe block: `describe('job search report routes', ...)` (L112).

##### `describe('job search report routes', ...)` (L112)

- **L113 — `it('lists job search reports', ...)`.** GET collection exactly 200 `[existingReport]`; `findMany` once.
- **L123 — `it('gets a job search report by id', ...)`.** GET fixed ID exactly 200 `existingReport`; `findById` exactly once with ID.
- **L133 — `it('forwards a valid dated snapshot and returns 201 when it is created', ...)`.** PUT date/ID with exact `input`; expects exactly 201 `existingReport`; upsert exactly `(id,'2026-07-12',input)`.
- **L144 — `it('accepts an empty replacement snapshot and returns 200 for an existing report', ...)`.** Replacement `{summary:'No matching roles today',results:[]}` and mock `created:false`; expects exact 200 replaced report and exact upsert `(id,date,replacement)`.
- **L167 — `it.each(... )('rejects whitespace-only %s without writing', ...)`.** Each clone changes only the named field to `' '`, PUT expects 400 only, and upsert not called.
    - `input.summary` → **`rejects whitespace-only summary without writing`**.
    - `results[0].applicationFlow` → **`rejects whitespace-only application flow without writing`**.
    - `keyLegitimacySignals` → **`rejects whitespace-only legitimacy signals without writing`**.
    - `legitimacyNotes` → **`rejects whitespace-only legitimacy notes without writing`**.
    - `post.location` → **`rejects whitespace-only location without writing`**.
    - `post.compensation` → **`rejects whitespace-only compensation without writing`**.
    - `post.techStack` → **`rejects whitespace-only technology stack without writing`**.
- **L209 — `it.each(... )('rejects an unsafe %s without writing', ...)`.** Each replaces first result's post field; PUT expects 400 only, upsert not called.
    - `postUrl:'javascript:alert(1)'` → **`rejects an unsafe post URL without writing`**.
    - `applicationUrl:'ftp://example.com/job'` → **`rejects an unsafe application URL without writing`**.
- **L226 — `it.each(... )('rejects %s without writing', ...)`.** Every PUT expects status 400 only and upsert not called.
    - Path date `2026-02-30` → **`rejects an invalid date without writing`**.
    - Path report ID `invalid-id` → **`rejects an invalid report id without writing`**.
    - Adds post `applicationStatus:'interviewing'` → **`rejects a user-owned post field without writing`**.
    - Adds second result with duplicate rank 1 → **`rejects duplicate agent ranks without writing`**.
    - Adds rank-2 result with duplicate source key → **`rejects duplicate post source keys without writing`**.
- **L290 — `it('returns 404 for a missing valid report id', ...)`.** `findById` returns null; GET fixed missing UUID expects status 404 only and exact call with missing ID.

### Method/tier: real PostgreSQL/Prisma repository integration tests

#### File `tests/integration/search-report.repository.test.ts`

Environment: guarded `_test` PostgreSQL database with real Prisma singleton repositories and destructive per-test table cleanup described above; no repository fakes.

##### `describe('job post repository', ...)` (L106)

- **L107 — `it('persists and lists a user-added post without a search report', ...)`.** Calls `upsertUserAdded(default input)`, then lists and counts. Verifies `created.created.toBe(true)`, items exactly `[created.item]`, counts: jobPost 1, userAddedJobPost 1, jobSearchReport 0, jobSearchResult 0.
- **L126 — `it('lists user-added posts newest first with a stable post ID tie-break', ...)`.** Upserts three; directly sets first membership `2026-07-20T12:00Z`, second/third `2026-07-21T12:00Z`. Sorts tied IDs lexically and expects list IDs exactly `[...tiedPostIds,first.id]`.
- **L159 — `it('reuses a report post while preserving user state and refreshing standalone analysis', ...)`.** Creates report/canonical post, updates user state to interviewing/forgo/archive, then creates and refreshes standalone membership/analysis/listing. Verifies first `created:true`, refresh `created:false`; refreshed item matches new analysis and original `addedAt`, same post ID/source, Staff/Updated Company/closed plus preserved user state. User-added list exactly `[refreshed.item]`; report keeps original report recommendation but points to refreshed canonical post; counts post 1/membership 1/result 1.
- **L233 — `it('keeps standalone membership and analysis when a later report refreshes the post', ...)`.** Creates standalone with exact standalone fit/recommendation, updates user state, then imports same source via later report with different report analysis and refreshed listing. Verifies report post ID equals standalone ID; user-added listing retains standalone analysis/addedAt and canonical refreshed Staff/Updated/closed listing plus interviewing/P1/archive; DB post and membership counts each 1.
- **L294 — `it('defines the Apply queue by application status and user label', ...)`.** Creates six posts with labels `[P1,P1,P2,quick-app,forgo,null]`; update `inApplyQueue` results exactly `[true,true,true,true,false,false]`. Changing first to awaiting-response makes false. Queue source keys have length 3 and `arrayContaining(['example-source:1','example-source:2','example-source:3'])`.
- **L336 — `it('selects one deterministic report recommendation for each Apply queue post', ...)`.** Creates four shared-post reports varying date/time/ID/rank, archives the later fourth report, labels shared P1, creates orphan P2. Queue selected recommendation `toMatchObject({reportId:reports[3].id,reportDate:reports[3].reportDate,agentRank:9})`; orphan recommendation `toBeNull()`.

##### `describe('outreach run repository', ...)` (L426)

- **L427 — `it('persists the Agent task lifecycle for a job post', ...)`.** Creates report/post/run for 3 contacts; created run `not.toBeNull()`. Updates running with fixed task/thread/turn IDs then completed. Running matches exact status/IDs; completed matches `{status:'completed',error:null}` and `completedAt.not.toBeNull()`.

##### `describe('outreach contact repository', ...)` (L465)

- **L466 — `it('stores, updates, and lists job-post contacts', ...)`.** Creates exact Ada/Grace contacts. Wrong-post update returns null; correct Ada update returns object matching `{id:first.id,jobPostId,messaged:true}`; Grace matches `{jobPostId,messaged:false}`; list length 2, IDs `arrayContaining` both, found Ada `messaged.toBe(true)`.

##### `describe('search report repository', ...)` (L512)

- **L513 — `it('replaces one report run without duplicating the report', ...)`.** Initial same-ID/date report has two ranks; replacement has one refreshed second-source result. Initial `created:true`, replacement `created:false`; replacement report matches same ID/new summary and exactly one result with replacement flow/signals/source/role; counts report 1/result 1.
- **L572 — `it('creates separate reports for runs on the same date', ...)`.** Upserts IDs 1111/2222 on same date with First/Second summaries. Both `created.toBe(true)`; list length 2 and IDs `arrayContaining` both returned IDs.
- **L594 — `it('shares canonical posts while preserving user state during listing refreshes', ...)`.** First report creates shared post, user state becomes interviewing/forgo/archive; second report same source refreshes all listing fields. Refreshed post matches same ID/source, all new listing values, and preserved user values. Counts post 1/reports 2/memberships 2; each reread report post `toEqual(refreshedPost)`.
- **L668 — `it('rolls back a failed replacement after deleting prior joins', ...)`.** Creates stable snapshot then attempts same-report replacement with duplicate rank 1. `upsertById(...).rejects.toThrow()`; saved report `toEqual(initial.report)` and report/result/post counts each 1.

## Package `@job-search-facilitator/core`

### Package/config method overview

`pnpm --filter @job-search-facilitator/core test` runs `node --test scripts/*.test.ts` under the repository's Node `>=24 <25` engine, direct TS/ESM. These use built-in `node:test` and `node:assert/strict`, not Vitest. Neither file contains a `describe` block.

### Method/tier: destructive-command process-guard tests

#### File `scripts/assert-local-database.test.ts`

Environment: Node test runner. Production target: `assert-local-database.ts`. Every case launches `process.execPath [guardPath]`, copies the process environment, replaces `DATABASE_URL`, ignores child stdio, and asserts the exit status. Exact describe block: **none**.

- **L14 — `test('allows resetting the default loopback database', ...)`.** URL exactly `postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator`; `assert.equal(guardExitStatus(url),0)`.
- **L23 — `test('rejects resetting a remote database', ...)`.** URL exactly `postgresql://job_search:local_dev_password@database.example.com:5432/job_search_facilitator`; `assert.notEqual(guardExitStatus(url),0)`.
- **L32 — `test('rejects resetting another loopback database', ...)`.** URL exactly `postgresql://job_search:local_dev_password@localhost:5432/job_search_facilitator_backup`; `assert.notEqual(guardExitStatus(url),0)`.

### Method/tier: runtime schema/parser unit tests

#### File `scripts/runtime-contracts.test.ts`

Environment: Node test runner. Production targets: strict core parsers for create/saved user-added posts. Exact describe block: **none**. The shared strict input is `{agentLabel:'target',fitRationale:'Strong TypeScript experience',applicationFlow:'Direct company application',keyLegitimacySignals:'Listed on the company careers page',recommendedResume:'frontend',recommendedAction:'Apply today',legitimacyNotes:null,post:{sourceKey:'example-source:123',roleTitle:'Software Engineer',company:'Example Company',location:'Detroit, MI',compensation:'$120,000',techStack:'TypeScript, Vue, Node.js',postSource:'Example Source',postUrl:'https://example.com/jobs/123?source=search#apply',applicationUrl:'https://apply.example.com/jobs/123',postStatus:'active'}}`.

- **L47 — `test('parses a strict user-added job post input', ...)`.** `assert.deepEqual(parseCreateUserAddedJobPostInput(input),input)`.
- **L51 — `test('rejects extra fields from a user-added job post input', ...)`.** Adds `agentRank:1`; `assert.throws(() => parseCreateUserAddedJobPostInput(...))`.
- **L55 — `test('rejects malformed HTTP URLs from a user-added job post input', ...)`.** Sets `post.postUrl:'https://%'`; `assert.throws(() => parseCreateUserAddedJobPostInput(...))`.
- **L64 — `test('parses a saved user-added job post', ...)`.** Saved fixture adds fixed UUID, user state, archive, post timestamps, and membership `addedAt`/`updatedAt`; `assert.deepEqual(parseUserAddedJobPost(item),item)`.
- **L68 — `test('parses a list of saved user-added job posts', ...)`.** `assert.deepEqual(parseUserAddedJobPosts([item]),[item])`.
- **L72 — `test('rejects a saved user-added job post without membership timestamps', ...)`.** Removes `addedAt`; `assert.throws(() => parseUserAddedJobPost(invalidItem))`.

## Package `@job-search-facilitator/utils`

### Package/config method overview

Package root `packages/utils`. Its scripts contain only `typecheck`; it has no `test` script and no test files. Therefore there are **0 syntactic declarations and 0 expanded runnable cases**.

## Audit/reconciliation method

This inventory was produced from the current source without executing any `it`/`test` callback. The declaration census used the syntactic pattern `\b(?:it|test)(?:\.each)?\s*\(` over `packages/app/client/src/__tests__`, `packages/app/agent-bridge/tests`, `packages/app/server/tests`, and `packages/core/scripts`, restricted to `*test.ts`, then reconciled per file and package. Every parameter table and enclosing `describe.each` was inspected to calculate expanded rows. Vitest's `list` collector confirmed 181 client, 50 Agent Bridge, and 60 server-unit expanded cases; static Vitest parsing confirmed the 12 database integration cases without requiring `DATABASE_URL`; Core's 9 `node:test` cases were checked from source. The final totals are 267 declarations (258 Vitest `it*`, 9 Node `test`) and 312 expanded cases.
