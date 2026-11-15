# Money + UX Deep Research (2026-11-15)

User evidence: demo walkthrough screenshots (Record Payment, Member Register,
Trainer Desk). Standing rule: report first, build after user review.

## 1. The Rs.1800 bug: old dues + new period get bundled

### What the user did
Divya Kumar had Rs.1800 old dues (fees 1800, Pending). They renewed
(1 Month, 15 Nov → 15 Dec) and the system produced a Rs.3,600 receipt
"(incl. Rs.1800 old dues)". Record Payment now shows PLAN FEES Rs.3,600,
which reads as "the plan costs 3600" — wrong, the plan is 1800. The user
expected: pay old 1800, new month stays separate.

### Root cause (traced in code, both sides)
- `RenewModal.tsx:37`: `carryForward` defaults to **true**; the modal shows
  one opaque TOTAL TO COLLECT = new fees + old balance (`:46-48`).
- `useMembers.ts:319-320` (demo) and `workers/.../index.js:1298-1299`
  (server) compute `totalOwed = feesAmount + oldArrears` identically.
- Both then **overwrite** the member's plan fee with the merged total:
  `useMembers.ts:374` (`feesAmount: totalOwed`),
  `index.js:1383` (`fees_amount: totalOwed`).
- From then on nothing distinguishes old money from new money. A partial
  payment splits against the merged 3600 with no line allocation (which
  1800 got paid — old or new?). Analytics treat 3600 as "plan fees".
- The escape hatch is worse: unchecking "carry old dues" sets oldArrears=0
  and the old debt **silently evaporates** — no write-off record, no audit.
  `renewal_history.arrears_carried` just says 0.

### Correct model (proposal)
Two buckets per member, never merged:
1. **Arrears** — unpaid amounts from closed periods (kept per period).
2. **Current cycle** — this period's plan fee only.
Rules:
- Record Payment keeps working dues-only (pay arrears, dates untouched).
- Renew starts a new cycle with its own fee; arrears stay a separate
  visible bucket. No checkbox can delete debt; a real Write-off action
  (reason + actor + audit log) is the only way to clear it.
- Every payment allocates **oldest-first** and shows the split
  (e.g. "Rs.1800 → old dues, Rs.0 → Dec cycle").
- Every receipt prints **lines**: old dues / current cycle / total, plus
  remaining per bucket. Same lines go into SMS/WhatsApp/Email text.
- Renew modal shows three numbers, never one: Old dues + New cycle =
  Total. Partial collect states exactly what each rupee covered.

### Migration note
Members already renewed hold merged `fees_amount`. Split can be rebuilt
from `renewal_history.arrears_carried` + receipts for most rows; where the
old join cash is unknown (pre-fix renewals, see AUDIT_REPORT), say so on
the receipt instead of guessing.

## 2. Member Register: full redesign (proposal)

### Today's problems (screenshot 2 + `MemberTable.tsx`)
- 10 columns + 5 icon-only buttons per row: built for a wide monitor, not
  the gym tablet. Horizontal scroll, tiny tap targets, mystery icons.
- ADDRESS column is always "—" (sample/real data rarely has it) — dead
  column eating space. JOIN DATE and GOAL matter less than money/due.
- The ACTIONS legend line exists only because the icons are unreadable.
- Payment + due info (the trainer's real questions: who owes? who ends
  soon?) compete with 6 other columns.

### Proposed design
- **Tablet-first member cards** (< 1024px): photo/avatar + name + reg no,
  one status pill (Active/Suspended/Expired), one money line
  ("Paid ✓" or "Due Rs.X — Rs.A old + Rs.B Dec"), one due line
  ("Renews 18 Nov · 3d"), two big buttons (View, Message) + overflow (⋯)
  for Edit/Suspend/Delete. No legend needed.
- **Wide screens**: compact table with 6 columns only: Member, Money
  (paid/pending split), Due/Renewal, Plan, Status, Actions (View, Message,
  ⋯). Drop Address/Join/Goal into the profile; keep them in CSV export.
- Row tap anywhere opens the profile (today only the eye icon does).
- Keep: sorting, search, pagination (12/page), CSV export, 44px targets.

## 3. Trainer Desk sections: make them drive action (proposal)

### Today's problems (screenshot 3 + `Dashboard.tsx:547+`)
- Three money summaries say overlapping things (top money strip, 5 stat
  cards, 6 analysis tiles) — the trainer reads numbers but gets no task.
- Renewal Radar and Follow-up Queue overlap (same Arun Prakash twice).
- "Analysis Snapshot" answers questions nobody asked ("Gone quiet: 1")
  while the real question ("who do I collect from today?") is scattered.

### Proposed order (one screen, top to bottom)
1. **Today's actions** (one strip, tappable): Collect Rs.X (n members) →
   Renewals due (n) → Calls to make (n). Each jumps to a filtered list.
2. **Action queue** (radar + follow-ups merged, deduped): one card per
   member with the single next action + View/Message buttons.
3. **Members** (the redesigned register, §2).
4. **Reports & trends** (collapsed by default): monthly collection,
   pending list, expiries — the current snapshot tiles, demoted.
- Rule: every number on the desk is tappable and leads to the members it
  counts. No orphan stats.

## 4. Receipts + reports to members (proposal)

### Today (traced)
- Receipt delivery is **SMS-only**: `sendReceiptSms` (`index.js:3472`)
  calls `dispatchSms` with kind "receipt". No email, no WhatsApp path.
- Printed receipt is print-dialog only (`MemberProfile.tsx:510+`, 80mm
  thermal HTML). No resend, no delivery state.
- Member email exists (field + migration) and the Apps Script mailer
  (`appsscript/Code.gs`) sends **plain text only**, no attachments.
- Exports are trainer-only (`ReportExportModal`: 6 report types, CSV/PDF
  download). Nothing sends a statement to a member.

### Proposed delivery matrix
| Event | WhatsApp | SMS | Email |
|---|---|---|---|
| Payment receipt | text receipt | text receipt (fallback) | text receipt (if email on file) |
| Renewal receipt | same as above | fallback | same as above |
| Due/reminder | smart route (existing) | fallback | fallback |
| Member statement | **new: send from profile** | on request | on request |
- Receipt text reuses the §1 lines (old/new/total/remaining) so all
  channels agree to the rupee.
- Phase 1 = text everywhere (mailer already supports it). Phase 2 =
  PDF attachment over email (mailer contract + blob support needed).
- Per-receipt **Resend** button + delivery state (sent/queued/failed per
  channel) in the receipt list; failures surface, never silent.
- Member statement via WhatsApp: new "Send statement" on the profile —
 Trainer picks dues summary / renewal summary; sends through the existing
  OpenWA sender with the same idempotency keys as reminders (no doubles).
- Cost rule (unchanged): one message per event; fallback only on terminal
  failure; dead-channel skip per run.

## 5. Suggested build order
1. Money model (§1): buckets + allocation + itemized receipts (demo +
   worker + migration) — fixes real money harm first.
2. Receipt delivery (§4 top half): email + WA/SMS receipt text + resend.
3. Member register redesign (§2).
4. Desk action layout (§3).
5. WhatsApp member statements (§4 bottom half).

## 6. Questions for the user (need answers before build)
1. Overpay/advance: may a trainer collect MORE than the pending balance
   (advance for next month), or keep today's hard block?
2. Carry default: when renewing with old dues, should the modal default
   to carrying them (today) or to keeping them separate (proposed)?
3. WhatsApp sender: is the OpenWA server + dedicated number ready, or
   should receipts/reports ship SMS+Email first and WA later?
