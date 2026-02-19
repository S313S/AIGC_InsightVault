# Mobile Responsive Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve phone usability for core pages while preserving existing desktop behavior.

**Architecture:** Keep the current React component tree and state management unchanged. Apply responsive Tailwind class adjustments at key layout containers and dense UI blocks only. Avoid any business logic/API changes.

**Tech Stack:** React 19, TypeScript, Tailwind (CDN utility classes), Vite

---

### Task 1: App Shell Responsive Layout

**Files:**
- Modify: `App.tsx`
- Test: `npm run build`

**Step 1: Write the failing test**
- Manual expectation: on narrow screens, shell containers should not be clipped by static `100vh` assumptions.

**Step 2: Run test to verify it fails**
- Current behavior risk: fixed `h-screen` can cause viewport issues on mobile browsers.

**Step 3: Write minimal implementation**
- Switch root and sidebar height utilities to dynamic viewport units.
- Reduce paddings on mobile while keeping desktop values on `sm+`.

**Step 4: Run test to verify it passes**
- Execute build and verify TS/JSX compiles.

**Step 5: Commit**
- Commit responsive shell updates.

### Task 2: Monitoring View Mobile Density Fix

**Files:**
- Modify: `components/MonitoringView.tsx`
- Test: `npm run build`

**Step 1: Write the failing test**
- Manual expectation: task cards and pagination should remain readable without horizontal squeeze on phone.

**Step 2: Run test to verify it fails**
- Current behavior risk: multi-column inline task metadata/buttons can overflow on small widths.

**Step 3: Write minimal implementation**
- Convert dense rows to stacked mobile layout.
- Add breakpoint-based spacing and wrapping in task rows, header, and pagination.

**Step 4: Run test to verify it passes**
- Execute build and verify no type or syntax regression.

**Step 5: Commit**
- Commit monitoring page responsive updates.

### Task 3: Chat View Mobile Ergonomics

**Files:**
- Modify: `components/ChatView.tsx`
- Test: `npm run build`

**Step 1: Write the failing test**
- Manual expectation: chat header pill, bubbles, and input area should be operable with one-thumb interactions on phone.

**Step 2: Run test to verify it fails**
- Current behavior risk: header pill and message widths are desktop-tuned and dense on small screens.

**Step 3: Write minimal implementation**
- Add wrapping/flexible layout to chat header capsule.
- Increase bubble max width on mobile and tighten paddings.
- Improve input/footer spacing for small screens.

**Step 4: Run test to verify it passes**
- Execute build and verify output remains green.

**Step 5: Commit**
- Commit chat responsive enhancements.

### Task 4: Settings Modal Mobile Fullscreen Mode

**Files:**
- Modify: `components/SettingsModal.tsx`
- Test: `npm run build`

**Step 1: Write the failing test**
- Manual expectation: settings modal should behave like fullscreen sheet on mobile, not a clipped desktop dialog.

**Step 2: Run test to verify it fails**
- Current behavior risk: fixed desktop dimensions and horizontal controls degrade phone usability.

**Step 3: Write minimal implementation**
- Use fullscreen modal on mobile (`100dvh`), keep existing desktop dialog on `sm+`.
- Make tab navigation horizontally scrollable on mobile.
- Stack row content in trusted account list and keyword input sections.

**Step 4: Run test to verify it passes**
- Execute build and verify no compile errors.

**Step 5: Commit**
- Commit settings responsive updates.

### Task 5: Verification

**Files:**
- Test: `npm run build`

**Step 1: Write the failing test**
- Manual expectation: all edited files compile and app bundle is produced.

**Step 2: Run test to verify it fails**
- N/A (compile verification gate).

**Step 3: Write minimal implementation**
- N/A.

**Step 4: Run test to verify it passes**
- Run `npm run build` and record output.

**Step 5: Commit**
- Commit after successful verification.
