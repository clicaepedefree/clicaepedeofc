# Feature: Option Groups & Options for Item Offerings

**Created**: 2026-02-08
**Status**: Planning
**Branch**: `feat/add-support-to-option-groups`

## Feature Overview

### Goal

Add support for **option groups** (grupos de opções) and **options** (opções) attached to item offerings, following the iFood catalog model. This allows items like "Hamburger" to have customizable groups like "Choose your cheese" or "Extra toppings" with configurable min/max selection rules.

### User Value

- Store owners can create rich, customizable menus with complements/options
- POS operators can accurately capture customer preferences when placing orders
- Order history preserves exact option selections (snapshot) so editing option groups later won't break past orders

### Scope

**Included:**
- DB schema for option groups and options (+ order snapshots)
- Server actions & DB queries for CRUD of option groups/options
- Catalog UI: manage option groups when creating/editing item offerings
- POS UI: option group selection modal when adding item to cart
- POS UI: edit previously added cart item options
- Cart state updated to hold selected options with correct price calculation
- Order creation stores option selections as snapshots

**Excluded:**
- iFood sync of option groups (separate feature)
- Menu-specific option group overrides (future enhancement)
- Option images/logos (keep it simple for MVP)

## Architecture Alignment

### Patterns to Follow

1. **Permission check first** in all server actions (`validateUserPermissionsForStore`)
2. **Transaction-aware DB functions** accepting `DbSession` parameter
3. **Drizzle schema** in `src/services/db/schema/` with separate relation files
4. **Feature module structure**: `api.ts`, `db.ts`, `types.ts`, `cache-keys.ts`, `form-validation/`, `hooks/`, `components/`
5. **Jotai atoms** for cart state with `atomWithStorage` for persistence
6. **TanStack Query** for server data, **TanStack Form + Zod** for forms
7. **Snapshot pattern** for order data (store names/prices at order time, not just foreign keys)
8. **Toast feedback** via `dispatchToast()`

### Data Model Design

```
optionGroupsTable (NEW - store-level, reusable)
  ├── storeId (FK to stores)
  ├── name, minQuantity, maxQuantity
  └── optionsTable (NEW - 1:N child of option group)
       ├── itemId (FK to items - reuses existing items as options)
       ├── price, originalPrice, minQuantity, maxQuantity, index

itemOfferingOptionGroupsTable (NEW - M:N junction)
  ├── itemOfferingId (FK to item_offerings)
  ├── optionGroupId (FK to option_groups)
  └── index (display order per item offering)

orderItemsTable (existing)
  └── orderItemOptionsTable (NEW - 1:N, snapshot data)
       ├── optionGroupName, optionName, price, quantity
```

**Key design decisions:**
- **Option groups are store-level entities**, not owned by a single item offering. A group like "Choose your cheese" can be attached to multiple item offerings via the `item_offering_option_groups` junction table.
- An **option** references an existing `item` (via `itemId`), so the same product can appear as a standalone item offering OR as an option in a group. The option row stores its own price/quantity overrides.
- **Order item options** are snapshots — they store the group name, option name, and price at the time of order. This ensures past orders remain intact even if option groups are edited or deleted later.
- `optionGroupsTable.minQuantity/maxQuantity` controls how many options the customer must/can select from the group (e.g., min=1 max=1 = radio, min=0 max=3 = optional multi-select).
- `optionsTable.minQuantity/maxQuantity` controls how many times a single option can be selected (e.g., "extra bacon" x1 to x3).
- The **junction table** `item_offering_option_groups` has its own `index` field, so the same option group can appear at different positions in different item offerings.

## Implementation Tasks

### Core Tasks (Required for MVP)

#### TASK-001: Create DB schema for option groups, options & junction table

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: None
- **Parallelizable With**: TASK-002
- **Files**:
  - Create: `src/services/db/schema/option-groups.ts`
  - Create: `src/services/db/schema/option-groups-relations.ts`
  - Create: `src/services/db/schema/options.ts`
  - Create: `src/services/db/schema/options-relations.ts`
  - Create: `src/services/db/schema/item-offering-option-groups.ts`
  - Create: `src/services/db/schema/item-offering-option-groups-relations.ts`
  - Modify: `src/services/db/schema/index.ts` (add exports)
  - Modify: `src/services/db/schema/item-offerings-relations.ts` (add itemOfferingOptionGroups relation)
  - Modify: `src/services/db/schema/items-relations.ts` (add options relation)
- **Implementation Notes**:
  - `option_groups` table: `id`, `store_id` (FK to stores), `name`, `min_quantity`, `max_quantity`, `created_at`, `updated_at`
    - Store-level entity — **reusable across multiple item offerings**
  - `options` table: `id`, `option_group_id` (FK), `item_id` (FK to items), `price` (numeric 19,4, **default 0** — supports zero-price options), `original_price` (numeric 19,4 nullable), `min_quantity` (default 0), `max_quantity` (default 1), `index`, `created_at`, `updated_at`
  - `item_offering_option_groups` junction table: `id`, `item_offering_id` (FK), `option_group_id` (FK), `index` (display order per offering)
    - M:N relationship — same option group can be linked to many item offerings
    - `index` allows different ordering per item offering
  - Use `onDelete: 'cascade'` from options → option_groups (deleting a group removes its options)
  - Use `onDelete: 'cascade'` from item_offering_option_groups → item_offerings (deleting an offering removes the link but NOT the group itself)
  - Use `onDelete: 'cascade'` from item_offering_option_groups → option_groups (deleting a group removes all links)
  - Use `onDelete: 'no action'` from options → items (don't delete items when removing an option reference)
  - Use `createdAt`, `updatedAt` helpers from `schema/utils.ts`

#### TASK-002: Create DB schema for order item options (snapshot)

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-001
- **Files**:
  - Create: `src/services/db/schema/order-item-options.ts`
  - Create: `src/services/db/schema/order-item-options-relations.ts`
  - Modify: `src/services/db/schema/index.ts` (add export)
  - Modify: `src/services/db/schema/order-items-relations.ts` (add options relation)
- **Implementation Notes**:
  - `order_item_options` table: `id`, `order_item_id` (FK), `option_group_name` (text snapshot), `option_name` (text snapshot), `price` (numeric 19,4), `quantity` (numeric 19,4), `index` (integer)
  - This is a **snapshot** — no FK to option_groups or options tables
  - This ensures past orders are never broken by catalog edits
  - `onDelete: 'cascade'` from order_item_options → order_items

#### TASK-003: Generate and run DB migration

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-001, TASK-002
- **Parallelizable With**: None
- **Files**:
  - Generated migration files in `drizzle/` folder
- **Implementation Notes**:
  - Run `bunx --bun drizzle-kit generate`
  - Run `bunx --bun drizzle-kit migrate`
  - Verify tables are created correctly

#### TASK-004: Add option groups feature module (types, cache-keys, db.ts, api.ts)

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: High
- **Dependencies**: TASK-003
- **Parallelizable With**: TASK-005
- **Files**:
  - Create: `src/features/option-groups/types.ts`
  - Create: `src/features/option-groups/cache-keys.ts`
  - Create: `src/features/option-groups/db.ts`
  - Create: `src/features/option-groups/api.ts`
  - Create: `src/features/option-groups/form-validation/option-group-schema.ts`
- **Implementation Notes**:
  - **types.ts**: Define `NewOptionGroup`, `OptionGroup`, `NewOption`, `Option`, `OptionGroupWithOptions` types derived from schema
  - **cache-keys.ts**: `optionGroupsCacheKey(storeId, itemOfferingId?)`
  - **db.ts**: CRUD functions for option groups, options, and junction links, all accepting `dbSession` parameter
    - `createOptionGroupOnDb`, `updateOptionGroupOnDb`, `deleteOptionGroupOnDb`
    - `createOptionOnDb`, `updateOptionOnDb`, `deleteOptionOnDb`
    - `linkOptionGroupToItemOffering`, `unlinkOptionGroupFromItemOffering`, `updateItemOfferingOptionGroupIndex`
    - `getOptionGroupsByStoreId` (all groups for a store, with options nested)
    - `getOptionGroupsByItemOfferingId` (only linked groups, with options nested, ordered by junction index)
    - `getNextOptionIndex`
  - **api.ts**: Server actions wrapping db functions with permission checks
    - `createOptionGroup(data)` — creates group + options in a transaction (store-level)
    - `updateOptionGroup(data)` — upserts options (add new, update existing, delete removed) in a transaction
    - `deleteOptionGroup(id, storeId)` — deletes group, cascades to options and junction links
    - `listOptionGroups(storeId)` — lists all option groups for a store
    - `listOptionGroupsByItemOffering(itemOfferingId, storeId)` — lists only linked groups
    - `linkOptionGroupsToItemOffering(itemOfferingId, optionGroupIds, storeId)` — creates/updates junction links
    - `unlinkOptionGroupFromItemOffering(itemOfferingId, optionGroupId, storeId)` — removes a junction link
  - **form-validation**: Zod schemas for option group form (name, min/max quantity, options array)

#### TASK-005: Update order feature to support options

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-003
- **Parallelizable With**: TASK-004
- **Files**:
  - Modify: `src/features/order/types.ts` (add `NewOrderItemOption` type, update `NewOrderItem`)
  - Modify: `src/features/order/db.ts` (add `createOrderItemOptionOnDb`)
  - Modify: `src/features/order/api.ts` (update `createOrder` to save options)
- **Implementation Notes**:
  - `NewOrderItemOption`: `{ optionGroupName, optionName, price, quantity, index }`
  - `NewOrderItem` gets a new optional field: `options?: NewOrderItemOption[]`
  - In `createOrder` transaction, after creating each order item, create its order item options
  - Update total price calculation to include option prices

#### TASK-006: Update menu feature to include option groups in queries

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-004
- **Parallelizable With**: TASK-005
- **Files**:
  - Modify: `src/features/menu/api.ts` (update `listMenuItems` and `listCategories` to include option groups)
  - Modify: `src/features/menu/types.ts` (add option group types to `MenuItem`, `ItemOfferingWithImage`)
  - Modify: `src/features/menu/db.ts` (if needed for queries)
- **Implementation Notes**:
  - `MenuItem` type gets: `optionGroups: OptionGroupWithOptions[]`
  - Update relational queries to go through the junction table: `with: { itemOfferingOptionGroups: { with: { optionGroup: { with: { options: { with: { item: true } } } } } } }`
  - Flatten the junction in the type so consumers see `optionGroups[]` directly, ordered by the junction's `index`
  - `listCategories` with `includeItems=true` should also load option groups via the junction

#### TASK-007: Catalog UI — Option groups management in item form

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: High
- **Dependencies**: TASK-004, TASK-006
- **Parallelizable With**: TASK-008
- **Files**:
  - Create: `src/features/option-groups/components/option-group-form.tsx`
  - Create: `src/features/option-groups/components/option-row.tsx`
  - Create: `src/features/option-groups/components/option-groups-section.tsx`
  - Create: `src/features/option-groups/hooks/use-option-groups.tsx`
  - Modify: `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx` (add option groups section)
  - Modify: `src/features/menu/form-validation/item-schema.ts` (add option groups to schema)
  - Modify: `src/features/menu/api.ts` (update `createItem`/`updateItem` to handle option groups)
- **Implementation Notes**:
  - **Two-part UI for catalog management:**
    1. **Option Group CRUD** (store-level): A section/page where the user creates and edits option groups with their options. These are reusable across item offerings.
    2. **Linking groups to item offerings**: In the item form (separate tab) or from the catalog table, the user selects which existing option groups to attach to each item offering and in what order.
  - **Option Group form** (create/edit): name, min quantity, max quantity, and a nested list of options. Each option has: item selector (combobox searching existing items), price override, min/max per option.
  - **Linking UI**: A multi-select or checklist of available option groups from the store, with drag or index controls for ordering per offering.
  - Additionally, a **separate modal** can be opened from the catalog management page (item offerings table) to quickly link/unlink option groups for a specific offering.
  - Zod schema validates: name required, maxQuantity >= minQuantity, at least 1 option per group
  - Options reuse existing items with price overrides — the option row has an item combobox (searching existing items) plus a price field.

#### TASK-008: POS UI — Option group selection modal

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: High
- **Dependencies**: TASK-006
- **Parallelizable With**: TASK-007
- **Files**:
  - Create: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`
  - Create: `src/features/pos/components/option-group-selector/option-group-step.tsx`
  - Create: `src/features/pos/components/option-group-selector/option-selector-row.tsx`
  - Modify: `src/features/pos/components/pos-menu-items-list.tsx` (open modal when item has option groups)
  - Modify: `src/features/pos/types.ts` (update `CartItem` to hold selected options)
  - Modify: `src/features/pos/state.ts` (update cart atoms to handle options in price calculation)
- **Implementation Notes**:
  - When user clicks on a menu item that has option groups: open a modal/drawer instead of directly adding to cart
  - Modal shows item name + price at top, then each option group as a section:
    - Group name + "Select X to Y" instruction
    - Options list with +/- quantity controls or checkboxes depending on min/max rules
    - Price displayed next to each option **only if price > 0** — zero-price options show no price label (cleaner UI for included/free options)
  - "Confirm" button validates all groups satisfy min/max, then adds to cart
  - Items WITHOUT option groups still add directly to cart (no modal)
  - `CartItem` gets: `selectedOptions?: CartItemOption[]` where `CartItemOption = { optionGroupName, optionName, price, quantity }`
  - `cartSessionTotalAtom` updated to include option prices: `item.price * item.quantity + sum(option.price * option.quantity) * item.quantity`
  - **For editing**: clicking on a cart item that has options re-opens the modal pre-filled with previous selections, allowing the user to change both quantity and options in the same modal

#### TASK-009: POS Cart UI — Display options & edit support

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-008
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/pos/components/pos-cart-item.tsx` (show selected options, add edit button)
  - Modify: `src/features/pos/state.ts` (add `updateCartItemOptionsAtom`)
  - Modify: `src/features/pos/hooks/use-cart.tsx` (expose edit option function)
- **Implementation Notes**:
  - Below each cart item, show a compact list of selected options (group name: option name x quantity)
  - Show options subtotal per item — **only show price next to options with price > 0** (zero-price options show name/quantity only, no price label)
  - Add an edit (pencil) icon button that opens the option group selector modal pre-filled with current selections
  - On confirm edit, replace the cart item's options with the new selections
  - `updateCartItemOptionsAtom`: takes index + new options, updates the cart item at that index

#### TASK-010: Update order creation to include options from cart

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-005, TASK-009
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/pos/hooks/use-cart.tsx` (map cart options to order item options)
- **Implementation Notes**:
  - In `createOrderMutation`, map `cartItem.selectedOptions` to `NewOrderItemOption[]`
  - Each selected option becomes a row in `order_item_options` with snapshot data
  - Update `totalPrice` calculation to account for options

#### TASK-011: Add option groups tab to item create/edit form

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Parallelizable With**: TASK-012
- **Files**:
  - Modify: `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx` (add tab system)
  - Possibly extract: a shared wrapper component for the tab layout
- **Implementation Notes**:
  - Add a **top-level tab bar** to the item create/edit form with two tabs:
    1. **"Item"** — the existing item information form (name, description, image, price, stock, etc.)
    2. **"Grupos de Opções"** — reuses the existing `LinkOptionGroupsModal` content (the list of available groups with checkboxes) but rendered inline as a tab panel instead of inside a Sheet
  - The "Grupos de Opções" tab shows the **linking UI** for the current item offering: which option groups are attached and allows toggling them on/off
  - This tab should only be available when **editing** an existing item (not when creating), since we need the `itemOfferingId` to link groups
  - Reuse the same components/logic already built in `link-option-groups-modal.tsx` — extract the inner content into a shared component (e.g. `LinkOptionGroupsContent`) that can be rendered both inside the Sheet modal and inside the tab panel

#### TASK-012: Allow creating option groups inline from the link modal

- **Status**: ⏳ Pending
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Parallelizable With**: TASK-011
- **Files**:
  - Modify: `src/features/option-groups/components/link-option-groups-modal.tsx` (add inline create)
  - Reuse: `src/features/option-groups/components/option-group-form.tsx`
- **Implementation Notes**:
  - Add a **"Criar novo grupo"** (Create new group) button at the top or bottom of the link option groups modal/content
  - Clicking it expands or opens the existing `OptionGroupForm` inline within the modal, allowing the user to create a new option group without navigating to the "Grupos de Opções" tab on the menu page
  - On successful creation, the new group is automatically added to the list of available groups and can be immediately selected/linked to the current item offering
  - Invalidate the option groups query cache after creation so the list refreshes
  - This should work in both contexts: when rendered as a Sheet modal (from item offerings table) and when rendered inline as a tab panel (from TASK-011)

### Optional Tasks (Nice-to-Have Enhancements)

#### TASK-OPT-001: Display option details in order history / receipt

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-010
- **Value Add**: Show selected options when viewing past orders and on printed receipts
- **Files**:
  - Modify: receipt feature components
  - Modify: order listing components (if they exist)
- **Implementation Notes**:
  - Query order items with their options
  - Display indented under each item in the order detail view

#### TASK-OPT-002: Reorder option groups via drag & drop

- **Status**: ⏳ Pending
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Value Add**: Allow store owners to reorder option groups and options within groups
- **Files**:
  - Modify: option-groups-section.tsx
- **Implementation Notes**:
  - Use a drag-and-drop library to reorder groups and options
  - Update `index` fields on save

## Task Dependency Graph

```
Parallel Stream 1 (Schema):
  TASK-001 (option groups schema) ──┐
                                     ├── TASK-003 (migration) ──┐
  TASK-002 (order options schema) ──┘                           │
                                                                │
Parallel Stream 2 (Backend):                                    │
  TASK-004 (option groups feature module) ◄─────────────────────┤
  TASK-005 (update order feature) ◄─────────────────────────────┘
                                     │
Parallel Stream 3 (Integration):     │
  TASK-006 (update menu queries) ◄───┘ (depends on TASK-004)
                                     │
Parallel Stream 4 (Frontend):       │
  TASK-007 (catalog UI) ◄───────────┤ (depends on TASK-004 + TASK-006)
  TASK-008 (POS selector modal) ◄───┘ (depends on TASK-006)
                                     │
Sequential:                          │
  TASK-009 (cart UI + edit) ◄────────┘ (depends on TASK-008)
  TASK-010 (order creation) ◄──── (depends on TASK-005 + TASK-009)

Catalog UX Enhancements (after TASK-007, parallelizable):
  TASK-011 (option groups tab in item form)
  TASK-012 (inline create from link modal)

Optional (after TASK-010):
  TASK-OPT-001 (order history/receipt)
  TASK-OPT-002 (drag & drop reorder)
```

## Implementation Guidelines

### Keep It Simple

- Option groups management can be done in a **separate section/drawer** after the item offering is saved — don't try to nest everything in one giant form
- Use simple +/- buttons for quantity selection, checkboxes for single-select groups
- Don't implement drag-and-drop reordering in MVP — use `index` field with simple ordering
- Option images are out of scope — just show option name and price

### Testing Strategy

- Manual testing checklist:
  - [ ] Create item offering with 0, 1, and multiple option groups
  - [ ] Create option group with various min/max combinations (0/1, 1/1, 0/3, 2/5)
  - [ ] POS: add item without groups (direct add, no modal)
  - [ ] POS: add item with groups (modal appears, validate min/max)
  - [ ] POS: edit cart item options
  - [ ] POS: verify total price includes options
  - [ ] Create order with options and verify snapshot in DB
  - [ ] Edit/delete option group and verify old orders are intact
  - [ ] Delete item used as option and verify it doesn't cascade-delete the item
  - [ ] Create option with price = 0 and verify no price is shown in POS modal or cart
  - [ ] Create option with price > 0 and verify price is displayed in POS modal and cart
  - [ ] Edit existing item: verify "Grupos de Opções" tab appears and shows linked groups
  - [ ] Create new item: verify "Grupos de Opções" tab is NOT shown (no itemOfferingId yet)
  - [ ] From link modal: create a new option group inline and verify it appears in the list immediately
  - [ ] From link modal: create a new group inline, then link it, and verify it persists

### Rollout Considerations

- **Database migration**: New tables only (no modifications to existing tables except relations). Safe to run on production.
- **Backwards compatibility**: Items without option groups continue to work exactly as before — no modal, direct add to cart.
- **Cart state migration**: Existing cart sessions in localStorage won't have `selectedOptions`. Code must handle `undefined` gracefully (treat as empty array).

## Progress Tracking

| Task ID      | Title                                  | Type     | Status     | Started | Completed | Notes |
| ------------ | -------------------------------------- | -------- | ---------- | ------- | --------- | ----- |
| TASK-001     | DB schema: option groups, options & junction | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | -     |
| TASK-002     | DB schema: order item options          | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | -     |
| TASK-003     | Generate & run migration               | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Migration: 0027_add_option_groups_and_order_item_options.sql |
| TASK-004     | Option groups feature module           | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | -     |
| TASK-005     | Update order feature for options       | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | -     |
| TASK-006     | Update menu queries with option groups | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | -     |
| TASK-007     | Catalog UI: option groups management   | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Added tabs to menu page, option group CRUD section, link modal in item offerings table |
| TASK-008     | POS UI: option group selector modal    | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Created option selector modal with group steps, validation, and price calculation |
| TASK-009     | POS cart UI: display & edit options     | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Options display in cart, edit via pencil button re-opens modal |
| TASK-010     | Order creation with options            | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Maps cart selectedOptions to order item options snapshots |
| TASK-011     | Option groups tab in item form         | Core     | ⏳ Pending | -       | -         | -     |
| TASK-012     | Inline create from link modal          | Core     | ⏳ Pending | -       | -         | -     |
| TASK-OPT-001 | Order history / receipt options        | Optional | ⏳ Pending | -       | -         | -     |
| TASK-OPT-002 | Drag & drop reorder                   | Optional | ⏳ Pending | -       | -         | -     |

## Decisions (Resolved)

- **Option groups in catalog**: Managed in a separate tab within the item form OR via a separate modal accessible from the catalog management page
- **Option groups in POS**: Managed in the same form/modal when adding an item to cart
- **Options reuse existing items**: Yes — options reference existing items via `itemId` with price overrides (similar to how item offerings work for categories)
- **Editing cart items**: Clicking edit opens the option selector modal where the user can change BOTH quantity and options simultaneously
- **Zero-price options**: Options can have price = 0 (free/included). In the POS modal and cart, zero-price options do NOT display a price label — only the option name and quantity are shown

## Notes & Learnings

- The existing `order_items` table already uses a **snapshot pattern** (stores `itemName`, `categoryName`, `price` directly). We follow the same pattern for `order_item_options`.
- The existing cart state uses `atomWithStorage` which serializes to localStorage. The new `selectedOptions` array will be serialized automatically.
- The existing `addItemToCart` atom creates a new cart item each time (no deduplication). This works well for items with different option selections.
