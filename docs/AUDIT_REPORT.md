# GymOS Full-App Audit Report — 2026-11-14

Read-only audit. Nothing was changed. 5 reviewers covered members UI, money
flows, SMS end-to-end, worker API + database, and UX/tablet dead-ends.
148 findings below (17 P0, 68 P1, 63 P2), each with the exact file,
symbol, and fix.

Severity: P0 = broken money / broken SMS / broken writes / auth hole.
P1 = wrong behavior staff will hit weekly. P2 = polish, edge cases, hardening.

Spot-checks I verified myself in the code (not just reviewer claims):
- `workers/gymos-api/src/index.js:3007` writes `avatar`, zero `avatar` in any
  migration (P0 #1 confirmed).
- Hardcoded gmails at `index.js:65-68` and `:616` (P0 #2 confirmed).
- `visit_date=lt.YYYY-MM-32` at `index.js:1290`, an invalid date (P1 confirmed).

## P0 — fix before January (17)

1. **All member writes can 400.** `memberInputToDb` writes `members.avatar`
   but no migration creates that column.
   Fix: add `avatar text` migration (or drop avatar from writer/mapper).
2. **Auth runs on hardcoded gmails.** `explicitRoleFromUser`: one gmail is
   always developer, 4 gmails are the trainer fallback.
   Fix: authorize by `app_metadata.role` only + env `DEVELOPER_EMAILS`; delete
   email literals.
3. **Rate limit is per-isolate.** `applyRateLimit` uses an in-memory Map, each
   Cloudflare isolate gets a fresh bucket.
   Fix: enforce via CF Rate Limiting / KV / Durable Object keyed scope+IP.
4. **Receipt double-write on retry.** `createPaymentReceipt` has no idempotency
   key; a retried POST writes duplicate receipts and double-counts collected.
   Fix: require `clientRequestId`, unique `(member_id, client_request_id)`,
   return existing on conflict.
5. **Renew duplicates on retry.** `renewMember` retried PATCH duplicates
   `renewal_history` + receipts and re-rolls arrears.
   Fix: require `clientRequestId` unique in `renewal_history.client_request_id`;
   return prior result on conflict.
6. **Renew trusts client due date.** `validateRenewInput`: a 1 Month renew can
   store a 1-day or 2-year due.
   Fix: recalc fixed-plan due via `calculatePlanDueDate` like member create;
   reject mismatch.
7. **Fees default doubles arrears.** `RenewModal` defaults fees to
   `member.feesAmount` (already includes arrears), then Total adds balance
   again — arrears double every cycle if accepted.
   Fix: default to base fee (`latest renewal_history.amount`);
   total = base + arrears.
8. **Stats erase history.** `analytics.ts:summarizePeriod` sums each member's
   CURRENT cycle only, so every renew wipes prior-cycle money from This
   Month / All Time.
   Fix: sum collected from `payment_receipts` by `paid_on`, expected from
   `renewal_history` + current fees.
9. **Short plans show dues "N/A".** `dueCountdown` + table + profile hide the
   real expiry for <30d Custom plans, yet the backend still expires them.
   Fix: always render `formatDisplayDate(membershipDue)` + countdown labeled
   "Plan End".
10. **SMS hidden for short plans.** Table (row + card) and profile hide the SMS
    button for short-term members, though `/sms/send` already permits them.
    Fix: render SMS whenever `status !== 'Deleted'`.
11. **No Suspend/Delete on profile.** Trainer must leave the profile and hunt
    the table row.
    Fix: add Suspend/Unsuspend/Delete buttons reusing Dashboard confirm flows.
12. **Visit weights go nowhere.** `useMembers.addVisit` never updates
    `member.weightKg`/BMI; profile shows join weight forever.
    Fix: after save, set weightKg/bmi to latest visit weight when provided.
13. **Auto-reminders skip short plans.** `runSmsReminder` skips Custom <30d in
    all 3 sweeps (3-day, due-day, winback) with only an unpersisted counter.
    Fix: drop the `isMemberPlanLessThanOneMonth` gates, persist
    `sms_last_run_skipped`, show it in health card + settings + dev console.
14. **Failed sends can vanish as "queued".** `dispatchSms`: if the sms_logs
    migration is unapplied, failed sends return `queued` with `logId null` —
    zero sweep coverage, message lost while UI says auto-retrying.
    Fix: when log is null and send fails, throw ApiError instead of `queued`.
15. **Renewal receipt-SMS is swallowed.** `renewMember` discards the receipt SMS
    result, so a failed renewal SMS is invisible.
    Fix: return `receiptSms` in the renew response and toast it like
    `handleAddPaymentReceipt` does.
16. **Health lies about the phone.** `smsHealth`: a wrong saved deviceId falls
    back to `devices[0]` with `matched=true` — green row while every send
    pins the bad id.
    Fix: when wantId is set and unmatched, `matched=false` + error naming it.
17. **Settings status badge is fake.** SettingsModal status tab shows
    "Reminders Connected" from env/Supabase config — true with wrong SMS
    creds or the phone offline.
    Fix: render live `api.smsHealth()` configured+auth+phone summary, or
    deep-link to the SMS Setup health card.

## P1 — members, money, renew (31)

18. **Expired computed in 3 different ways.** Table recomputes Expired inline;
    profile badges and FilterBar counts use raw status (due-today unpaid shows
    Active in one place, Expired in another).
    Fix: shared `getDisplayStatus()` in utils, used everywhere.
19. **Dead sort headers.** Table holds sorting state but headers are plain
    text; only default regNo order works.
    Fix: wrap headers in sort buttons calling `toggleSorting()` with aria-sort
    + direction icons.
20. **Attendance double-logs.** Duplicate-date guard exists only in the demo
    branch; live API double-submits duplicate or 500 on the unique index.
    Fix: client visitDate check before `api.createAttendance` + catch
    PostgREST 409/23505 as 409 VISIT_ALREADY_LOGGED.
21. **Dead Add Visit tap.** Empty/future date silently does nothing.
    Fix: disable button when invalid + inline error "Pick today or a past
    date".
22. **Fake attendance save.** A 1500ms timeout/void callback clears weight and
    shows "Adding" even when the save fails.
    Fix: make `onAddVisit` return a Promise, await it, clear weight only on
    success.
23. **Bad weight silently dropped.** Invalid weight becomes `undefined` with no
    message.
    Fix: inline error when entered weight is not a number > 0.
24. **Visits in wrong order.** Shown in insertion order, newest not first.
    Fix: sort by visitDate descending.
25. **Phone field breaks typing.** `MemberSheet` phone onChange mutates
    `target.value` directly (breaks caret + paste).
    Fix: remove the mutation; normalize in `valuesToMemberInput` only.
26. **Form edits wiped.** `reset(initialValues)` on any identity change wipes
    in-flight edits.
    Fix: reset only when open flips false->true or `member.id` changes.
27. **Couple switch trap.** An existing member can switch trainingType to
    Couple, but the partner section never shows — saves a single record.
    Fix: disable the Couple option in edit mode with helper text.
28. **Due Soon hides short plans.** Quick counts + Dashboard filter + Renewal
    Radar + stats windows + follow-ups all exclude short plans that do expire.
    Fix: drop `isPlanLessThanOneMonth`; include short plans with "Plan End".
29. **Wrong month-filter label.** Merges joinDate + membershipStart but says
    "Joining Month".
    Fix: filter joinDate only, or rename "Join/Start Month".
30. **Restore has no confirm.** One tap restores, unlike suspend/delete.
    Fix: wrap `handleRestore` in ConfirmModal like suspend.
31. **Future paid dates.** Profile Paid Date + `validatePaymentReceiptInput`
    accept future `paidOn`, inflating collected before cash arrives.
    Fix: `max={todayISO()}` in UI + reject `paid_on` > today IST with 400.
32. **Phone search fails.** Query with spaces/dashes never matches.
    Fix: compare digit-stripped query against `member.phone`.
33. **0-day plans allowed.** Custom plans allow due == start; no min guard
    until submit.
    Fix: require `membershipDue > membershipStart` in schema + RenewModal +
    `assertDueDateOrder`; `min={membershipStart}` on the input.
34. **Renewal receipts always say Cash.** No method input; UPI/Card renewals
    mislabeled (demo path identical).
    Fix: add method via `assertEnum(PAYMENT_METHODS)` default Cash + RenewModal
    select; persist on the receipt.
35. **Suspended renew reactivates silently.** `renewMember` flips Suspended to
    Active via `deriveMembershipStatus`.
    Fix: keep Suspended unless `body.unsuspend===true`, else 409
    MEMBER_SUSPENDED (or block with unsuspend-first / explicit confirm).
36. **Edit-member desyncs the ledger.** `updateMember` overwrites
    partial/balance from status without reconciling `payment_receipts`.
    Fix: recompute from receipt totals on edit; reject fees below receipt
    total.
37. **Receipt-no collision is a raw 500.** Custom `receipt_no` hits the unique
    index as raw Supabase error.
    Fix: catch unique violation, return 409 RECEIPT_NO_TAKEN with friendly
    message.
38. **Backdated receipts vanish.** `paymentReceiptTotal` filters `paid_on >=
    membershipStart`, so backdated receipts are excluded and balance/arrears
    overstate.
    Fix: scope receipts to the cycle by created_at/renewal id, not editable
    `paid_on`.
39. **Ledger mixes cycles.** Profile ledger lists ALL cycles while
    Collected/Balance math uses current cycle only.
    Fix: filter ledger to `paid_on >= membershipStart`; show older cycles
    collapsed.
40. **Collected-today uses UTC.** `toISOString` date puts 00:00-05:30 IST
    takings on the wrong day.
    Fix: compare `paidOn` against local YYYY-MM-DD (`todayISO()`).
41. **Renewals report rewrites history.** "Renewals Started" derives from live
    member rows, so each re-renew rewrites history and only the latest cycle
    counts.
    Fix: drive it from `renewal_history.new_start_date`.
42. **Range stats drop old members' cash.** `getMembersForAnalyticsRange` keys
    on join/membershipStart, so this month's collections from older members
    are excluded.
    Fix: attribute collection by receipt `paid_on` inside the range.
43. **Aged dues vanish.** Expired dues older than 30 days return 0 —
    gone from Pending totals, follow-ups, table Due, payments report.
    Fix: keep an Aged bucket in totals + an aged-dues report instead of
    zeroing.
44. **Suspended dues vanish.** `isCollectible` returns false for Suspended, so
    real dues disappear from every pending surface.
    Fix: treat Suspended as collectible (own bucket) until waived or deleted.
45. **Renewal history math wrong.** `summarizeRenewalHistory` charges FULL
    amount ignoring partials; total excludes `arrearsCarried`.
    Fix: total = amount + arrearsCarried; pending = total − collected at
    renewal (store it).
46. **Waived dues leave no trace.** Unchecking carry-forward erases old dues
    with `arrears_carried=0` and no waiver record.
    Fix: persist the waived amount (new column or receipt note) for audit.
47. **Dead stats endpoint.** `/dashboard/stats` is uncalled (frontend computes
    locally) and returns snake_case vs the camelCase type.
    Fix: wire it with a camelCase mapper, or delete endpoint +
    `api.dashboardStats`.
48. **Renew total display vs charge differ.** Modal previews stored
    `balanceAmount` but the server charges receipt-recomputed arrears.
    Fix: preview arrears from member receipts (`paid_on >= start`) like the
    server.

## P1 — SMS, worker API, DB (21)

49. **Test-SMS mangles numbers.** `SmsSettingsPanel.handleTest` does
    `slice(-10)`, truncating 12-digit 91-prefixed input into a wrong number
    that still passes validation.
    Fix: validate raw digits first (10 digits, or 12 starting with 91),
    reject otherwise.
50. **Suspended members get no auto-reminders.** They match no reminder query
    yet can owe dues.
    Fix: include Suspended in 3-day/due-day queries, or document the
    exclusion in Settings copy.
51. **Pending counted as sent.** `observeProviderState` + retry sweep return
    "accepted" for Pending/Cancelling/unrecognized rows though undelivered.
    Fix: distinct `pending` verdict counted as queued/waiting; `sent` only on
    sent/delivered.
52. **Re-runs inflate counts.** `tallyReminderOutcome` tallies dedup replays
    (`duplicate:true`) as fresh sent/queued.
    Fix: skip tally when `outcome.duplicate` is true.
53. **API allows SMS enabled without username.** `validateSmsSettingsInput`
    lets `sms_enabled=true` with empty username (only the frontend blocks
    it), guaranteeing SMS_NOT_CONFIGURED.
    Fix: reject enabled-without-username-or-password with INVALID_INPUT.
54. **Devs can't test member SMS.** Developers get 403 on `/sms/send`, so the
    dev console can't verify the real member path.
    Fix: allow developer role on `/sms/send` send-only, or add a dev
    member-send action.
55. **Payment template ignores partials.** `pending-payment` template uses full
    `feesAmount` as still pending for partially-paid members.
    Fix: use `member.balanceAmount` with `feesAmount` fallback.
56. **Progress template says "other".** Uses `member.goal` raw, rendering "your
    other progress" when goal is Other.
    Fix: use `displayGoal(member)` which honors `goalOther`.
57. **Test endpoints skip validation.** `/sms/test` + `/developer/
    test-notification` have no min-length check (unlike `/sms/send`) and no
    idempotency.
    Fix: apply the same 12..320 length validation + accept/forward
    `clientRequestId`.
58. **Suspend toggles.** Second PATCH to `.../suspend` unsuspends, and the
    unsuspend branch ignores payment status.
    Fix: suspend-only/idempotent; unsuspend via restore/`{status}` reusing
    `deriveMembershipStatus`.
59. **Month filter is an invalid date.** `listAttendance` builds
    `visit_date=lt.YYYY-MM-32`, which Postgres rejects — every `?month=`
    query errors.
    Fix: compute first-of-next-month as the exclusive upper bound.
60. **Future visit dates accepted.** `validateAttendanceInput` allows any real
    date.
    Fix: reject `visit_date` after today IST with 400 INVALID_DATE.
61. **Pagination broken.** `listMembers`: limit unclamped, ignored unless page
    is set, and page=0/limit=0 silently dump the table.
    Fix: clamp limit 1..200 default 50; apply when either param is present.
62. **Unbounded list endpoints.** `payments/all`, `renewals/all`,
    `attendance/all` run unbounded `select *`.
    Fix: add limit (default 200, max 1000) + offset to all three.
63. **Member writes un-rate-limited.** POST/PUT/DELETE /members + POST
    /attendance have no limit while batch/renew/payments do.
    Fix: apply the members-write bucket (30/15min) to every member +
    attendance write.
64. **Unknown cron mass-sends.** `handleScheduled`: any unrecognized
    `controller.cron` falls through and runs BOTH expiry + SMS sweeps.
    Fix: unknown cron must log and return; share cron strings with
    `wrangler.jsonc`.
65. **Dev settings bypass validation.** `/developer/settings` skips
    `validateSmsSettingsInput` — accepts any `sms_enabled` string and
    unvalidated sim/username.
    Fix: pass the body through `validateSmsSettingsInput` before encrypt/save
    like `/sms/settings`.
66. **Empty settings save "succeeds".** `saveSystemSettings`: unknown-only
    payloads save zero rows yet routes return "saved successfully".
    Fix: return the saved count; throw 400 INVALID_INPUT when no known key
    was provided.
67. **Outages look like bad passwords.** `loginTrainer` catch masks 5xx
    (missing keys, Supabase down) as 401 LOGIN_FAILED.
    Fix: rethrow ApiError status>=500 unchanged; mask only 401/403.
68. **anon grant survives.** `grant select on members to anon` sits behind a
    deny policy — any RLS disable exposes every member.
    Fix: `revoke all on public.members from anon, authenticated`.
69. **Winback flag never resets.** `reset_sms_sent_on_renewal` resets only
    `sms_sent_3days`; winback reset lives only in worker paths.
    Fix: also set `new.sms_sent_winback=false` when `membership_due` changes.

## P1 — tablet UX, feedback, print (16)

70. **Mystery icons in TopBar.** Refresh/Logout are icon-only with hover tips;
    one-tap logout has no confirm.
    Fix: visible labels + logout ConfirmModal.
71. **Row actions untappable.** SMS/edit/suspend/delete are icon-only,
    hover-title, 32–36px; legend hidden below lg.
    Fix: text labels (or persistent legend) + min 44x44px targets.
72. **Cards lie about tappability.** Non-clickable CommandMetric cards share
    hover-lift with tappable InsightMetrics.
    Fix: remove card-hover from CommandMetric; add "Tap to filter" affordance
    on InsightMetric.
73. **Broken welcome CTA.** Prod misconfig shows loadError AND "Add First
    Member" whose save always fails.
    Fix: suppress the welcome CTA whenever loadError is set.
74. **Inputs trigger iOS zoom.** Tailwind text-[13-15px] on inputs beats the
    16px no-zoom guard.
    Fix: enforce min 16px font-size on all input/select/textarea.
75. **Toasts overwrite each other.** Single-slot toast: receipt "saved" is
    erased by a follow-up "SMS failed".
    Fix: queue toasts (array) with stacked display.
76. **Confirm feels dead.** `ConfirmModal` waits on a fake 400ms shake timer
    with no progress label.
    Fix: execute immediately / await `onConfirm` directly with a "Working..."
    busy label.
77. **Backdrop tap kills forms.** Stray backdrop tap discards dirty SMS /
    Settings / Report forms (only MemberSheet guards).
    Fix: disable backdrop-close or confirm discard when dirty.
78. **Receipt print fails silently.** `window.open` returns null when blocked
    (tablet PWA) with zero feedback.
    Fix: check null, toast "Allow popups to print the slip", or print
    in-place.
79. **PDF export fails silently.** Blocked popup returns with zero feedback.
    Fix: toast "Popup blocked - allow popups to open the PDF".
80. **Validation errors off-screen.** Submit sets errors without scrolling;
    the trainer never sees the failing field.
    Fix: scrollTo + focus the first invalid field on submit fail.
81. **Duplicate test-SMS box.** Dev console SMS Playground duplicates the SMS
    panel test box via a different endpoint.
    Fix: remove it; link to the SMS Notifications panel.
82. **Demo exports leak as real.** Demo backup/CSV carry no DEMO marker.
    Fix: prefix demo filenames + JSON note with DEMO.
83. **SMS modal traps you.** After sent/queued the only exit is X; Send stays
    disabled.
    Fix: add a "Done" close button in sent/queued state.
84. **Camera blocked in prod.** `vercel.json` Permissions-Policy `camera=()`
    blocks "Take Live Photo" capture inputs on the deployed app.
    Fix: set `camera=(self)`.
85. **Tablets locked to portrait.** Manifest `orientation: portrait-primary`
    on a landscape desk app.
    Fix: set orientation to "any".

## P2 — polish, edges, hardening (63)

86. Selects show no error text (gender/trainingType/planType/paymentStatus in
    MemberSheet). Fix: render `errors.*.message` under each select.
87. Schema hole: Paid with partial 0 / balance > 0 passes (only Partial is
    checked). Fix: superRefine — Paid requires balance 0, Pending requires
    partial 0.
88. Cleared fees field makes `feesAmount` NaN, total shows NaN. Fix: coerce
    with `Number.isFinite(feesAmount) ? feesAmount : 0`.
89. Advanced filter panel open-state init once; external filter changes don't
    reopen. Fix: sync `isOpen` via useEffect on `hasAdvancedFiltersActive`.
90. Desktop table starts at md (min-w-1080 h-scroll), cramped on tablets.
    Fix: switch card/table breakpoint from md to lg.
91. Loading state is 3 generic skeleton rows, no aria-busy. Fix: 12-row table
    skeleton with `aria-busy="true"`.
92. Fees input label lacks currency, no min guard. Fix: label "Fees (Rs)" with
    `min={0}`.
93. Profile Weight/BMI rows show stale member values. Fix: display latest
    visit weight + recomputed BMI with "as of \<date\>".
94. `watch('avatar')` runs 3x per render; FileReader fallback stores huge
    uncompressed photos. Fix: memo to const; downscale fallback or warn over
    500KB.
95. Add Visit is an onClick Button — Enter key in inputs doesn't submit. Fix:
    wrap row in `<form onSubmit>` with `type="submit"`.
96. CSV export dumps raw ISO dates, and exports the real due date for short
    plans while all UI shows N/A. Fix: `formatDisplayDate` everywhere; export
    consistently with UI.
97. Five training-note textareas have no maxLength/error display; long text
    can fail the DB save. Fix: `maxLength={500}` + error text under each.
98. Partner avatar hardcoded to "" — member 2 gets no photo. Fix: add photo
    upload to the Member 2 section.
99. Renews can overlap the active period or land already-expired silently.
    Fix: confirm when start <= current due; reject due < today.
100. Receipt slip shows only paid amount/method in raw rupees — no plan
    period, fees total, or balance. Fix: add those rows + locale-format.
101. Partially Paid with totalOwed < 2 shows "between 1 and 0". Fix: disable
    the Partial option when totalOwed < 2.
102. `carryForward` "false" string stays truthy (`!== false`), so API clients
    can't waive. Fix: coerce to boolean in `validateRenewInput`.
103. Two pending definitions: `useMembers.stats` counts incl Suspended+aged
    while dashboard Pending uses collectible (excl both). Fix: one
    collectible-based definition everywhere.
104. Paise policy split: `formatCurrency` rounds to whole rupees while DB
    stores paise and the slip prints raw decimals. Fix: integer-only
    validation or 2-decimal formatting everywhere.
105. Demo renew forces status Active + method Cash even for past-due/suspended.
    Fix: mirror `deriveMembershipStatus` and expose method.
106. Renewal receipt sets `paid_on = membershipStart` (often future), so
    Collected-today misses real renewal cash. Fix: `paid_on` = today IST for
    money collected now.
107. Month revenue sums current-cycle fees of touching members, dropping
    prior-cycle money. Fix: compute from receipts + renewal_history in the
    selected month.
108. Receipt SMS has no status check — Deleted members get receipt SMS (manual
    send blocks them). Fix: skip receipt SMS when status is Deleted.
109. `btoa` throws on non-Latin1 passwords, surfacing as "Could not reach
    SMSGate". Fix: Latin1-safe base64 encode, or catch and raise
    SMS_AUTH_FAILED.
110. Dev console test notification posts a raw phone with no normalize/
    validate. Fix: reuse the 10-digit normalize+validate helper, show
    INVALID_PHONE inline.
111. Recent Messages is a fixed last-10 list, no filter/paging though the API
    supports status/limit/offset. Fix: status filter + view-more paging via
    `api.smsLogs`.
112. Demo-mode send renders a green "SMS sent" banner contradicting the Demo
    toast. Fix: return a demo sentinel, render an info state instead of sent.
113. "Sent from gym phone" copy is wrong — sent only means SMSGate accepted
    (Pending). Fix: reword to "accepted by SMSGate, track delivery in Recent
    Messages".
114. Unknown status/goal/payment/sort filter values silently ignored, returns
    unfiltered list. Fix: throw 400 INVALID_FILTER on unrecognized values.
115. No max length on name/address/notes/avatar — giant values break SMS
    templates and bloat rows. Fix: cap name 120, address 500, free-text 2000,
    avatar ~200KB with 400 on overflow.
116. 1MB body guard reads content-length only, bypassed by chunked bodies.
    Fix: measure actual bytes read, enforce the cap after parsing.
117. Restoring a non-deleted member returns 200 with unchanged data, hiding
    the no-op. Fix: return 409 NOT_DELETED.
118. `/auth/logout` never revokes anything server-side, just returns a
    message. Fix: call Supabase `/auth/v1/logout` with the bearer token, or
    delete the route and use client signOut only.
119. Raw Supabase/PostgREST codes and messages bubble to clients, leaking
    internals. Fix: map to sanitized codes/messages in `supabaseRaw`; keep
    detail in server logs.
120. Settings-read failures swallowed to `{}` — an outage masquerades as "SMS
    not configured". Fix: throw where truth is needed; silent fallback only
    where safe.
121. No claim guard on the retry sweep — overlapping isolates/cron ticks can
    process the same queued row concurrently. Fix: claimed_at+worker
    conditional claim (or status-transition guard) before attempting a row.
122. Weight/height ranges + date sanity are worker-only, no CHECKs. Fix: add
    CHECK (weight 20–250, height 90–240) + sane join/membership date bounds.
123. `attendance.member_id` is nullable; `system_settings.updated_at` has no
    trigger. Fix: member_id NOT NULL + `set_updated_at` trigger on
    system_settings.
124. `owner_user_id` nullable though the worker always sets it, and its
    comment claims isolation the shared workspace ignores. Fix: NOT NULL +
    correct the comment to audit-trail.
125. Reminder/winback/sweep filters have only single-column indexes. Fix: add
    composite `(status,membership_due,sms_sent_3days)`,
    `(status,membership_due,sms_sent_winback)`,
    `sms_logs(status,next_retry_at)`.
126. Supabase `/auth/v1/user` fetch has no timeout — hung auth hangs every
    request. Fix: `AbortSignal.timeout(8000)`; map timeout/abort to 503
    AUTH_UNAVAILABLE.
127. Members expired 1–14 days get no message (winback starts day 15). Fix:
    start winback at 7 days or add a 7-day lapse nudge.
128. Renewal Radar hidden below xl — tablets never see urgent renewals. Fix:
    horizontal strip under metrics on \<xl.
129. One long dashboard scroll, no section nav. Fix: sticky tab bar
    (Overview/Follow-ups/Members) with anchor scroll.
130. "/" keyboard shortcut hint is dead on touch tablets. Fix: hide the kbd
    hint on touch, keep tap-to-focus input.
131. TopBar Reports/Settings labels hidden below lg — portrait tablets get
    mystery icons. Fix: show labels from md up.
132. Truncated address relies on hover title, unreadable on touch. Fix:
    tap-to-expand full-address popover.
133. Follow-up carousel has no arrows/position hint; tablets miss overflow
    cards. Fix: scroll buttons + "N more" indicator.
134. "Due Soon <=3d" vs dashboard "Due this week <=7d" mismatch confuses.
    Fix: unify windows or rename with explicit day counts.
135. TopBar/FAB/toast lack `print:hidden`, polluting the profile printout.
    Fix: add `print:hidden` to all three.
136. ReceiptRow print is a 28px icon-only button. Fix: 40px button with
    "Slip" text.
137. Attendance delete is a 28px icon-only button. Fix: 44px target (keep the
    confirm).
138. Editing a Couple member hides partner fields entirely. Fix: show a
    read-only partner summary/link when editing.
139. Switching SMS template silently discards custom message edits. Fix:
    auto-fill only when the message is pristine, else confirm overwrite.
140. No character/segment count on SMS; long texts split silently. Fix: live
    count + SMS segment estimate.
141. Month/Year selects enabled for All-time reports that ignore them. Fix:
    disable month+year when period is "all".
142. PDF/CSV buttons disabled at 0 records with no reason. Fix: show "No
    records match - adjust filters" hint.
143. Doc says Supabase ping every 10m, dev console labels "Automatic 30m
    Ping". Fix: align the label with the real cron schedule (verify
    `.github/workflows/keep-supabase-alive.yml`).
144. README claims demo data without env vars, but prod builds show a config
    error. Fix: document that demo is DEV-only, prod needs env vars.
145. Error toasts vanish in 3s, no close button, pointer-events-none. Fix:
    persist error toasts until dismissed + close button.
146. Expired/invalid 6-digit recovery code + 401s show raw Supabase English.
    Fix: friendly mappings for otp_expired/invalid + 401 Missing/Invalid
    session in `authMessages.ts`.
147. Root clutter: 12.6MB apk + docx + jpegs unreferenced in src/docs/README;
    `dist/` is committed build output. Fix: move apk to docs/ with a README
    pointer; archive/delete media; gitignore `dist/`.
148. Polish batch: 6-section MemberSheet drawer needs a stepper; ResetPassword
    lacks show/hide toggles; ErrorBoundary is Reload-only; dev Logs "Refresh
    Buffer" reloads everything; RenewModal needs a "will reactivate
    Suspended" warning; BMI shows 0.00 when empty; studio-input focus
    translateY causes a focus jump.

## Verified OK (checked, not bugs)

- Trainer-allowlist login message chain works end-to-end (worker 403 ->
    api.ts -> useAuth -> friendlyAuthError -> Login screen).
- Other login error mappings match their real producers; all signIn errors
    funnel through `friendlyAuthError` and render on Login.
- `friendlyAuthError` double-wrap on reset paths is idempotent (verified no
    friendly string contains a trigger substring).
- `authMessages.ts` second clause `trainer_not_allowed` is harmless dead code
    (api.ts drops the error code; first clause already covers it). Keep as
    fallback.

## Not verified (gaps)

Code-only audit, no live systems touched:
- Live Supabase schema/auth/RLS behavior + prod drift (e.g. whether
    `members.avatar` already exists in prod) — no secrets/DB access.
- Live SMSGate provider states, retry timing, scheduled cron runs — no
    network calls made.
- Live tablet/browser behavior (touch sizes, popups, PWA orientation) — no
    device run.
- Files never opened: `frontend/src/lib/escape.ts`,
    `frontend/src/lib/imageCompression.ts`,
    `frontend/src/lib/memberInsights.test.ts` (one test file exists),
    `frontend/public/sw.js`, `.github/workflows/keep-supabase-alive.yml`,
    build configs (`vite.config.ts`, `tsconfig.json`, both `package.json`),
    env templates (`.env.example`, `.dev.vars.example`; `.env.local`
    deliberately unopened as likely secrets), binary clutter contents
    (judged via reference search only), generated files (`dist/`, `.vercel/`,
    lockfiles, icons).

## Fix log

- 2026-11-14 (live-fix batch 1, verified: typecheck + build + 30 probe checks):
  P0 #1 (avatar: worker omits undefined + add-column migration; also fixes
  photo wipe on edit), #6 (renew due recalc), #7 (fee default from last
  renewal), #9 (short-plan N/A → real dates everywhere incl. reports), #10
  (SMS button for short plans), #13 (sweep gates dropped + skipped persisted
  and shown), #14 (no-row failure throws, never fake-queued), #15 (renewal
  receiptSms surfaced + toasted), #16 (bad device id → matched=false + error),
  #17 (status tab is live health, not a config badge). P1 #28 (short plans in
  Due Soon/Radar/stats/follow-ups), #33-part (Custom end min; schema due>start
  still open), #34 (renewal method select, no more always-Cash), #35-part
  (RenewModal warns that renew unsuspends; auto-reactivate kept), #70 (TopBar
  labels + logout confirm + touch Keyboard hint + print:hidden), #71 (44px row
  actions + always-visible legend), #76 (confirm modal runs immediately with
  Working... label). P2 #88 (NaN total), #101 (Partial disabled when total<2
  + honest worker/demo errors). Security #68 (anon SELECT on members revoked).
  Secrets sweep: clean (anon key only in client, no service_role, USING(true)
  only for service_role). Note: the gym uses this LIVE now, not from January.
  Still open: everything else in this report (incl. P0 #2–#5, #8, #11, #12).

- 2026-11-14 (smart notifications batch, verified: typecheck + build + 60 probe checks):
  P0 #2 DONE (all hardcoded emails removed — worker allowlist + dev role +
  both frontend role checks; access ONLY via TRAINER_EMAILS secret with the 3
  emails, developer via Supabase app_metadata). NEW: WhatsApp channel via
  self-hosted OpenWA (sender with Idempotency-Key retries, session health,
  settings + test box), Email channel via Apps Script (mailer script with
  24h send dedupe, member email field + migration, settings + test box),
  smart dispatch (channel order WhatsApp→SMS→Email default, fallback only on
  terminal failure so nobody is double-messaged, dead-channel skip per run),
  all 4 auto sweeps use smart routing, manual message box has Auto/WhatsApp/
  SMS/Email picker, status tab + health + history are per-channel, member
  email collected in add/edit form. Secrets encrypted at rest like the SMS
  password. WA/Email rows retry through the same outbox sweep.
  Still open: P0 #3–#5, #8, #11, #12 and the rest.

- 2026-11-14 (batch 3: wipe + remaining P0s, verified typecheck + build + 79 probe checks):
  P0 #3 DONE (KV-shared rate limiting with in-memory fallback + KV-degrade path; bind docs in DEPLOYMENT).
  P0 #4–#5 DONE (idempotency keys on receipts + renews: partial unique indexes, lookup-first + 409-race handling,
  per-form keys, duplicate toasts; bonus: receipt_no collisions now 409 RECEIPT_NO_TAKEN).
  P0 #8 DONE (stats from receipts/history: collected by paid_on + legacy join cash; expected from renewal totals +
  first-cycle fees via new renewal_history.old_amount; join receipts created going forward; month stats fixed).
  P0 #11 DONE (profile Suspend/Unsuspend/Delete + Restore/Delete-forever on Deleted view).
  P0 #12 DONE (visit weight updates member unless a later visit has one; BMI auto via generated column).
  NEW: per-member purge (Delete → Delete forever, atomic RPC, checkbox confirm) and full gym wipe
  (Settings → Data tab with counts + backup checkbox + typed ERASE ALL, atomic RPC, FW-001 restart,
  settings/logins preserved, audit-logged with actor email). Member join-payment method field added.
  Honest gaps: pre-fix renewed members' original join cash/fee stay unknowable (no backfill possible);
  SQL RPCs reviewed but not executed here (no live DB); KV binding is a deploy step.
  ALL P0s NOW DONE. Remaining: P1/P2 tail (see report).

## Final audit (2026-11-14, post-fix verification)

Method: re-proved every fix by construction (absence greps), re-ran all 79
probe checks + typecheck + build + repo tests, adversarially re-read all new
code (smart routing, wipe/purge, idempotency, stats, auth, rate limit), and
opened every file the first audit never inspected.

LEGACY NOTE: the finding numbers below (P0/P1/P2) refer to this report's
original audit. All 17 P0s are fixed; ~8 P1 + ~3 P2 fixed along the way.
Roughly 60 P1 + 60 P2 tail items remain open (see sections above).

New findings fixed during this audit:
- F1 (auth): dashboard roles could bypass TRAINER_EMAILS, violating the
  3-email rule. Fixed: allowlist now required, roles only set the level.
- F2 (WhatsApp): base URL ending in /api would double to /api/api/*. Fixed:
  trailing /api is stripped.
- F3 (dead code): both short-plan helpers had zero callers left. Removed
  (plus their unused constants).
- F4 (tests): the repo's only test file could not run (no script, no
  @types/node, stale fixtures). Fixed: `npm test` works, 3/3 pass; fixtures
  updated for arrearsCarried + oldAmount.
- F5 (docs truth): dev console "Automatic 30m Ping" label vs real 10-minute
  worker cron (verified in wrangler.jsonc). Fixed to 10m.

Verified clean by re-read: dispatchSmart cannot double-message (fallback only
on terminal failure; queued stops the chain; per-channel idempotency keys;
sweep re-runs replay instead of resending); purge/wipe RPCs are atomic and
FK-safe (children first; all FKs cascade or are explicitly cleared);
idempotency race path returns the winner; rate limiter degrades safely;
strict allowlist fails closed with a loud log; escape.ts (XSS + CSV-injection
defense), sw.js (network-first, no white-screen fallback bug), keep-alive
workflow (consistent with docs, still works after the anon revoke),
vite/package configs all sound. frontend/.env.local deliberately unopened
(likely secrets).

Known accepted trade-offs (not bugs): a queued first channel blocks fallback
to slower channels (no-double-send wins over speed); Apps Script quota errors
are terminal (visible failure, manual retry); member email cannot be *cleared*
via edit (typo correction works); pre-fix renewed members' original join
cash/fee stay unknowable.

VERDICT: code is ready to deploy, but production-readiness is NOT certified:
nothing has run against the live database, providers, or a real device yet.
Needs work = deploy checklist (APPLY_MISSING, TRAINER_EMAILS, dev
app_metadata, KV bind, redeploy, host OpenWA, deploy Apps Script, paste
credentials, test all 3 channels live, run one real 9 AM sweep) + trainer
acceptance on real hardware.

## Suggested fix order

1. Batch A — data truth (P0 #1–#8): avatar migration, auth, rate limit,
    idempotency, renew due recalc, arrears double-count, stats history.
2. Batch B — short plans + SMS truth (P0 #9–#17): N/A dues, hidden SMS,
    skipped sweeps, queued-but-lost, health lies, fake badge.
3. Batch C — profile + attendance (P0 #11–#12 + P1 #18–#27).
4. Batch D — money guards (P1 #31–#48).
5. Batch E — worker hardening (P1 #49–#69).
6. Batch F — tablet UX (P1 #70–#85), then P2 in any order.

