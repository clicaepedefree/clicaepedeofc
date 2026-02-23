# Feature: Cart Item Editing Enhancements & Item Comments

**Created**: 2026-02-08
**Status**: Planning
**Branch**: `feat/add-support-to-option-groups`

## Feature Overview

### Goal

Two enhancements to the POS cart experience:

1. **Full edit support for cart items**: When editing a cart item, the modal should show ALL information from the original add flow — option groups (if any), and the comment field. Currently, the edit button only appears when the item has `selectedOptions`, and it only allows changing option groups. Items without option groups have no edit capability at all.

2. **Item comment / observações**: Add a multi-line text field ("Observações") to every item in the POS flow. This field appears in the option group selector modal (for items with option groups) AND in a simpler modal for items without option groups. The comment is saved to the `order_items` table and displayed in the cart.

### User Value

- POS operators can add special instructions per item (e.g., "sem cebola", "bem passado", "alergia a amendoim")
- Editing a cart item gives the same full experience as adding it, making the UX consistent and predictable
- Comments are preserved in order history for kitchen/prep staff reference

### Scope

**Included:**
- DB migration: add `comment` (nullable text) column to `order_items`
- Cart state: add `comment` field to `CartItem` type
- POS modal: add "Observações" textarea to `OptionGroupSelectorModal` (works for items with AND without option groups)
- POS cart: show comment below options/item in cart, edit button available for ALL items (not just those with options)
- Order creation: map `comment` from cart to `order_items.comment`
- Edit flow: pre-fill comment and option selections when editing a cart item
- Invoices: show item comments in order history

**Excluded:**
- Comments on individual options (only at the item level)
- Character limit enforcement (keep it simple — just a text field)

## Architecture Alignment

### Patterns to Follow

1. **Snapshot pattern** for order data — `comment` is stored directly on `order_items`, not as a FK
2. **Transaction-aware DB functions** with `DbSession` parameter
3. **Jotai atoms** for cart state with `atomWithStorage`
4. **Permission check first** in server actions
5. **Close-after-action** pattern for Radix modals

### Data Changes

```
order_items table (MODIFY):
  + comment: text (nullable) — stores the observação/comment at order time

CartItem type (MODIFY):
  + comment?: string — stores the observação while item is in cart

CartItemOption type: unchanged

OptionGroupSelectorModal (MODIFY):
  + comment state (textarea)
  + works for items both with and without option groups
  + onConfirm callback updated to include comment
```

## Implementation Tasks

### Core Tasks

#### TASK-EXT-001: Add `comment` column to `order_items` table

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-EXT-002
- **Files**:
  - Modify: `src/services/db/schema/order-items.ts` (add `comment` column)
  - Generate migration: `bunx --bun drizzle-kit generate --name add_comment_to_order_items`
- **Implementation Notes**:
  - Add `comment: text('comment')` — nullable, no default
  - `InsertOrderItem` and `SelectOrderItem` types auto-update (inferred from schema)
  - Run migration: `bunx --bun drizzle-kit migrate`

#### TASK-EXT-002: Update cart types and state to support `comment`

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: None
- **Parallelizable With**: TASK-EXT-001
- **Files**:
  - Modify: `src/features/pos/types.ts` (add `comment?: string` to `CartItem`)
  - Modify: `src/features/pos/state.ts` (add `updateCartItemCommentAtom` or extend `updateCartItemOptionsAtom` to also handle comment)
- **Implementation Notes**:
  - Add `comment?: string` to `CartItem` type
  - The `addItemToCartAtom` already strips `optionGroups` but keeps `selectedOptions` — it should also keep `comment`
  - Option 1 (simpler): extend `updateCartItemOptionsAtom` to accept `{ index, selectedOptions, comment }` → rename to `updateCartItemAtom`
  - Option 2: separate atom for comment. **Prefer option 1** since edit always saves both at once.

#### TASK-EXT-003: Update `OptionGroupSelectorModal` to support comment and items without option groups

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-EXT-002
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx`
- **Implementation Notes**:
  - Add `comment` state: `const [comment, setComment] = useState('')`
  - Initialize `comment` from `initialComment` prop (for edit flow) in the existing `useEffect`
  - Add `initialComment?: string` to props type
  - Update `onConfirm` callback type: `(item: MenuItem, selectedOptions: CartItemOption[], comment: string) => void`
  - Add a "Observações" section at the bottom of the scrollable area (below option groups, if any):
    - Label: "Observações" with a `Body` component
    - `<textarea>` or use existing shared input component, multi-line, placeholder "Ex: sem cebola, bem passado..."
    - No character limit
  - The modal should now work for items WITHOUT option groups too:
    - If `groups.length === 0`, skip the option group steps entirely
    - Just show the item name/price header + comment textarea + confirm/cancel footer
    - `isValid` should always be `true` when there are no groups (no min/max to validate)
  - Update `handleConfirm` to pass `comment` to `onConfirm`

#### TASK-EXT-004: Update POS flows to always open modal and support comment

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-EXT-003
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/pos/components/pos-menu-items-list.tsx` (always open modal for all items)
  - Modify: `src/features/pos/components/pos-cart.tsx` (enable edit for all items, pass comment)
  - Modify: `src/features/pos/components/pos-cart-item.tsx` (show comment, enable edit for all items)
  - Modify: `src/features/pos/hooks/use-cart.tsx` (update `updateCartItemOptions` → `updateCartItem`)
- **Implementation Notes**:
  - **pos-menu-items-list.tsx**: Remove the `if/else` on `optionGroups.length` — ALL items now open the modal. `handleItemClick` always calls `setOptionModalItem(item)`. Update `handleOptionConfirm` to accept `comment` parameter and pass to `addItemToCart`.
  - **pos-cart.tsx**:
    - Remove the condition `item.selectedOptions?.length` for showing the edit button — ALL items should be editable
    - Pass `initialComment={editingItem?.item.comment}` to the modal
    - Update `handleEditConfirm` to accept `comment` and call the updated atom
  - **pos-cart-item.tsx**:
    - Remove the `hasOptions` condition from the edit button — always show edit pencil icon
    - Show `item.comment` below the selected options (if present), styled as muted text
  - **use-cart.tsx**: Expose the updated atom (renamed from `updateCartItemOptions` to `updateCartItem`)
  - **state.ts**: Rename `updateCartItemOptionsAtom` to `updateCartItemAtom`, accept `{ index, selectedOptions, comment }`. Update the cart item with both fields.

#### TASK-EXT-005: Update order creation to include comment

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-EXT-001, TASK-EXT-004
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/features/pos/hooks/use-cart.tsx` (map `comment` in `createOrderMutation`)
  - Modify: `src/features/order/types.ts` (if needed — `comment` should auto-infer from schema)
- **Implementation Notes**:
  - In `createOrderMutation`, add `comment: cartItem.comment ?? null` to each order item mapping
  - The `InsertOrderItem` type already includes `comment` after the schema change (inferred), so `NewOrderItem` (which is `Omit<InsertOrderItem, 'id' | 'orderId'>`) will also include it automatically

#### TASK-EXT-006: Show item comments in order history (invoices page)

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Low
- **Dependencies**: TASK-EXT-005
- **Parallelizable With**: None
- **Files**:
  - Modify: `src/app/(admin)/invoices/page.tsx` (show comment in expandable order item rows)
- **Implementation Notes**:
  - The `listOrders` query already fetches order items with options via relational query — `comment` will be included automatically once the schema is updated
  - In the expandable order item row, show `item.comment` below the item name/options if present, styled as italic muted text (e.g., `"Obs: sem cebola"`)

## Task Dependency Graph

```
Parallel (no dependencies):
  TASK-EXT-001 (DB migration: add comment column)
  TASK-EXT-002 (Cart types + state: add comment)

Sequential:
  TASK-EXT-003 (Modal: add comment textarea + support items without groups) ← TASK-EXT-002
  TASK-EXT-004 (POS flows: always open modal, pass comment) ← TASK-EXT-003
  TASK-EXT-005 (Order creation: map comment) ← TASK-EXT-001, TASK-EXT-004
  TASK-EXT-006 (Invoices: show comment) ← TASK-EXT-005
```

## Implementation Guidelines

### Keep It Simple

- The comment is just a nullable text column — no validation, no character limit
- The modal already handles both add and edit flows — just add the textarea and comment state
- Items without option groups will use the same modal, just without the option group steps
- No new components needed — just extend the existing modal

### Testing Strategy

- Manual testing checklist:
  - [ ] Add item WITHOUT option groups → modal opens → add a comment → confirm → item in cart shows comment
  - [ ] Add item WITH option groups → modal opens → select options + add comment → confirm → item in cart shows both options and comment
  - [ ] Edit cart item WITHOUT option groups → modal opens pre-filled with comment → change comment → confirm → cart updates
  - [ ] Edit cart item WITH option groups → modal opens pre-filled with options AND comment → change both → confirm → cart updates
  - [ ] Create order with items that have comments → verify `comment` is saved in `order_items` table
  - [ ] Create order with items without comments → verify `comment` is null
  - [ ] View order in invoices page → verify comments appear on items that have them
  - [ ] Edit item, clear the comment → confirm → verify comment is removed from cart item

### Rollout Considerations

- **Database migration**: Adds a nullable column to `order_items` — safe, no data loss, backwards compatible
- **Cart state migration**: Existing cart sessions in localStorage won't have `comment`. Code handles `undefined` gracefully (treat as empty string in modal, map to `null` for DB)

## Progress Tracking

| Task ID       | Title                                | Type | Status     | Started | Completed | Notes |
| ------------- | ------------------------------------ | ---- | ---------- | ------- | --------- | ----- |
| TASK-EXT-001  | DB: add comment column to order_items | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | Migration: 0028_add_comment_to_order_items.sql |
| TASK-EXT-002  | Cart types/state: add comment        | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | Renamed updateCartItemOptionsAtom → updateCartItemAtom, added comment field |
| TASK-EXT-003  | Modal: comment + items without groups | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | Added comment state, textarea, initialComment prop, works for items without groups |
| TASK-EXT-004  | POS flows: always open modal, edit all | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | All items open modal, all cart items editable, comment shown in cart |
| TASK-EXT-005  | Order creation: map comment          | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | Added comment mapping to order item creation |
| TASK-EXT-006  | Invoices: show item comments         | Core | ✅ Completed | 2026-02-08 | 2026-02-08 | Shows "Obs: ..." italic text below item options in expanded order rows |

## Open Questions

- None — the approach is straightforward and builds on existing patterns

---

---

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

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Parallelizable With**: TASK-012
- **Files**:
  - Created: `src/features/option-groups/components/link-option-groups-content.tsx` (extracted shared presentational component)
  - Modified: `src/features/option-groups/components/link-option-groups-modal.tsx` (refactored to use LinkOptionGroupsContent)
  - Modified: `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx` (added tab system with option groups)
- **Implementation Notes**:
  - Added tab bar with "Item" and "Grupos de Opções" tabs when editing an existing item (showOptionGroupsTab = !isCreatingItem && !!item?.itemOfferingId)
  - Extracted `LinkOptionGroupsContent` as a shared presentational component used by both `LinkOptionGroupsModal` and the form tab
  - Footer content swaps based on active tab: item form actions vs "Salvar grupos de opções" button
  - Option groups tab loads all groups via `useOptionGroups()` and allows toggling selection
  - Save triggers `linkOptionGroups` mutation with selected group IDs

#### TASK-012: Allow creating option groups inline from the link modal

- **Status**: ✅ Completed
- **Type**: Core
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Parallelizable With**: TASK-011
- **Files**:
  - Modified: `src/features/option-groups/components/link-option-groups-content.tsx` (added inline create form with toggle button)
  - Modified: `src/features/option-groups/components/link-option-groups-modal.tsx` (pass onCreateGroup/isCreating props)
  - Modified: `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx` (pass onCreateGroup/isCreating props)
  - Reused: `src/features/option-groups/components/option-group-form.tsx`
- **Implementation Notes**:
  - Added "Criar novo grupo" toggle button to `LinkOptionGroupsContent` (only shown when `onCreateGroup` prop is provided)
  - Clicking the button expands the `OptionGroupForm` inline within a bordered container
  - On successful creation, the form collapses and the new group is auto-selected via `setSelectedIds`
  - Cache invalidation happens automatically via the existing `useOptionGroups().createOptionGroup` mutation's `onSettled` callback
  - Works in both contexts: Sheet modal (LinkOptionGroupsModal) and tab panel (CreateOrUpdateItemForm)

### Optional Tasks (Nice-to-Have Enhancements)

#### TASK-OPT-001: Display option details in order history / receipt

- **Status**: ✅ Completed
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-010
- **Value Add**: Show selected options when viewing past orders and on printed receipts
- **Files**:
  - Modified: `src/features/order/api.ts` (updated `listOrders` to include items with options via relational query)
  - Modified: `src/app/(admin)/invoices/page.tsx` (expandable order rows showing items and options)
- **Implementation Notes**:
  - Updated `listOrders` to use `db.query.ordersTable.findMany` with nested `items → options` and `payments`
  - Invoices page now shows expandable rows — click a row to see order items with their selected options
  - Options with price > 0 show the price; zero-price options show only name/quantity
  - Added order status display and item count column
  - Receipt templates only exist for counter open/close — no order receipt template exists yet, so receipt part is deferred

#### TASK-OPT-002: Reorder option groups via drag & drop

- **Status**: ✅ Completed
- **Type**: Optional
- **Complexity**: Medium
- **Dependencies**: TASK-007
- **Value Add**: Allow store owners to reorder option groups and options within groups
- **Files**:
  - Modified: `src/features/option-groups/components/option-group-form.tsx` (added up/down reorder callbacks for options)
  - Modified: `src/features/option-groups/components/option-row.tsx` (added up/down arrow buttons, onMoveUp/onMoveDown props)
- **Implementation Notes**:
  - Used simple up/down arrow buttons instead of a full DnD library (no new dependencies needed)
  - Each option row shows small arrow-up and arrow-down buttons on the left side
  - First option disables the up arrow, last option disables the down arrow
  - Swapping updates `index` fields automatically on both swapped items
  - Grid layout updated from 4 columns to 5 to accommodate the reorder controls

### Bug Fix Tasks (Post-Testing)

#### TASK-OPT-003: Fix POS page freeze after confirming option selections

- **Status**: ✅ Completed
- **Type**: Bug Fix (Critical)
- **Complexity**: Medium
- **Dependencies**: TASK-008
- **Parallelizable With**: TASK-OPT-004, TASK-OPT-005
- **Files**:
  - Modify: `src/features/pos/state.ts` (strip optionGroups from cart items before localStorage write)
  - Modify: `src/features/pos/components/option-group-selector/option-group-selector-modal.tsx` (close modal before heavy state write)
  - Modify: `src/features/pos/components/pos-menu-items-list.tsx` (remove redundant setOptionModalItem(null))
  - Modify: `src/features/pos/components/pos-cart.tsx` (remove redundant setEditingItem(null))
- **Implementation Notes**:
  - **Root cause**: `handleConfirm` calls `onConfirm()` (heavy Jotai `atomWithStorage` write serializing full `MenuItem` including nested `optionGroups` to localStorage) simultaneously with Radix Dialog close. This prevents Radix from cleaning up `pointer-events: none` on `document.body`.
  - **Fix in `state.ts`**: In `addItemToCartAtom`, set `optionGroups: []` on the item before writing to the atom — the cart only needs `selectedOptions`, not the full group definitions
  - **Fix in modal**: In `handleConfirm`, call `onOpenChange(false)` FIRST, then `onConfirm()` via `setTimeout(0)` so Radix cleans up before the heavy state write. Capture `item` and `cartOptions` in local variables before the timeout for the closure.
  - **Fix in modal**: Memoize `groups` with `useMemo(() => item?.optionGroups ?? [], [item])` and add `initialSelections` to the useEffect deps: `[open, item, initialSelections]`
  - **Fix in pos-menu-items-list.tsx**: In `handleOptionConfirm`, remove `setOptionModalItem(null)` since the modal's `onOpenChange(false)` already triggers it
  - **Fix in pos-cart.tsx**: In `handleEditConfirm`, remove `setEditingItem(null)` since the modal's `onOpenChange(false)` already triggers it
- **Testing Plan**:
  - Navigate to POS → click item with option groups → select options → click "Confirmar" → page should remain interactive, item appears in cart
  - Edit cart item options → confirm → page should remain interactive
  - Verify cart total is still calculated correctly

#### TASK-OPT-004: Improve option groups selection UX with Combobox + item preview

- **Status**: ✅ Completed
- **Type**: Bug Fix / UX Improvement
- **Complexity**: High
- **Dependencies**: TASK-011
- **Parallelizable With**: TASK-OPT-003, TASK-OPT-005
- **Files**:
  - Modify: `src/features/option-groups/components/link-option-groups-content.tsx` (full rewrite: Combobox + ordered list with item preview)
  - Modify: `src/features/option-groups/components/link-option-groups-modal.tsx` (update to use new props: addGroup, removeGroup, reorderGroups)
  - Modify: `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx` (update to use new props)
- **Implementation Notes**:
  - **Replace toggle buttons with Combobox + ordered list** in `LinkOptionGroupsContent`:
    - New props: `onAddGroup(groupId)`, `onRemoveGroup(groupId)`, `onReorder(updatedIds)` replacing `onToggle`
    - Compute `availableGroups` (allGroups minus selected) for the Combobox
    - Compute `selectedGroups` by mapping `selectedGroupIds` → full objects (preserving order)
    - Top: `Combobox` from `@/shared/combobox` to add groups (with `value=""` so it resets after selection)
    - Below: ordered list of selected groups, each row shows:
      - Group name + item names preview (e.g. "Queijo Cheddar, Queijo Prato, Mussarela" truncated to 4 items max with `+N` suffix)
      - Option count + selection range (e.g. "3 opções · Seleção: 1 a 3")
      - ArrowUp/ArrowDown buttons (same pattern as `option-row.tsx`)
      - X/remove button
    - Keep the "Criar novo grupo" inline form toggle at the top (existing behavior)
  - **Update `link-option-groups-modal.tsx`**: Replace `toggleGroup` with `addGroup`, `removeGroup`, `reorderGroups` handlers
  - **Update `create-or-update-item-form.tsx`**: Replace `toggleOptionGroup` with `addOptionGroup`, `removeOptionGroup`, `reorderOptionGroups` and pass new props to `LinkOptionGroupsContent`
- **Testing Plan**:
  - Edit an item → go to "Grupos de Opções" tab → verify Combobox shows available groups → select one → verify it appears in ordered list with item names preview → reorder with arrows → verify order changes
  - Open link-option-groups-modal from item offerings table → verify same Combobox + ordered list UX works in the modal context

#### TASK-OPT-005: Unified save for item form and option group links

- **Status**: ✅ Completed
- **Type**: Bug Fix / UX Improvement
- **Complexity**: Medium
- **Dependencies**: TASK-011
- **Parallelizable With**: TASK-OPT-003, TASK-OPT-004
- **Files**:
  - Modify: `src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx`
- **Implementation Notes**:
  - Merge the two separate save buttons into one that saves both the item and option group links
  - In the form's `onSubmit` (update branch): after `updateItem()` succeeds, also call `linkOptionGroups()` if `showOptionGroupsTab` is true
  - Remove `optionGroupsFooterActions` variable entirely
  - Remove `handleSaveOptionGroups` function
  - Footer always renders `footerActions` regardless of active tab (remove the tab-switching ternary)
  - Add `isLinking` to the submit button disabled state: `disabled={!canSubmit || isLinking}`
  - Remove the standalone option groups save button from inside the tab content
- **Testing Plan**:
  - Edit an item → change name on "Item" tab → switch to "Grupos de Opções" tab → add/remove a group → click "Atualizar Item" → verify BOTH item changes AND option group links are saved
  - Verify creating a new item still works (option groups tab not shown for new items)

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

Bug Fixes (all parallelizable):
  TASK-OPT-003 (POS freeze fix) ◄── TASK-008
  TASK-OPT-004 (selection UX + item preview) ◄── TASK-011
  TASK-OPT-005 (unified save) ◄── TASK-011
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
| TASK-011     | Option groups tab in item form         | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Extracted LinkOptionGroupsContent, added tabs to edit form |
| TASK-012     | Inline create from link modal          | Core     | ✅ Completed | 2026-02-08 | 2026-02-08 | Inline OptionGroupForm in LinkOptionGroupsContent, auto-select new group |
| TASK-OPT-001 | Order history / receipt options        | Optional | ✅ Completed | 2026-02-08 | 2026-02-08 | Expandable rows in invoices page; no order receipt template exists yet |
| TASK-OPT-002 | Drag & drop reorder                   | Optional | ✅ Completed | 2026-02-08 | 2026-02-08 | Used up/down arrow buttons instead of DnD library |
| TASK-OPT-003 | Fix POS page freeze                   | Bug Fix  | ✅ Completed   | 2026-02-08 | 2026-02-08 | Strip optionGroups from cart, defer onConfirm after modal close |
| TASK-OPT-004 | Selection UX + item preview            | Bug Fix  | ✅ Completed   | 2026-02-08 | 2026-02-08 | Combobox + ordered list with item names preview, reorder arrows |
| TASK-OPT-005 | Unified save for item + option groups  | Bug Fix  | ✅ Completed   | 2026-02-08 | 2026-02-08 | Single save button now saves item + option group links |

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
