# Feature: Option Groups UX/UI Improvements

**Created**: 2026-02-22
**Status**: Planning
**Branch**: `feat/add-support-to-option-groups`
**Related**: `.ideas/option-groups-ux-improvements.md`

## Feature Overview

### Goal

Improve the user experience and visual design of the Option Groups feature across all touchpoints:
1. **Admin Settings** - Option group CRUD management
2. **Menu/Product Editing** - Linking groups to products
3. **POS Selection** - Customer-facing option selection modal
4. **Cart Display** - Selected options in cart

### User Value

- **POS operators**: Faster, more intuitive option selection with better touch targets and clearer validation feedback
- **Store admins**: Easier option group creation with guided selection rules and better visual hierarchy
- **End users**: More polished, professional-looking interface

### Scope

**Included:**
- Terminology rename: "Opções" → "Complementos"
- Progress indicator for multi-group POS selection
- Radio behavior for single-select groups in POS
- Selection rule presets in admin form
- Enhanced validation feedback
- Touch optimization
- Visual hierarchy improvements
- Cart display compactness

**Excluded:**
- Drag-and-drop (using arrow buttons instead - already implemented)
- Keyboard shortcuts for POS
- Option images/icons

## Architecture Alignment

### Patterns to Follow

1. **Component structure**: Components in `features/*/components/`
2. **Shared components**: Reusable UI in `src/shared/`
3. **State management**: Jotai atoms in `state.ts`
4. **Form validation**: Zod schemas in `form-validation/`
5. **Styling**: Tailwind CSS v4 with cn() utility
6. **Typography**: Use existing `Body`, `LargeText`, `SmallText`, `Headline` components

### Technologies Used

- React 19 with Next.js 15 App Router
- Tailwind CSS v4 for styling
- Radix UI primitives (Badge, Sheet, etc.)
- Lucide React icons
- TanStack Form + Zod for validation

---

## Implementation Tasks

### Phase 1: Foundation & POS Critical Path (P0)

#### TASK-001: Rename terminology "Opções" → "Complementos"

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: None (should be done first for consistency)
- **Priority**: P0

**Files to Modify**:
- `src/features/option-groups/components/option-groups-section.tsx`
- `src/features/option-groups/components/option-group-form.tsx`
- `src/features/option-groups/components/option-row.tsx`
- `src/features/option-groups/components/link-option-groups-content.tsx`
- `src/features/option-groups/components/link-option-groups-modal.tsx`
- `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx`
- `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`
- `src/features/pos/components/option-group-selector/option-group-step.tsx`
- `src/features/pos/components/pos-cart-item.tsx`
- `src/shared/modals/delete-resource-confirmation-modal.tsx` (if used with option groups)

**Implementation Notes**:
- Text-only changes, no code logic changes
- Keep internal identifiers unchanged (`optionGroup`, `options`, etc.)
- Terminology mapping:
  | Current | New |
  |---------|-----|
  | Grupo(s) de opções | Grupo(s) de complementos |
  | Opção/Opções | Complemento(s) |
  | Adicionar opção | Adicionar complemento |
  | Nenhum grupo de opções | Nenhum grupo de complementos |

**Testing Plan**:
- [x] Navigate to Menu > Grupos de Complementos tab → verify header shows "Grupos de complementos"
- [x] Open "Novo grupo de complementos" sidebar → verify all labels use "complemento(s)"
- [x] Edit item → go to "Grupos de Complementos" tab → verify tab label and all text updated
- [x] Open POS → add item with groups → verify modal uses "complemento" terminology
- [x] Add item to cart → verify cart display uses "complemento" terminology
- [ ] Delete a group → verify confirmation modal says "grupo de complementos"

---

#### TASK-002: Complementos section separator and scroll-to-incomplete

- **Status**: ✅ Completed (Revised)
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-003, TASK-004
- **Priority**: P0

**Files**:
- Modify: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`
- Removed: `src/features/pos/components/option-group-selector/option-group-progress-indicator.tsx` (no longer used)

**Implementation Notes**:
- **REVISED**: Original progress indicator was confusing UX, replaced with simpler approach
- Add "Complementos" separator section header when option groups exist
- Separator shows centered text between two horizontal lines
- When user clicks Confirmar with incomplete mandatory groups:
  - Shake animation on incomplete groups
  - Toast error message
  - Auto-scroll to first incomplete mandatory group (scrollIntoView with smooth behavior)
- Uses refs map to track group elements for scrolling

**Testing Plan**:
- [x] POS: add item with option groups → "Complementos" separator appears above groups
- [x] POS: add item without option groups → no separator shown
- [x] Click Confirmar without completing mandatory selections → scroll to first incomplete group
- [x] Shake animation triggers on incomplete groups
- [x] Toast message "Inclua todos os complementos obrigatórios" appears
- [x] Incomplete group gets amber ring highlight to visually focus attention
- [x] Highlight clears when user selects an option

---

#### TASK-003: Radio behavior for single-select groups

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-002, TASK-004
- **Priority**: P0

**Files**:
- Modify: `src/features/pos/components/option-group-selector/option-group-step.tsx`
- Modify: `src/features/pos/components/option-group-selector/option-selector-row.tsx`

**Implementation Notes**:
- Detect single-selection groups: `group.maxQuantity === 1`
- For single-select: use radio circle indicator instead of +/- buttons
- Clicking any option auto-deselects others in the group
- For multi-select (maxQuantity > 1): keep current +/- behavior
- Pass `isSingleSelect` prop to `OptionSelectorRow`

**Visual Changes**:
- Single-select row: Radio circle (empty/filled) on left, name, price on right
- Entire row is tappable for selection
- Selected state: filled circle, border-primary bg-primary/5
- Multi-select: keep current +/- button layout

**Testing Plan**:
- [ ] Create option group with min=1, max=1 (single select)
- [x] POS: add item with single-select group → radio circles shown, no +/- buttons
- [x] Click option A → option A selected, shows filled radio circle
- [x] Click option B → option A auto-deselected, option B now selected
- [ ] Create option group with min=0, max=3 (multi-select)
- [ ] POS: add item with multi-select group → +/- buttons shown
- [ ] Can select multiple options up to max
- [ ] Mixed item: single-select group + multi-select group → correct UI for each

---

#### TASK-004: Selection rule selector with presets

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-002, TASK-003
- **Priority**: P0

**Files**:
- Create: `src/features/option-groups/components/selection-rule-selector.tsx`
- Modify: `src/features/option-groups/components/option-group-form.tsx`

**Implementation Notes**:
- Replace separate min/max inputs with unified selector
- Presets:
  - "Opcional (até 1)" → min=0, max=1
  - "Obrigatório (exatamente 1)" → min=1, max=1
  - "Escolha múltipla (1 a 3)" → min=1, max=3
  - "Personalizado..." → shows custom min/max inputs
- Show human-readable preview: "Cliente deve escolher entre 1 e 3 complementos"
- Auto-detect preset when editing existing group

**Component Structure**:
```tsx
type SelectionRulePreset = 'optional' | 'required' | 'multiple' | 'custom'

type SelectionRuleSelectorProps = {
  minQuantity: number
  maxQuantity: number
  onChange: (min: number, max: number) => void
}
```

**Testing Plan**:
- [ ] Create new group → selector shows presets as radio buttons or select
- [ ] Select "Opcional (até 1)" → min=0, max=1 auto-set, custom fields hidden
- [ ] Select "Obrigatório (exatamente 1)" → min=1, max=1 auto-set
- [ ] Select "Escolha múltipla (1 a 3)" → min=1, max=3 auto-set
- [ ] Select "Personalizado..." → custom min/max inputs appear
- [ ] Enter custom values (e.g., min=2, max=5) → preview shows "2 a 5"
- [ ] Edit existing group with min=0, max=1 → auto-selects "Opcional" preset
- [ ] Edit group with non-standard values (e.g., min=2, max=4) → auto-selects "Personalizado"
- [ ] Save group → values persist correctly

---

### Phase 2: Validation and Feedback (P1)

#### TASK-005: Enhanced validation feedback in POS

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-002
- **Parallelizable With**: TASK-006, TASK-007
- **Priority**: P1

**Files**:
- Modify: `src/features/pos/components/option-group-selector/option-group-step.tsx`
- Modify: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`

**Implementation Notes**:
- Add inline validation message below incomplete groups: "Selecione mais X complemento(s)"
- Shake animation on incomplete groups when clicking disabled Confirm button
- Toast notification on confirm attempt with incomplete groups
- Increase badge visibility: `text-base` instead of current size
- Add icons: `CheckCircle2` for complete, `AlertCircle` for incomplete

**Testing Plan**:
- [ ] POS: add item with required group (min=1) → validation message shows "Selecione 1 complemento"
- [ ] Select 1 option → validation message disappears, badge turns green with checkmark
- [ ] With incomplete group, click "Confirmar" → shake animation on group, toast appears
- [ ] Complete all groups → "Confirmar" enabled, no validation messages
- [ ] Badge shows icon: green checkmark when complete, amber alert when incomplete

---

#### TASK-006: Touch optimization for POS option rows

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-003
- **Parallelizable With**: TASK-005, TASK-007
- **Priority**: P1

**Files**:
- Modify: `src/features/pos/components/option-group-selector/option-selector-row.tsx`

**Implementation Notes**:
- Increase +/- button size: `h-10 w-10` (from `h-8 w-8`) on mobile
- Responsive: `h-10 w-10 sm:h-8 sm:w-8`
- Make entire row tappable for 0→1 toggle when quantity=0
- Add visual selection state: `border-primary bg-primary/5` when selected
- Add micro-animation on tap: `active:scale-98 transition-transform`

**Testing Plan**:
- [ ] Open POS modal on mobile device/viewport → buttons are larger (40x40px)
- [ ] Desktop viewport → buttons are standard size (32x32px)
- [ ] Tap entire row when quantity=0 → quantity becomes 1
- [ ] Tap row when quantity>0 → no change (use +/- buttons)
- [ ] Selected option has highlighted border and background
- [ ] Tapping button shows subtle scale animation

---

#### TASK-007: Selected groups visual hierarchy in link modal

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-005, TASK-006
- **Priority**: P1

**Files**:
- Modify: `src/features/option-groups/components/link-option-groups-content.tsx`

**Implementation Notes**:
- Add numbered badges (1., 2., 3.) to show order
- First group gets "Principal" badge (Badge variant="default")
- Current arrows work well, keep them
- Add visual grip indicator next to arrows for clearer reorder affordance

**Testing Plan**:
- [ ] Edit item → Grupos de Complementos tab → add 3 groups
- [ ] First group shows "1." badge and "Principal" label
- [ ] Second group shows "2." badge
- [ ] Reorder groups → numbers update correctly
- [ ] New first group gets "Principal" badge
- [ ] Visual reorder indicators are clear and accessible

---

#### TASK-008: Admin empty state enhancement

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-005, TASK-006, TASK-007
- **Priority**: P1

**Files**:
- Modify: `src/features/option-groups/components/option-groups-section.tsx`

**Implementation Notes**:
- Replace plain text with illustrated empty state card
- Add icon: `Layers` or `ListPlus` from lucide-react
- Centered layout with icon + headline + description + CTA
- Headline: "Nenhum grupo criado ainda"
- Description: "Grupos de complementos permitem adicionar extras aos seus produtos, como tamanhos, ingredientes e adicionais."
- CTA: "Criar primeiro grupo" (opens the sidebar form)

**Testing Plan**:
- [ ] Navigate to Menu > Grupos de Complementos with no groups → empty state card appears
- [ ] Card has icon, headline, description, and button
- [ ] Click "Criar primeiro grupo" → sidebar opens with new group form
- [ ] Create a group → empty state disappears, table appears
- [ ] Delete all groups → empty state returns

---

### Phase 3: Polish and Refinements (P2)

#### TASK-009: Responsive option row layout in form

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-001, TASK-004
- **Parallelizable With**: TASK-010, TASK-011
- **Priority**: P2

**Files**:
- Modify: `src/features/option-groups/components/option-row.tsx`

**Implementation Notes**:
- Current grid is cramped on mobile: `grid-cols-[auto_1fr_auto_auto_auto]`
- Stack layout on mobile: full-width item selector, then horizontal row for price/qty/actions
- Responsive: `flex flex-col sm:grid sm:grid-cols-[auto_1fr_auto_auto_auto]`
- Reorder buttons: keep at top in mobile stacked layout
- Add option index number: "1.", "2.", etc. for visual reference

**Testing Plan**:
- [ ] Open option group form on mobile viewport → fields stack vertically
- [ ] Item selector is full width
- [ ] Price, qty, delete are in horizontal row below
- [ ] Reorder arrows accessible and functional
- [ ] Desktop viewport → original horizontal grid layout
- [ ] Index numbers show correctly (1., 2., 3., etc.)

---

#### TASK-010: Collapsible options in cart display

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-009, TASK-011
- **Priority**: P2

**Files**:
- Create: `src/features/pos/components/collapsible-options-list.tsx`
- Modify: `src/features/pos/components/pos-cart-item.tsx`

**Implementation Notes**:
- When > 3 options selected, collapse into summary view
- Collapsed format: "Queijo, Bacon +2 mais" as inline text or small tags
- Click/tap to expand full list
- Group by option group name for organization: "Adicionais: Queijo, Bacon"
- Toggle between collapsed/expanded state

**Testing Plan**:
- [ ] Cart item with 2 options → all options shown inline
- [ ] Cart item with 4+ options → collapsed view shows "... +N mais"
- [ ] Tap collapsed options → expands to show all
- [ ] Tap again → collapses
- [ ] Options grouped by group name if multiple groups

---

#### TASK-011: Edit button discoverability in cart

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001
- **Parallelizable With**: TASK-009, TASK-010
- **Priority**: P2

**Files**:
- Modify: `src/features/pos/components/pos-cart-item.tsx`

**Implementation Notes**:
- First cart item with options: show "Editar" text label + icon
- Subsequent items: just icon with tooltip
- Add Tooltip: "Modificar complementos e observações"
- More prominent hover state on edit button

**Testing Plan**:
- [ ] Add first item with options to cart → "Editar" button shows text + icon
- [ ] Add second item with options → edit button shows icon only
- [ ] Hover on icon-only edit button → tooltip appears
- [ ] Click edit → modal opens for editing options
- [ ] Item without options → edit button still present (for comment editing)

---

### Phase 4: Nice-to-Have Polish (P3)

#### TASK-OPT-001: Table visual hierarchy improvements

- **Status**: ✅ Completed
- **Type**: Optional
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-008
- **Priority**: P3

**Files**:
- Modify: `src/features/option-groups/components/option-groups-section.tsx`

**Implementation Notes**:
- Add striped rows: `odd:bg-muted/50`
- Add Badge for selection type:
  - `minQuantity > 0`: Badge variant="default" → "Obrigatório"
  - `minQuantity === 0`: Badge variant="secondary" → "Opcional"
- Show option names preview: "Queijo, Bacon, Cebola..."

**Testing Plan**:
- [ ] Groups table has alternating row colors
- [ ] Required groups show "Obrigatório" badge
- [ ] Optional groups show "Opcional" badge
- [ ] Options column shows first 2-3 option names

---

#### TASK-OPT-002: Option price visual feedback

- **Status**: ✅ Completed
- **Type**: Optional
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-009
- **Priority**: P3

**Files**:
- Modify: `src/features/option-groups/components/option-row.tsx`

**Implementation Notes**:
- Price > 0: Show "+R$ X,XX" in green text below input
- Price = 0: Show "Incluído" badge in gray
- Add quick toggle: "Marcar como incluído" to set price to 0

**Testing Plan**:
- [ ] Option with price R$ 5.00 → shows "+R$ 5,00" indicator in green
- [ ] Option with price R$ 0.00 → shows "Incluído" badge
- [ ] Quick toggle sets price to 0

---

#### TASK-OPT-003: Empty state discoverability in link modal

- **Status**: ✅ Completed
- **Type**: Optional
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-007
- **Priority**: P3

**Files**:
- Modify: `src/features/option-groups/components/link-option-groups-content.tsx`

**Implementation Notes**:
- When no groups exist AND none available in combobox:
  - Show inline message: "Você ainda não tem grupos. Crie um agora."
  - Auto-expand create form when no groups exist
- Add tooltip explaining what groups are for

**Testing Plan**:
- [ ] New store with no groups → link modal shows inline prompt
- [ ] Create form auto-expands
- [ ] After creating group, it appears in combobox

---

#### TASK-OPT-004: Item selection UX enhancement in option row

- **Status**: ✅ Completed
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-009
- **Priority**: P3

**Files**:
- Modify: `src/features/option-groups/components/option-row.tsx`
- Modify: `src/shared/combobox.tsx` (if grouping support needed)

**Implementation Notes**:
- Combobox shows item category and price: "Item Name (Categoria) - R$ X,XX"
- Group items by category with sticky headers
- Small thumbnail on hover (optional, 24px)

**Testing Plan**:
- [ ] Open item combobox in option row → items show category and price
- [ ] Items grouped by category
- [ ] Easy to find specific item

---

#### TASK-OPT-005: Quick actions in admin table

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-001, TASK-OPT-001
- **Priority**: P3

**Files**:
- Modify: `src/features/option-groups/components/option-groups-section.tsx`
- Modify: `src/features/option-groups/api.ts` (add duplicate action)
- Modify: `src/features/option-groups/hooks/use-option-groups.tsx`

**Implementation Notes**:
- Add "Duplicate" action button (Copy icon) alongside Edit/Delete
- Duplicating creates new group with name "(Cópia)"
- Optional: bulk delete with checkboxes when `groups.length > 5`

**Testing Plan**:
- [ ] Copy icon appears next to Edit icon
- [ ] Click Copy → new group created with "(Cópia)" suffix
- [ ] New group has same options as original
- [ ] Bulk select works when many groups exist

---

#### TASK-OPT-006: Compact inline create form

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Priority**: P3

**Files**:
- Modify: `src/features/option-groups/components/option-group-form.tsx`
- Modify: `src/features/option-groups/components/link-option-groups-content.tsx`

**Implementation Notes**:
- Add `compact` prop to `OptionGroupForm`
- Compact mode: reduced padding/spacing
- Collapse "Complementos" (options) section by default with count
- Info banner: "O grupo será vinculado automaticamente após criação"

**Testing Plan**:
- [ ] Open link modal → click "Criar novo grupo" → compact form appears
- [ ] Form has reduced spacing, fits better inline
- [ ] Options section collapsed by default showing count
- [ ] Info banner visible
- [ ] Create group → auto-linked to item

---

## Task Dependency Graph

```
Phase 1 - Foundation (P0):
  TASK-001 (Terminology) ──┐
                           ├──→ TASK-002 (Progress Indicator) ─────┐
                           ├──→ TASK-003 (Radio Behavior) ─────────┼──→ TASK-006 (Touch)
                           └──→ TASK-004 (Selection Presets)       │
                                                                   │
Phase 2 - Validation (P1):                                         │
  TASK-005 (Validation Feedback) ◄─────────────────────────────────┘
  TASK-007 (Link Modal Hierarchy) ◄── TASK-001
  TASK-008 (Empty State) ◄── TASK-001

Phase 3 - Polish (P2):
  TASK-009 (Responsive Option Row) ◄── TASK-004
  TASK-010 (Collapsible Cart Options) ◄── TASK-001
  TASK-011 (Edit Discoverability) ◄── TASK-001

Phase 4 - Nice-to-Have (P3):
  TASK-OPT-001 (Table Hierarchy) ◄── TASK-008
  TASK-OPT-002 (Price Feedback) ◄── TASK-009
  TASK-OPT-003 (Link Empty State) ◄── TASK-007
  TASK-OPT-004 (Item Selection UX) ◄── TASK-009
  TASK-OPT-005 (Quick Actions) ◄── TASK-OPT-001
  TASK-OPT-006 (Compact Form) ◄── TASK-007
```

## Implementation Guidelines

### Keep It Simple

- Use existing shared components (Badge, Button, etc.)
- No new npm dependencies
- Text-only changes don't need tests
- UI changes tested manually via dev server

### Testing Strategy

All Core tasks have manual testing plans that must pass before marking complete:
1. Run `bun dev` to start development server
2. Navigate to relevant page/modal
3. Execute each test case in the testing plan
4. Mark task complete only when ALL tests pass

### Rollout Considerations

- No database migrations needed (UI-only changes)
- No breaking changes to existing functionality
- Cart state remains unchanged in localStorage
- All changes are backwards compatible

---

## Progress Tracking

| Task ID | Title | Type | Priority | Status | Completed | Notes |
|---------|-------|------|----------|--------|-----------|-------|
| TASK-001 | Terminology rename | Core | P0 | ✅ Completed | 2026-02-22 | Text changes only |
| TASK-002 | Complementos separator + scroll | Core | P0 | ✅ Completed (Revised) | 2026-02-22 | Replaced progress indicator with simpler UX |
| TASK-003 | Radio behavior | Core | P0 | ✅ Completed | 2026-02-22 | POS UX |
| TASK-004 | Selection rule presets | Core | P0 | ✅ Completed | 2026-02-22 | New component |
| TASK-005 | Validation feedback | Core | P1 | ✅ Completed | 2026-02-22 | POS UX |
| TASK-006 | Touch optimization | Core | P1 | ✅ Completed | 2026-02-22 | Mobile UX |
| TASK-007 | Link modal hierarchy | Core | P1 | ✅ Completed | 2026-02-22 | Visual polish |
| TASK-008 | Empty state | Core | P1 | ✅ Completed | 2026-02-22 | Admin UX |
| TASK-009 | Responsive option row | Core | P2 | ✅ Completed | 2026-02-22 | Mobile form |
| TASK-010 | Collapsible cart options | Core | P2 | ✅ Completed | 2026-02-22 | Cart UX |
| TASK-011 | Edit discoverability | Core | P2 | ✅ Completed | 2026-02-22 | Cart UX |
| TASK-OPT-001 | Table hierarchy | Optional | P3 | ✅ Completed | 2026-02-22 | Added striped rows, type badges, option names preview |
| TASK-OPT-002 | Price feedback | Optional | P3 | ✅ Completed | 2026-02-22 | Added price visual feedback with "Incluído" badge |
| TASK-OPT-003 | Link empty state | Optional | P3 | ✅ Completed | 2026-02-22 | Auto-expand create form, inline message |
| TASK-OPT-004 | Item selection UX | Optional | P3 | ✅ Completed | 2026-02-22 | Items grouped by category with price |
| TASK-OPT-005 | Quick actions | Optional | P3 | ⏳ Pending | - | Admin efficiency |
| TASK-OPT-006 | Compact form | Optional | P3 | ⏳ Pending | - | Inline create |

---

## Open Questions

- [x] ~~Should drag-and-drop be prioritized over arrow buttons?~~ **Decision: Keep arrow buttons (already implemented, no new deps)**
- [ ] Should we add keyboard shortcuts for POS operators? **Deferred to future iteration**

## Notes & Learnings

- **TASK-002**: **REVISED** - Original progress indicator (horizontal stepper with checkmarks) was confusing UX. Replaced with simpler approach: (1) "Complementos" centered separator header above option groups, (2) on submit validation failure, auto-scroll to first incomplete mandatory group using `scrollIntoView({ behavior: 'smooth', block: 'center' })` AND visual highlight with amber ring border (`ring-2 ring-amber-400 bg-amber-50/50`). Uses `useRef<Map<number, HTMLDivElement>>` to track group element refs for scrolling, and `highlightedGroupId` state passed as `highlight` prop to `OptionGroupStep` component. Highlight clears when user makes any selection. Removed `option-group-progress-indicator.tsx` component.
- **TASK-004**: Created `SelectionRuleSelector` component using Radix RadioGroup primitives. The component auto-detects the preset when editing existing groups and shows a human-readable preview of the selection rule. Used existing `SmallText` component with `text-muted-foreground` class instead of a `variant` prop.
- **TASK-005**: Added validation feedback with inline messages, shake animation, toast notifications, and status icons. Added `animate-shake` keyframes to Tailwind config. The Confirm button is now always clickable to provide feedback instead of being disabled.
- **TASK-006**: Implemented touch optimization with responsive button sizes (h-10/w-10 on mobile, h-8/w-8 on desktop), row tap to select when quantity=0, and scale micro-animations on tap. Used `e.stopPropagation()` to prevent row click when pressing buttons.
- **TASK-007**: Added numbered badges (1., 2., 3.) to show order in `link-option-groups-content.tsx`. First group gets "Principal" badge using Badge component with `variant="default"`. Added `GripVertical` icon from lucide-react next to reorder arrows for clearer affordance.
- **TASK-008**: Replaced plain text empty state with illustrated card in `option-groups-section.tsx`. Uses `Layers` icon from lucide-react, centered layout with dashed border, icon + headline ("Nenhum grupo criado ainda") + description + CTA ("Criar primeiro grupo") that opens the sidebar form.
- **TASK-009**: Updated `option-row.tsx` with responsive layout using `flex flex-col sm:grid`. Added `displayIndex` prop for showing numbered options (1., 2., etc.). Mobile layout stacks item selector full-width, then horizontal row for price/qty/delete. Desktop maintains horizontal grid.
- **TASK-010**: Created new `collapsible-options-list.tsx` component. Collapses options when > 3 items, showing "+N mais" link. Click to expand/collapse. Groups options by `optionGroupName` when multiple groups present. Updated `pos-cart-item.tsx` to use the new component.
- **TASK-011**: Updated `pos-cart-item.tsx` to show "Editar" text label + icon for the first cart item with options/comments. Subsequent items show icon-only with tooltip "Modificar complementos e observações". Added `isFirstEditableItem` prop and enhanced hover states with `hover:bg-primary/10 hover:text-primary`.
- **TASK-OPT-001**: Added table visual hierarchy improvements to `option-groups-section.tsx`. Changes include: (1) striped rows using `odd:bg-muted/50` on TableRow, (2) new "Tipo" column with Badge showing "Obrigatório" (variant="default") for groups with minQuantity > 0 or "Opcional" (variant="secondary") for minQuantity === 0, (3) option names preview showing first 3 option names with "..." if more exist.
- **TASK-OPT-002**: Added `PriceFeedback` component to `option-row.tsx`. Shows "+R$ X,XX" in green text when price > 0, displays "Incluído" badge (secondary variant) when price = 0. Added "Marcar como incluído" quick toggle link that sets price to 0. Used existing `getValueFromCurrencyString` and `formatValueToCurrency` utilities for parsing/formatting.
- **TASK-OPT-003**: Added empty state discoverability to `link-option-groups-content.tsx`. When no groups exist (`hasNoGroups`), automatically expands the create form using `useEffect`. Shows inline amber-colored prompt message "Você ainda não tem grupos de complementos. Crie o primeiro abaixo!" inside the create form container. Hides the combobox selector when no groups exist since there's nothing to select.
- **TASK-OPT-004**: Enhanced item selection UX in `option-row.tsx`. Added `ItemForOptionRow` type with `categoryName`, `categoryId`, and `price` fields. Updated `Combobox` component to support `groupedOptions` prop for grouped display with sticky category headers. Items now show price on the right side of each row. Items are grouped by category using `useMemo` to compute groups. Also added category name to search keywords for better findability.
