# Mobile Responsive Enhancement Design

**Context**
- Existing product is desktop-first React + Tailwind.
- User needs better phone usability without harming desktop behavior.

**Goal**
- Make core screens usable on mobile (`<=768px`) while preserving current desktop interactions and layout (`>=1024px`).

**Scope**
- Update only responsive layout and spacing in:
  - `App.tsx`
  - `components/MonitoringView.tsx`
  - `components/ChatView.tsx`
  - `components/SettingsModal.tsx`
- No API/business logic changes.

**Design Decisions**
- Keep one codebase and one route structure; use breakpoint-based classes only.
- Preserve desktop visuals as default; add mobile overrides with `sm:`/`md:` split.
- Replace horizontal-compressed blocks with stacked mobile layout in dense sections.
- Use dynamic viewport height (`100dvh`) for better mobile browser compatibility.

**Risk Control**
- Avoid changing state shape, handlers, and data flow.
- Restrict edits to className/layout wrappers where possible.
- Validate by running production build after edits.

**Acceptance Criteria**
- Sidebar/menu, task cards, chat header/input, and settings modal are readable and operable on phone.
- No regression in desktop interaction model.
- Project still builds successfully.
