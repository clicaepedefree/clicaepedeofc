# Idea: Option Groups UX/UI Improvements

**Created**: 2026-02-22
**Status**: Idea
**Related Feature**: Option Groups (`feat/add-support-to-option-groups`)

## Overview

### Goal

Improve the user experience and visual design of the Option Groups feature across all touchpoints in the application: Admin Settings, Menu/Product Editing, POS Selection, and Cart Display.

### User Value

- **POS operators**: Faster, more intuitive option selection with better touch targets and clearer validation feedback
- **Store admins**: Easier option group creation with guided selection rules and better visual hierarchy
- **End users**: More polished, professional-looking interface that builds trust in the product

### Analysis Scope

The following areas were analyzed:

0. **Terminology** (Cross-cutting rename from "Opções" to "Complementos")
1. **Admin Option Groups Management** (`OptionGroupsSection`)
2. **Option Group Form** (`OptionGroupForm` + `OptionRow`)
3. **Link Option Groups to Products** (`LinkOptionGroupsContent`)
4. **POS Option Selection** (`OptionGroupSelectorModal` + `OptionGroupStep` + `OptionSelectorRow`)
5. **Cart Display and Editing** (`PosCartItem`)

---

## Improvement Opportunities

### Area 0: Terminology Rename (Cross-Cutting)

#### IDEA-000: Rename "Grupos de Opções" to "Grupos de Complementos"

- **Problem**: The current terminology "Grupos de Opções" and "Opções" is technically accurate but not intuitive for Brazilian Portuguese users. In the food service industry, the common term is "Complementos" (complements/add-ons) which better communicates the purpose: extras that complement the main item.
- **Solution**:
  - Rename all user-facing text from "Grupo(s) de Opções" → "Grupo(s) de Complementos"
  - Rename all user-facing text from "Opção/Opções" → "Complemento(s)"
  - Keep internal code identifiers unchanged (optionGroup, options) to avoid breaking changes
  - Update all labels, placeholders, toasts, and headings
- **Implementation**:
  - Search and replace in UI text only (not variable names):
    - "Grupo de opções" → "Grupo de complementos"
    - "Grupos de opções" → "Grupos de complementos"
    - "grupo de opções" → "grupo de complementos"
    - "grupos de opções" → "grupos de complementos"
    - "Opção" → "Complemento" (in context of option groups)
    - "Opções" → "Complementos" (in context of option groups)
    - "opção" → "complemento"
    - "opções" → "complementos"
  - Update tab labels, form labels, table headers, empty states, toasts, modal titles
  - Keep code identifiers (`optionGroup`, `options`, `OptionGroupForm`, etc.) unchanged for stability
- **Files to Update**:
  - `src/features/option-groups/components/option-groups-section.tsx` - Section title, button labels, table headers
  - `src/features/option-groups/components/option-group-form.tsx` - Form labels, placeholders, button text
  - `src/features/option-groups/components/option-row.tsx` - Labels
  - `src/features/option-groups/components/link-option-groups-content.tsx` - Labels, empty state text
  - `src/features/option-groups/components/link-option-groups-modal.tsx` - Modal title
  - `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx` - Tab label
  - `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx` - Any labels
  - `src/features/pos/components/option-group-selector/option-group-step.tsx` - Selection labels
  - `src/features/pos/components/pos-cart-item.tsx` - If any labels exist
  - `src/shared/modals/delete-resource-confirmation-modal.tsx` - Resource name parameter updates
- **Terminology Mapping**:
  | Current (PT-BR) | New (PT-BR) | English Equivalent |
  |-----------------|-------------|-------------------|
  | Grupo de opções | Grupo de complementos | Complement Group |
  | Grupos de opções | Grupos de complementos | Complement Groups |
  | Opção | Complemento | Complement |
  | Opções | Complementos | Complements |
  | Novo grupo de opções | Novo grupo de complementos | New Complement Group |
  | Editar grupo de opções | Editar grupo de complementos | Edit Complement Group |
  | Nenhum grupo de opções | Nenhum grupo de complementos | No Complement Groups |
  | Adicionar opção | Adicionar complemento | Add Complement |
- **Priority**: P0 (affects entire feature perception)
- **Effort**: Low (text changes only, no logic changes)
- **Risk**: Low (no code behavior changes)

---

### Area 1: Admin Option Groups Management

#### IDEA-001: Empty State Enhancement

- **Problem**: Current empty state is just plain text "Nenhum grupo de opções criado" - lacks visual engagement and doesn't guide users on what to do next.
- **Solution**:
  - Add an illustrated empty state with an icon (e.g., `Layers` or `ListPlus`)
  - Include a brief explanation of what option groups are for
  - Add a prominent CTA button to create the first group
- **Implementation**:
  - Replace plain `Body` text with centered card containing icon + headline
  - Headline: "Nenhum grupo criado ainda"
  - Subtext: "Grupos de opções permitem adicionar extras aos seus produtos, como tamanhos, ingredientes e adicionais."
  - Primary button: "Criar primeiro grupo"
- **Files**: `src/features/option-groups/components/option-groups-section.tsx`
- **Priority**: P1
- **Effort**: Low

---

#### IDEA-002: Table Visual Hierarchy Improvement

- **Problem**: The table lacks visual distinction between groups. All rows look identical, making it hard to scan quickly. The "Selection" and "Options" columns are not immediately clear in meaning.
- **Solution**:
  - Add subtle alternating row backgrounds
  - Add visual badges for selection rules (e.g., "Obrigatório" vs "Opcional")
  - Show option previews inline (first 2-3 option names)
  - Use color coding for required vs optional groups
- **Implementation**:
  - Add striped rows: `odd:bg-muted/50`
  - Add Badge component for selection type:
    - `minQuantity > 0`: Badge variant="default" → "Obrigatório"
    - `minQuantity === 0`: Badge variant="secondary" → "Opcional"
  - Add collapsed option preview: "Queijo, Bacon, Cebola..."
- **Files**: `src/features/option-groups/components/option-groups-section.tsx`
- **Priority**: P3
- **Effort**: Low

---

#### IDEA-003: Quick Actions and Bulk Operations

- **Problem**: No way to quickly duplicate a group or perform bulk actions. Each action requires opening a sidebar.
- **Solution**:
  - Add a "Duplicate" action button alongside Edit/Delete
  - Add row selection checkboxes for bulk delete
  - Add search/filter for groups when list grows large
- **Implementation**:
  - Add `Copy` icon button next to Edit
  - `onClick`: `duplicateOptionGroup(group)` with name suffix "(Cópia)"
  - Add optional checkbox column when `groups.length > 5`
- **Files**: `src/features/option-groups/components/option-groups-section.tsx`
- **Priority**: P3
- **Effort**: Medium

---

### Area 2: Option Group Form

#### IDEA-004: Improved Selection Rule UX

- **Problem**: Min/max quantity inputs are separate number fields without visual guidance. Users might not understand the relationship between them or what "0 min" means.
- **Solution**:
  - Replace two separate inputs with a unified "Selection Rule" selector
  - Provide preset options: "Opcional (0-1)", "Obrigatório (1)", "Escolha múltipla (1-3)", "Personalizado"
  - Only show custom min/max inputs when "Personalizado" is selected
- **Implementation**:
  - Create new `SelectionRuleSelector` component
  - Presets:
    - "Opcional (escolha até 1)" → min:0, max:1
    - "Obrigatório (escolha 1)" → min:1, max:1
    - "Escolha múltipla (1 a 3)" → min:1, max:3
    - "Personalizado..." → shows min/max inputs
  - Show human-readable preview: "Cliente deve escolher entre 1 e 3 opções"
- **Files**:
  - Create: `src/features/option-groups/components/selection-rule-selector.tsx`
  - Modify: `src/features/option-groups/components/option-group-form.tsx`
- **Priority**: P0
- **Effort**: Medium

---

#### IDEA-005: Option Row Layout Improvements

- **Problem**: Current grid layout (`grid-cols-[auto_1fr_auto_auto_auto]`) is cramped on mobile. The reorder arrows are tiny (h-6 w-6) and hard to tap. Labels are hidden for some fields.
- **Solution**:
  - Stack layout on mobile (single column with horizontal row for price/qty)
  - Make reorder controls touch-friendly (larger tap targets)
  - Add drag-and-drop reordering as alternative
  - Show option index number for visual reference
- **Implementation**:
  - Responsive grid: `grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto_auto]`
  - Reorder buttons: `h-8 w-8` on mobile
  - Add index badge: "1.", "2.", etc.
  - Optional: `@dnd-kit` for drag reordering
- **Files**: `src/features/option-groups/components/option-row.tsx`
- **Priority**: P2
- **Effort**: Medium

---

#### IDEA-006: Option Price Visual Feedback

- **Problem**: Price input doesn't show whether this option adds cost or is included. No visual distinction between free add-ons and paid extras.
- **Solution**:
  - Add color-coded price indicator (green for +$, gray for included)
  - Show real-time preview: "Adiciona R$ 3,00 ao pedido"
  - Add quick "Incluído" toggle to set price to 0
- **Implementation**:
  - Price > 0: Show "+R$ X,XX" in green text below input
  - Price = 0: Show "Incluído" badge in gray
  - Add small toggle link: "Marcar como incluído"
- **Files**: `src/features/option-groups/components/option-row.tsx`
- **Priority**: P3
- **Effort**: Low

---

#### IDEA-007: Item Selection UX Enhancement

- **Problem**: The combobox for selecting items doesn't show item prices or categories, making it hard to choose the right item from a long menu.
- **Solution**:
  - Show item category and current price in combobox dropdown
  - Group items by category in the dropdown
  - Add item image thumbnail in selection
- **Implementation**:
  - Combobox option format: "Item Name (Categoria) - R$ X,XX"
  - Group by category with sticky headers
  - Optional: small 24px thumbnail on hover
- **Files**:
  - Modify: `src/features/option-groups/components/option-row.tsx`
  - Modify: `src/shared/combobox.tsx` (if grouping support needed)
- **Priority**: P2
- **Effort**: Medium

---

### Area 3: Link Option Groups to Products

#### IDEA-008: Empty State and Discoverability

- **Problem**: When no groups exist, the "Adicionar grupo" dropdown is empty with just "Nenhum grupo encontrado" - no path to create one is visible unless user clicks "Criar novo grupo" button.
- **Solution**:
  - Inline prompt when dropdown is empty: "Você ainda não tem grupos. Crie um agora."
  - Auto-expand create form when no groups exist
  - Add tooltip explaining what groups are for
- **Implementation**:
  - Check `availableGroups.length === 0 && allGroups.length === 0`
  - Show inline message with CTA instead of empty dropdown
  - Auto-set `showCreateForm = true` when no groups exist
- **Files**: `src/features/option-groups/components/link-option-groups-content.tsx`
- **Priority**: P3
- **Effort**: Low

---

#### IDEA-009: Selected Groups Visual Hierarchy

- **Problem**: Selected groups all look the same. No indication of priority/order beyond position. The reorder arrows require precise tapping.
- **Solution**:
  - Number the selected groups (1., 2., 3.) to show order
  - Add "Primary group" badge to first item
  - Use drag handles instead of up/down arrows
  - Add visual drag indicator (grip lines)
- **Implementation**:
  - Add numbered badge: `Badge variant="outline" className="text-xs"`
  - First group gets: `Badge "Principal" variant="default"`
  - Replace `ArrowUp/ArrowDown` with `GripVertical` icon
  - Use `@dnd-kit/sortable` for drag-and-drop
- **Files**: `src/features/option-groups/components/link-option-groups-content.tsx`
- **Priority**: P1
- **Effort**: Medium

---

#### IDEA-010: Inline Create Form UX

- **Problem**: Creating a new group inline (within the link modal) uses the full `OptionGroupForm` which is designed for sidebar use. It's cramped and missing context.
- **Solution**:
  - Create a compact version of the form for inline use
  - Reduce vertical spacing
  - Use collapsible sections for advanced options
  - Show "Creating will automatically link this group" hint
- **Implementation**:
  - Add `compact` prop to `OptionGroupForm`: reduces padding/spacing
  - Collapse "Opções" section by default with count
  - Add info banner: "O grupo será vinculado automaticamente após criação"
- **Files**:
  - Modify: `src/features/option-groups/components/option-group-form.tsx`
  - Modify: `src/features/option-groups/components/link-option-groups-content.tsx`
- **Priority**: P3
- **Effort**: Medium

---

### Area 4: POS Option Selection

#### IDEA-011: Progress Indicator for Multi-Group Selection

- **Problem**: When a product has multiple option groups, there's no clear progress indicator. Users don't know how many groups need attention or which ones are complete.
- **Solution**:
  - Add a horizontal stepper/progress bar at the top
  - Show checkmarks for completed groups
  - Highlight current incomplete group
  - Auto-scroll to first incomplete group
- **Implementation**:
  - Create `OptionGroupProgressIndicator` component at top of modal
  - Steps = `groups.map(g => ({ name: g.name, complete: isComplete(g) }))`
  - Use smooth scroll to first incomplete group
  - Visual: circles with checkmarks/numbers connected by lines
- **Files**:
  - Create: `src/features/pos/components/option-group-selector/option-group-progress-indicator.tsx`
  - Modify: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`
- **Priority**: P0
- **Effort**: Medium

---

#### IDEA-012: Selection Validation Feedback

- **Problem**: Current validation only disables the "Confirmar" button. Users may not understand why they can't proceed. The green/amber badge is subtle.
- **Solution**:
  - Add inline validation messages per group
  - Shake animation on incomplete groups when trying to confirm
  - Toast notification explaining what's missing
  - More prominent completion badges
- **Implementation**:
  - Below each group: `SmallText "Selecione mais X opções"` in red
  - On confirm click with invalid: shake animation + toast
  - Badge size increase: from `text-sm` to `text-base`
  - Add icon: `CheckCircle` for complete, `AlertCircle` for incomplete
- **Files**:
  - Modify: `src/features/pos/components/option-group-selector/option-group-step.tsx`
  - Modify: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`
- **Priority**: P1
- **Effort**: Low

---

#### IDEA-013: Option Row Touch Optimization

- **Problem**: Plus/minus buttons (h-8 w-8) are small for touch interfaces. The entire row should be tappable for single-select groups.
- **Solution**:
  - Increase button size on touch devices
  - Make entire row tappable for quantity 0→1 toggle
  - Add visual selection state (border highlight, background change)
  - Haptic feedback simulation (animation on tap)
- **Implementation**:
  - Buttons: `h-10 w-10` on mobile, `h-8 w-8` on desktop
  - Row `onClick` when `quantity=0 && maxQuantity=1`: `setQuantity(1)`
  - Selected state: `border-primary bg-primary/5`
  - Add scale animation: `active:scale-95 transition`
- **Files**: `src/features/pos/components/option-group-selector/option-selector-row.tsx`
- **Priority**: P1
- **Effort**: Low

---

#### IDEA-014: Quick Selection Patterns (Radio Behavior)

- **Problem**: For common patterns like "pick exactly 1", users must click + on one option and - on another if changing their mind. No radio-button behavior.
- **Solution**:
  - Detect single-selection groups (max=1) and use radio behavior
  - Auto-deselect others when selecting new option
  - Add "Trocar" action for already-selected items
  - Visual radio indicator for single-select groups
- **Implementation**:
  - `if (group.maxQuantity === 1)`: use radio behavior
  - Selecting new option: set others to 0 automatically
  - Show radio circles instead of +/- for single-select
  - Multi-select groups keep current +/- behavior
- **Files**:
  - Modify: `src/features/pos/components/option-group-selector/option-group-step.tsx`
  - Modify: `src/features/pos/components/option-group-selector/option-selector-row.tsx`
- **Priority**: P0
- **Effort**: Medium

---

### Area 5: Cart Display and Editing

#### IDEA-015: Options Display Compactness

- **Problem**: Each selected option takes a full line. With many options, the cart item becomes very tall and hard to scan.
- **Solution**:
  - Collapse options into a single line when > 3 options
  - Use chips/tags instead of list format
  - Show expandable "Ver X opções" link
  - Group by option group name for organization
- **Implementation**:
  - `if (options.length > 3)`: show collapsed view
  - Collapsed: "Queijo, Bacon +2 mais" as tags
  - Click to expand full list
  - Group header: "Adicionais: Queijo, Bacon"
- **Files**:
  - Create: `src/features/pos/components/collapsible-options-list.tsx`
  - Modify: `src/features/pos/components/pos-cart-item.tsx`
- **Priority**: P2
- **Effort**: Low

---

#### IDEA-016: Edit Options Discoverability

- **Problem**: The pencil icon for editing options is small and not obvious. Users might not know they can modify options after adding to cart.
- **Solution**:
  - Add "Editar opções" text label next to icon on first cart item
  - Show edit button more prominently for items with options
  - Add tooltip explaining the action
  - Consider inline quick-edit for simple changes
- **Implementation**:
  - First item with options: Button with "Editar" text + icon
  - Subsequent items: just icon with tooltip
  - Hover state: Button variant change for visibility
  - Add `TooltipContent`: "Modificar opções e observações"
- **Files**: `src/features/pos/components/pos-cart-item.tsx`
- **Priority**: P2
- **Effort**: Low

---

## Priority Matrix

| Priority | ID | Improvement | Impact | Effort | Area |
|----------|-----|-------------|--------|--------|------|
| P0 | IDEA-000 | Terminology Rename (Complementos) | High | Low | All |
| P0 | IDEA-011 | Progress Indicator | High | Medium | POS |
| P0 | IDEA-014 | Quick Selection Patterns (Radio) | High | Medium | POS |
| P0 | IDEA-004 | Selection Rule UX | High | Medium | Form |
| P1 | IDEA-012 | Validation Feedback | High | Low | POS |
| P1 | IDEA-013 | Touch Optimization | Medium | Low | POS |
| P1 | IDEA-009 | Selected Groups Hierarchy | Medium | Medium | Link |
| P1 | IDEA-001 | Empty State | Medium | Low | Admin |
| P2 | IDEA-005 | Option Row Layout | Medium | Medium | Form |
| P2 | IDEA-015 | Options Display Compactness | Medium | Low | Cart |
| P2 | IDEA-016 | Edit Discoverability | Low | Low | Cart |
| P2 | IDEA-007 | Item Selection Enhancement | Medium | Medium | Form |
| P3 | IDEA-002 | Table Visual Hierarchy | Low | Low | Admin |
| P3 | IDEA-006 | Option Price Feedback | Low | Low | Form |
| P3 | IDEA-008 | Empty State Discoverability | Low | Low | Link |
| P3 | IDEA-003 | Quick Actions | Low | Medium | Admin |
| P3 | IDEA-010 | Inline Create UX | Low | Medium | Link |

---

## Implementation Phases

### Phase 1: Foundation & POS Critical Path (P0)

Start with terminology alignment, then focus on the customer-facing POS experience:

| Task | Description | Files |
|------|-------------|-------|
| IDEA-000 | Rename to "Complementos" terminology | All option-groups components (text-only changes) |
| IDEA-011 | Progress Indicator for Multi-Group | Create `option-group-progress-indicator.tsx`, modify modal |
| IDEA-014 | Radio Behavior for Single-Select | Modify `option-group-step.tsx`, `option-selector-row.tsx` |
| IDEA-004 | Selection Rule Selector | Create `selection-rule-selector.tsx`, modify `option-group-form.tsx` |

### Phase 2: Validation and Feedback (P1)

Improve feedback and make the interface more touch-friendly:

| Task | Description | Files |
|------|-------------|-------|
| IDEA-012 | Better Validation Feedback | Modify `option-group-step.tsx`, modal |
| IDEA-013 | Touch Optimization | Modify `option-selector-row.tsx` |
| IDEA-009 | Selected Groups Visual Hierarchy | Modify `link-option-groups-content.tsx` |
| IDEA-001 | Admin Empty State | Modify `option-groups-section.tsx` |

### Phase 3: Polish and Refinements (P2-P3)

Final polish after core UX is solid:

| Task | Description | Files |
|------|-------------|-------|
| IDEA-005 | Responsive Option Row | Modify `option-row.tsx` |
| IDEA-015 | Collapsible Options in Cart | Create component, modify `pos-cart-item.tsx` |
| IDEA-016 | Edit Button Discoverability | Modify `pos-cart-item.tsx` |
| Remaining P3 items | Visual polish and nice-to-haves | Various |

---

## New Components to Create

| Component | Purpose | Location |
|-----------|---------|----------|
| `SelectionRuleSelector` | Unified min/max selection preset picker | `src/features/option-groups/components/` |
| `OptionGroupProgressIndicator` | Stepper showing group completion in POS | `src/features/pos/components/option-group-selector/` |
| `CollapsibleOptionsList` | Compact options display for cart items | `src/features/pos/components/` |

---

## Files Summary

### Files to Modify

| File | Ideas |
|------|-------|
| `option-groups-section.tsx` | IDEA-000, IDEA-001, IDEA-002, IDEA-003 |
| `option-group-form.tsx` | IDEA-000, IDEA-004, IDEA-005, IDEA-010 |
| `option-row.tsx` | IDEA-000, IDEA-005, IDEA-006, IDEA-007 |
| `link-option-groups-content.tsx` | IDEA-000, IDEA-008, IDEA-009, IDEA-010 |
| `link-option-groups-modal.tsx` | IDEA-000 |
| `create-or-update-item-form.tsx` | IDEA-000 |
| `option-group-selector-modal.tsx` | IDEA-000, IDEA-011, IDEA-012 |
| `option-group-step.tsx` | IDEA-000, IDEA-012, IDEA-014 |
| `option-selector-row.tsx` | IDEA-013, IDEA-014 |
| `pos-cart-item.tsx` | IDEA-015, IDEA-016 |

### Files to Create

| File | Ideas |
|------|-------|
| `selection-rule-selector.tsx` | IDEA-004 |
| `option-group-progress-indicator.tsx` | IDEA-011 |
| `collapsible-options-list.tsx` | IDEA-015 |

---

## Dependencies

- No external library dependencies required for most improvements
- Optional: `@dnd-kit` for drag-and-drop reordering (IDEA-009)
- All improvements use existing Tailwind CSS and Radix UI primitives

---

## Success Metrics

- **POS Selection Time**: Reduce average time to complete option selection by 30%
- **Touch Error Rate**: Reduce mis-taps on +/- buttons by 50% with larger targets
- **Admin Task Completion**: Increase successful option group creation rate on first attempt
- **User Satisfaction**: Qualitative feedback on "ease of use" for option management

---

## Open Questions

1. Should drag-and-drop be prioritized over arrow buttons, or keep both?
2. Should we add keyboard shortcuts for POS operators (e.g., number keys to select options)?
3. Should option groups support images/icons in a future iteration?
