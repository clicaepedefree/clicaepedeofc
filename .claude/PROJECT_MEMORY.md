# **Project Architecture Memory: Clica Pedidos POS System**

## **Tech Stack Overview**

### **Core Technologies**
- **Framework**: Next.js 15 (App Router with Server Actions)
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **ORM**: Drizzle ORM v0.43
- **Authentication**: Clerk
- **File Upload**: UploadThing
- **UI Framework**: React 19 + Radix UI + Tailwind CSS v4

### **Key Libraries**
- **State Management**: Jotai (client state) + TanStack Query (server state)
- **Form Management**: TanStack Form
- **Validation**: Zod
- **Toasts**: Sonner
- **Charts**: Recharts
- **Date Handling**: Day.js
- **Currency**: Decimal.js + react-currency-input-field

---

## **1. Project Structure Pattern**

### **Feature-Based Modular Architecture**
```
src/
├── app/                          # Next.js App Router
│   ├── (admin)/                 # Route group with admin layout
│   ├── (user-auth-pages)/       # Route group for auth pages
│   └── api/                     # Minimal API routes (webhooks/uploads only)
├── features/                     # Self-contained feature modules
│   └── [feature-name]/
│       ├── api.ts               # Server Actions (mutations + business logic)
│       ├── db.ts                # Database queries (raw DB operations)
│       ├── types.ts             # TypeScript types
│       ├── cache-keys.ts        # React Query cache key factories
│       ├── state.ts             # Jotai atoms (client state)
│       ├── hooks/               # Custom React hooks (data fetching)
│       ├── components/          # Feature-specific UI components
│       └── form-validation/     # Zod schemas
├── services/                     # Shared infrastructure
│   ├── db/                      # Drizzle config + schema
│   ├── auth/                    # Clerk authentication utilities
│   └── files-manager/           # UploadThing configuration
└── shared/                       # Reusable UI components + utilities
```

**Key Convention**: Each feature is completely self-contained with its own data layer, business logic, state management, and UI components.

---

## **2. Data Flow Architecture: Backend → Frontend**

### **Three-Layer Backend Pattern**

#### **Layer 1: Schema Definition** (`/src/services/db/schema/`)
Drizzle table definitions with type inference:

```typescript
// Example: items.ts
export const itemsTable = pgTable('items', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull().references(() => storesTable.id),
  name: text('name').notNull(),
  // ...
})

// Auto-generated types
export type InsertItem = Omit<typeof itemsTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectItem = typeof itemsTable.$inferSelect
```

**Relations defined separately** in `schema/relations.ts`:
```typescript
export const itemsRelations = relations(itemsTable, ({ many, one }) => ({
  store: one(storesTable, { fields: [itemsTable.storeId], references: [storesTable.id] }),
  offerings: many(itemOfferingsTable),
}))
```

#### **Layer 2: Database Queries** (`[feature]/db.ts`)
Pure database operations with **transaction support**:

```typescript
// Transaction-aware type
type DbSession = typeof db | DbTransaction

export const createOrderOnDb = async ({
  newOrder,
  dbSession
}: {
  newOrder: InsertOrder
  dbSession: DbSession
}) => {
  const [createdOrder] = await dbSession
    .insert(ordersTable)
    .values(newOrder)
    .returning()

  return createdOrder
}
```

**Key Pattern**: All DB functions accept `dbSession` parameter, allowing them to run inside or outside transactions without code duplication.

#### **Layer 3: Server Actions** (`[feature]/api.ts`)
Business logic + authorization + orchestration:

```typescript
'use server'

export const createOrder = async (newOrder: NewOrder) => {
  // 1. Authorization check
  await validateUserPermissionsForStore(newOrder.storeId, 'admin')

  // 2. Transaction orchestration
  return await db.transaction(async tx => {
    // Get next ID
    const nextOrderDisplayId = await getNextOrderDisplayIdForStore({
      storeId: newOrder.storeId,
      dbSession: tx,
    })

    // Create order
    const createdOrder = await createOrderOnDb({
      newOrder: { ...newOrder, displayId: nextOrderDisplayId },
      dbSession: tx,
    })

    // Create related entities in parallel
    const [createdOrderItems, createdOrderPayments] = await Promise.all([
      Promise.all(newOrder.items.map(item => createOrderItemOnDb({ item, dbSession: tx }))),
      Promise.all(newOrder.payments.map(payment => createOrderPaymentOnDb({ payment, dbSession: tx }))),
    ])

    return { ...createdOrder, items: createdOrderItems, payments: createdOrderPayments }
  })
}
```

**Key Characteristics**:
- Marked with `'use server'`
- No REST API layer - direct server action calls
- Type-safe end-to-end (client can import server functions)
- Authorization at the top of every function
- Database transactions for complex operations

---

### **Advanced Database Patterns**

#### **1. Custom SQL Utilities**

**JSON Aggregation Helper** (`db/utils/jsonAgg.ts`):
```typescript
export function jsonAgg<T>(selection: T, { notNull = true } = {}) {
  if (notNull) {
    return sql`json_agg(${selection}) filter (where ${selection} is not null)`
  }
  return sql`json_agg(${selection})`
}
```

**Used for complex joins**:
```typescript
const result = await db
  .select({
    id: categoriesTable.id,
    items: jsonAgg(itemsTable, { notNull: true }).as('items'),
  })
  .from(categoriesTable)
  .leftJoin(itemsTable, eq(itemsTable.categoryId, categoriesTable.id))
  .groupBy(categoriesTable.id)
```

#### **2. Grouping Sets for Analytics** (`db/utils/groupingSets.ts`)
Used in POS analytics for multi-dimensional aggregations:

```typescript
const { groupingSetsSQL, groupingColumns } = groupingSets({
  paymentMethod: ordersTable.paymentMethod,
  salesChannel: ordersTable.salesChannel,
  type: ordersTable.type,
})

const analytics = await db
  .select({
    paymentMethod: groupingColumns.paymentMethod,
    salesChannel: groupingColumns.salesChannel,
    total: sum(ordersTable.totalPrice),
  })
  .from(ordersTable)
  .groupBy(groupingSetsSQL)
```

---

## **3. Frontend Data Flow Patterns**

### **State Management Strategy**

#### **Server State: TanStack Query**
Used for all data from the backend:

```typescript
// hooks/use-menu.tsx
export const useMenu = ({ menuName }: { menuName: string }) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom) // Global client state

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: menuCacheKey(selectedStoreId, menuName),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listMenuItems({ storeId: selectedStoreId }) // Server Action call
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  return {
    menuItems: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
  }
}
```

**Cache Key Convention** (`cache-keys.ts`):
```typescript
// Hierarchical structure: ['resource', id, 'subresource', subId]
export const categoriesCacheKey = (storeId: number | null) =>
  ['stores', storeId, 'categories']

export const menuCacheKey = (storeId: number | null, menuName?: string) =>
  menuName
    ? ['stores', storeId, 'menus', menuName]
    : ['stores', storeId, 'menus']

export const ordersCacheKey = (storeId: number | null) =>
  ['stores', storeId, 'orders']
```

**Pattern**: This allows surgical cache invalidation (e.g., invalidating all store-related data when switching stores).

#### **Client State: Jotai Atoms**
Used for UI state and local application state:

**1. Simple Global State**:
```typescript
// features/store/state.ts
export const selectedStoreIdAtom = atom<number | null>(null)
```

**2. Persistent State** (localStorage):
```typescript
// features/pos/state.ts
export const cartSessionAtom = atomWithStorage<CartSession | null>('posCartSession', null)
```

**3. Derived Atoms** (computed values):
```typescript
export const cartSessionItemsAtom = atom(get => get(cartSessionAtom)?.items)
export const cartSessionPaymentsAtom = atom(get => get(cartSessionAtom)?.payments)

export const cartSessionTotalAtom = atom(get => {
  const cartSession = get(cartSessionAtom)
  if (!cartSession?.items?.length) return 0
  return cartSession.items.reduce((total, item) =>
    total + Number(item.price) * item.quantity, 0)
})
```

**4. Write-Only Atoms** (actions):
```typescript
export const addItemToCartAtom = atom(
  null, // no read
  (get, set, newItem: CartItem) => {
    const cartSession = get(cartSessionAtom)
    if (!cartSession) {
      set(cartSessionAtom, { startedAt: new Date(), items: [newItem] })
      return
    }
    set(cartSessionAtom, {
      ...cartSession,
      items: [...cartSession.items, newItem],
    })
  }
)

export const clearCartAtom = atom(null, (get, set) => {
  set(cartSessionAtom, null)
})
```

**Usage Pattern in Hooks**:
```typescript
export const useCart = (salesChannel: SalesChannel) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const [cartSessionItems] = useAtom(cartSessionItemsAtom) // read
  const [, addItemToCart] = useAtom(addItemToCartAtom) // write only
  const [, clearCart] = useAtom(clearCartAtom) // write only

  // Mutations for server interaction
  const createOrderMutation = useMutation({
    mutationFn: async ({ counterId, counterName }) => {
      const newOrder = await createOrder({ /* cart data */ })
      return newOrder
    },
    onSuccess: () => {
      clearCart() // Clear local state after server success
      dispatchToast({ message: 'Order created', type: 'success' })
    },
  })

  return {
    cartSessionItems,
    addItemToCart,
    createOrder: createOrderMutation.mutateAsync
  }
}
```

---

### **Mutation Pattern with Optimistic Updates**

```typescript
// hooks/use-category.ts
export const useCategory = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const queryClient = useQueryClient()

  const deleteCategoryMutation = useMutation({
    mutationFn: async (category: CategoryWithImage) =>
      deleteCategory(category.id, category.storeId),

    // Cancel outgoing refetches to prevent race conditions
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },

    onError: (_, categoryToDelete) => {
      dispatchToast({
        message: `Error removing category '${categoryToDelete.name}'`,
        type: 'error',
      })
    },

    onSuccess: (_, categoryToDelete) => {
      dispatchToast({
        message: `Category '${categoryToDelete.name}' removed`,
        type: 'success',
      })
    },

    // Always refetch to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: categoriesCacheKey(selectedStoreId),
      })
    },
  })

  return {
    deleteCategory: deleteCategoryMutation.mutate,
    isDeleting: deleteCategoryMutation.isPending,
  }
}
```

**Key Pattern**:
1. Cancel queries on mutate
2. Show user feedback immediately
3. Invalidate cache on settled (success or error)

---

### **Query Client Configuration**

Global error handling and retry logic:

```typescript
// services/query-client.tsx
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: (failureCount, error) => {
          // Don't retry permission errors
          if (isPermissionsError(error)) return false
          return failureCount < 2
        },
      },
    },
    queryCache: new QueryCache({
      onError: error => {
        // Global error handling for permission errors
        if (!isPermissionsError(error)) return
        dispatchToast({
          message: `${error.message}`,
          type: 'error',
        })
      },
    }),
  })
}
```

---

## **4. Form Handling Pattern**

### **TanStack Form + Zod Validation**

**1. Schema Definition** (`form-validation/item-schema.ts`):
```typescript
import { z } from 'zod'

export const itemOfferingSchema = z.object({
  category: baseCategorySchema,
  price: z.string().nonempty('Price is required'),
  originalPrice: z.union([z.string().nonempty(), z.null()]),
  index: z.number().nullable(),
})

export const createItemSchema = z.object({
  name: z
    .string()
    .nonempty('Product name is required')
    .min(3, 'Product name must be at least 3 characters'),
  description: z.union([z.string(), z.null()]),
  isAvailable: z.boolean(),
  image: z.union([fileSchema, z.null()]),
  offerings: z
    .array(itemOfferingSchema)
    .nonempty('Must add price for at least one category'),
  inventory: z.union([z.number().nonnegative(), z.null()]),
})

export const updateItemSchema = createItemSchema.extend({
  id: z.number(),
})
```

**2. Form Component** (`create-or-update-item-form.tsx`):
```typescript
export const CreateOrUpdateItemForm = ({ item, category, onSuccess }) => {
  const isCreatingItem = !item
  const itemFormSchema = isCreatingItem ? createItemSchema : updateItemSchema
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const form = useForm({
    defaultValues: getDefaultValues(item, category),

    // Zod validation on submit
    validators: {
      onSubmit: itemFormSchema,
    },

    onSubmit: async ({ value }) => {
      if (!selectedStoreId) return

      if (isCreatingItem) {
        const newItem = await createItem({ /* ... */ })
        form.reset()
        onSuccess?.(newItem)
      } else {
        const updatedItem = await updateItem({ /* ... */ })
        form.reset()
        onSuccess?.(updatedItem)
      }
    },
  })

  return (
    <form onSubmit={e => {
      e.preventDefault()
      form.handleSubmit()
    }}>
      <form.Field name="name">
        {field => (
          <Label>
            Name
            <Input
              value={field.state.value}
              onChange={e => field.handleChange(e.target.value)}
              error={field.state.meta.errors[0]?.message}
            />
          </Label>
        )}
      </form.Field>

      {/* Dynamic validation with dependencies */}
      <form.Field
        name="offerings[0].originalPrice"
        validators={{
          // Listen to related field changes
          onChangeListenTo: ['offerings[0].price'],
          onChange: ({ value, fieldApi }) => {
            const price = fieldApi.form.getFieldValue('offerings[0].price')
            if (!value || !price) return

            if (getValueFromCurrencyString(value) <= getValueFromCurrencyString(price)) {
              return { message: 'Original price must be greater than current price' }
            }
          },
        }}
      >
        {field => (
          <CurrencyInput
            label="Original Price"
            value={field.state.value ?? undefined}
            onValueChange={value => field.handleChange(value ?? '')}
            error={field.state.meta.errors[0]?.message}
          />
        )}
      </form.Field>
    </form>
  )
}
```

**Key Patterns**:
- Schema-first validation with Zod
- Dynamic field-level validation with dependencies
- Type-safe form values
- Controlled components with error display

---

## **5. Authentication & Authorization Pattern**

### **Three-Layer Security**

#### **Layer 1: Middleware (Route Protection)**
```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/api/files(.*)',
  '/unauthorized(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect() // Clerk authentication
  }
  return NextResponse.next()
})
```

#### **Layer 2: User Authentication** (`services/auth/index.ts`)
```typescript
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const clerkUserAuth = await auth()

  if (!clerkUserAuth.userId) {
    throw new AuthError({ type: 'NOT_AUTHENTICATED' })
  }

  const authenticatedUser = await getUserByClerkId(clerkUserAuth.userId)
  if (!authenticatedUser) {
    throw new AuthError({ type: 'MISSING_ONBOARDING' })
  }

  return authenticatedUser
}

export const requireAuth = async () => {
  try {
    const user = await getAuthenticatedUser()
    return user
  } catch (error) {
    if (error instanceof AuthError) {
      error.type === 'MISSING_ONBOARDING' && redirect('/admin-onboarding')
      error.type === 'NOT_AUTHENTICATED' && redirect('/login')
    }
    throw error
  }
}
```

#### **Layer 3: Permission-Based Access Control**
```typescript
// features/store/api.ts
export const validateUserPermissionsForStore = async (
  storeId: number,
  role: UserStoreRole
) => {
  const user = await requireAuth()

  const userPermissionsForStore = await getUserStorePermissions(user.id, storeId)

  if (userPermissionsForStore?.role !== role) {
    throw new PermissionsError({
      type: 'FORBIDDEN',
      message: 'User does not have permission to perform operation on store',
    })
  }

  return { user, storePermissions: userPermissionsForStore }
}
```

**Usage in Every Server Action**:
```typescript
export const createCategory = async (newCategory: NewCategory) => {
  // First line: permission check
  await validateUserPermissionsForStore(newCategory.storeId, 'admin')

  // Then: business logic
  const categoryIndex = newCategory.index ?? (await getNextCategoryIndex(storeId))
  return await createCategoryOnDb({ ...newCategory, index: categoryIndex })
}
```

#### **Layer 4: Layout-Level Protection**
```typescript
// app/(admin)/layout.tsx
export default async function AdminLayout({ children }) {
  await validateAdminAccess() // Server-side check before rendering

  return (
    <AuthProviders clerkProviderProps={{ afterSignOutUrl: '/login' }}>
      {/* Layout content */}
    </AuthProviders>
  )
}
```

---

### **Custom Error Classes**

```typescript
// auth-errors.ts
export type AuthErrorType = 'NOT_AUTHENTICATED' | 'MISSING_ONBOARDING' | 'UNAUTHORIZED'

export class AuthError extends Error {
  type: AuthErrorType
  constructor({ type, message }: { type: AuthErrorType; message?: string }) {
    super(message ?? type)
    this.type = type
  }
}

// permissions-error.ts
export const permissionTypeToErrorCodeMapping = {
  FORBIDDEN: '401P:',
  USER_CONFLICT: '409P:',
}

export class PermissionsError extends Error {
  type: PermissionsErrorType
  constructor({ type, message }) {
    const permissionErrorCode = permissionTypeToErrorCodeMapping[type]
    super(`${permissionErrorCode} ${message}`)
    this.type = type
  }
}

// use-case-error.ts
export class UseCaseError extends Error {
  type: UseCaseErrorType
  constructor({ type, message }) {
    super(message ?? type)
    this.type = type
  }
}
```

**Used for business logic validation**:
```typescript
if (counter.currentSession?.status !== 'OPEN') {
  throw new UseCaseError({
    type: 'IMMUTABLE_STATE',
    message: 'Counter session cannot be modified when not open',
  })
}
```

---

## **6. UI Component Patterns**

### **Composition Pattern with Radix UI**

**Example: Block Components**
```typescript
// category-block.tsx
export const CategoryBlock = ({
  category,
  isFirst,
  isLast,
  onCategoryUpdated,
  onUpdateOpenedState,
}) => {
  const { deleteCategory, isDeleting, onUpdateCategory } = useCategory()
  const itemOfferings = category.items ?? []

  return (
    <AccordionItem
      value={category.id.toString()}
      className={cn(
        'border rounded-lg bg-white',
        isDeleting && 'border-destructive animate-pulse bg-destructive/5'
      )}
    >
      <div className="flex items-center justify-between px-4">
        <AccordionTrigger disabled={isDeleting}>
          <ImageWithPlaceholder image={category.image} alt={category.name} />
          <div className="flex flex-col items-start">
            <LargeText>{category.name}</LargeText>
            {category.description && (
              <SmallDescription>{category.description}</SmallDescription>
            )}
          </div>
        </AccordionTrigger>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" disabled={isFirst}>
            <MoveUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={isLast}>
            <MoveDown className="h-4 w-4" />
          </Button>
          <CategoryActions
            category={category}
            onCategoryUpdated={onUpdateCategory}
            onDelete={() => deleteCategory(category)}
            isDeleting={isDeleting}
          />
        </div>
      </div>

      <AccordionContent>
        <ItemOfferingsTable category={category} itemOfferings={itemOfferings} />
      </AccordionContent>
    </AccordionItem>
  )
}
```

**Pattern**: Compose complex UIs from Radix primitives + custom components with clear prop interfaces.

---

### **Page Header Pattern**

Uses Jotai atom for cross-component communication:

```typescript
// features/admin/hooks/use-admin-header-info.ts
export const adminPageHeaderInfoAtom = atom<AdminPageHeaderInfo | undefined>()

export const useAdminHeaderInfo = () => {
  const [headerInfo, setHeaderInfo] = useAtom(adminPageHeaderInfoAtom)
  const currentPagePathName = usePathname()

  const isCurrentPage = (pathNameToTest: string) =>
    currentPagePathName === pathNameToTest

  return { ...headerInfo, isCurrentPage, setHeaderInfo }
}
```

**Usage in Pages**:
```typescript
// app/(admin)/dashboard/page.tsx
export default function Page() {
  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Dashboard' }} />
      {/* Page content */}
    </>
  )
}
```

**AdminPageInfo component** sets the atom, which the layout's header reads.

---

## **7. Toast Notification Pattern**

Centralized toast utility with type mapping:

```typescript
// shared/lib/toast.ts
import { toast, ToastT } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

const toastTypeToDispatcherMapping = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
}

export const dispatchToast = ({
  message,
  type,
  position = 'top-center',
}: {
  message: string
  type: ToastType
  position?: ToastT['position']
}) => {
  const toastDispatcher = toastTypeToDispatcherMapping[type]

  toastDispatcher(message, {
    richColors: true,
    position,
    dismissible: true,
    closeButton: true,
  })
}
```

**Usage**:
```typescript
onSuccess: (_, categoryToDelete) => {
  dispatchToast({
    message: `Category '${categoryToDelete.name}' removed`,
    type: 'success',
  })
}
```

---

## **8. Type Safety Patterns**

### **Drizzle Type Inference**
```typescript
// Auto-infer insert/select types from table definitions
export type InsertItem = Omit<typeof itemsTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectItem = typeof itemsTable.$inferSelect
```

### **Transaction-Aware Types**
```typescript
// services/db/types.ts
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbSession = typeof db | DbTransaction
```

This allows functions to work with both regular DB and transactions:
```typescript
const createItem = async ({ item, dbSession }: {
  item: InsertItem
  dbSession: DbSession
}) => {
  // Works with db or tx
  return await dbSession.insert(itemsTable).values(item).returning()
}
```

### **Generic SQL Utilities with Type Inference**
```typescript
export function jsonAgg<T extends Table | Column | Subquery | AnyPgSelect>(
  selection: T,
  { notNull = true }: { notNull?: boolean } = {}
): SQL<
  T extends Table
    ? InferSelectModel<T>
    : T extends Column
      ? InferColumnDataType<T>[]
      : T extends Subquery
        ? InferRecordDataTypes<T['_']['selectedFields']>[]
        : never
>
```

TypeScript automatically infers the correct return type based on what you pass in.

---

## **9. File Upload Pattern**

Uses UploadThing with server-side validation:

```typescript
// services/files-manager/uploadthing.ts
export const fileRouter = {
  imageUploader: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      const user = await requireAuth() // Auth check
      return { userId: user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log('Upload complete for userId:', metadata.userId)
      console.log('file url', file.url)
      return { uploadedBy: metadata.userId }
    }),
}
```

**Client-side usage**:
```typescript
import { UploadButton } from '@/services/files-manager/uploadthing'

<UploadButton
  endpoint="imageUploader"
  onClientUploadComplete={(res) => {
    console.log('Files:', res)
  }}
/>
```

---

## **10. Data Fetching Flow Summary**

### **Read Operations (Queries)**
```
Page Component
  → Custom Hook (use-menu.tsx)
    → useQuery (TanStack Query)
      → Server Action (api.ts)
        → DB Query Function (db.ts)
          → Drizzle ORM
            → PostgreSQL
```

### **Write Operations (Mutations)**
```
User Action (Button Click)
  → Event Handler
    → Custom Hook (use-category.ts)
      → useMutation (TanStack Query)
        → Server Action (api.ts)
          ├─→ Authorization Check (validateUserPermissionsForStore)
          └─→ db.transaction
              → DB Query Functions (db.ts)
                → Drizzle ORM
                  → PostgreSQL
        → onSuccess: Cache Invalidation + Toast
```

### **Local State Updates**
```
User Action
  → Event Handler
    → Jotai Write Atom (addItemToCartAtom)
      → Updates Atom State
        → Derived Atoms Auto-Update (cartSessionTotalAtom)
          → UI Re-renders
```

---

## **11. Key Architectural Decisions Summary**

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **API Layer** | Next.js Server Actions | Type-safe client-server communication, no REST boilerplate |
| **Code Organization** | Feature-based modules | Self-contained features, easier to maintain and scale |
| **Database Access** | 3-layer pattern (Schema → DB → API) | Clear separation of concerns, transaction support |
| **Server State** | TanStack Query | Automatic caching, refetching, optimistic updates |
| **Client State** | Jotai | Minimal boilerplate, atomic updates, derived state |
| **Forms** | TanStack Form + Zod | Schema-first validation, type safety, dynamic validation |
| **Auth** | Multi-layer (Middleware → Auth → Permissions) | Defense in depth, granular control |
| **Types** | Drizzle inference + Zod | Single source of truth, full type safety |
| **Error Handling** | Custom error classes | Structured error handling, clear error types |
| **File Uploads** | UploadThing | Simple integration, server-side validation |

---

## **12. Common Patterns Checklist**

When adding a new feature:

1. **Create feature folder structure**:
   ```
   features/[feature]/
   ├── api.ts              # Server actions
   ├── db.ts               # DB queries
   ├── types.ts            # TypeScript types
   ├── cache-keys.ts       # Query cache keys
   ├── state.ts            # Jotai atoms (if needed)
   ├── hooks/              # Custom hooks
   ├── components/         # UI components
   └── form-validation/    # Zod schemas
   ```

2. **Define database schema** in `services/db/schema/`
   - Create table definition
   - Export insert/select types
   - Define relations in `relations.ts`

3. **Create DB query functions** in `db.ts`
   - Accept `dbSession` parameter
   - Return typed results
   - Keep pure (no business logic)

4. **Create server actions** in `api.ts`
   - Add `'use server'` directive
   - Validate permissions first
   - Use transactions for complex operations
   - Call DB query functions

5. **Define cache keys** in `cache-keys.ts`
   - Use hierarchical structure
   - Export factory functions

6. **Create custom hooks** in `hooks/`
   - Use `useQuery` for reads
   - Use `useMutation` for writes
   - Handle cache invalidation in `onSettled`
   - Integrate with Jotai atoms if needed

7. **Create Zod schemas** in `form-validation/`
   - Define validation rules
   - Export typed schemas
   - Reuse common schemas

8. **Build UI components** in `components/`
   - Use Radix UI primitives
   - Compose with custom shared components
   - Keep components focused and reusable

---

This architecture provides excellent developer experience with full type safety, clear separation of concerns, and scalable patterns for a multi-tenant POS system.

---

## **13. Third-Party Integrations Pattern: iFood Integration**

### **Overview**

The iFood integration demonstrates the architecture for third-party API integrations with OAuth 2.0, following strict service/feature separation patterns.

**Key Requirements**:
- OAuth 2.0 distributed app authentication
- Pull-only sync (read menu from iFood, update PDV codes back)
- One-time onboarding with ephemeral mappings (no persistent mapping table)
- Conservative auto-matching by externalCode only
- Encrypted token storage with AES-256-GCM

---

### **Architecture: Service vs Features Layer**

#### **CRITICAL PATTERN**: Service/Feature Separation

**Services Layer** (`/src/services/ifood/`):
- **ONLY** handles API communication and parsing
- **NO** business logic whatsoever
- Converts raw API responses to normalized types
- Pure API client pattern

**Features Layer** (`/src/features/ifood/`):
- **ALL** business logic lives here
- Consumes services but doesn't implement API calls
- Matching rules, validation, data transformations
- Database operations and server actions

This separation is crucial for maintainability and testability.

---

### **Service Layer Implementation**

#### **1. Service Client** (`/src/services/ifood/index.ts`)

```typescript
export class IFoodService {
  private accessToken: string

  constructor(config: { accessToken: string }) {
    this.accessToken = config.accessToken
  }

  // Static methods for OAuth (no instance needed)
  static async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const response = await fetch(`${IFOOD_API_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: IFOOD_CLIENT_ID,
        client_secret: IFOOD_CLIENT_SECRET,
        redirect_uri: IFOOD_REDIRECT_URI,
      }),
    })

    if (!response.ok) throw new Error('Failed to exchange code for tokens')
    return response.json()
  }

  static async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    // Similar pattern for token refresh
  }

  // Instance methods for API calls
  async getMerchantMenu(merchantId: string): Promise<IFoodMenu> {
    const response = await fetch(
      `${IFOOD_API_BASE_URL}/merchant/${merchantId}/catalog`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) throw new Error('Failed to fetch menu')

    const rawData = await response.json()

    // Parse and normalize to common format
    return this.normalizeCatalogResponse(rawData)
  }

  async updateItemExternalCode(
    merchantId: string,
    itemId: string,
    externalCode: string
  ): Promise<void> {
    const response = await fetch(
      `${IFOOD_API_BASE_URL}/merchant/${merchantId}/items/${itemId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ externalCode }),
      }
    )

    if (!response.ok) throw new Error('Failed to update item')
  }

  // ONLY parsing logic, NO business rules
  private normalizeCatalogResponse(rawData: any): IFoodMenu {
    return {
      categories: rawData.categories.map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        items: cat.items.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          externalCode: item.externalCode,
          ean: item.ean,
          price: item.price,
        })),
      })),
    }
  }
}
```

**Key Principles**:
- Static methods for OAuth (no token needed yet)
- Instance methods for authenticated API calls
- Automatic token refresh before API calls
- Normalized return types (IFoodMenu, IFoodMenuItem)
- Raw API types kept internal

#### **2. Type Definitions** (`/src/services/ifood/types.ts`)

```typescript
// Normalized types (public API)
export interface IFoodMenu {
  categories: IFoodCategory[]
}

export interface IFoodCategory {
  id: string
  name: string
  items: IFoodMenuItem[]
}

export interface IFoodMenuItem {
  id: string
  name: string
  description: string | null
  externalCode: string | null  // PDV code
  ean: string | null
  price: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

// Raw API response types (internal only)
interface IFoodCatalogResponse {
  // Raw structure from iFood API
}
```

---

### **Features Layer Implementation**

#### **1. Database Operations** (`/src/features/ifood/db.ts`)

```typescript
import { encrypt, decrypt } from '@/lib/encryption'

export const createIFoodIntegration = async ({
  storeId,
  merchantId,
  accessToken,
  refreshToken,
  tokenExpiresAt,
}: {
  storeId: number
  merchantId: string
  accessToken: string
  refreshToken: string
  tokenExpiresAt: Date
}) => {
  const [integration] = await db
    .insert(ifoodIntegrationsTable)
    .values({
      storeId,
      merchantId,
      accessToken: encrypt(accessToken),      // Encrypted
      refreshToken: encrypt(refreshToken),    // Encrypted
      tokenExpiresAt,
      status: 'connected',
    })
    .returning()

  return integration
}

export const getIFoodIntegration = async (storeId: number) => {
  const integration = await db.query.ifoodIntegrationsTable.findFirst({
    where: eq(ifoodIntegrationsTable.storeId, storeId),
  })

  if (!integration) return null

  // Decrypt tokens before returning
  return {
    ...integration,
    accessToken: decrypt(integration.accessToken),
    refreshToken: decrypt(integration.refreshToken),
  }
}

export const updateIFoodIntegration = async ({
  storeId,
  updates,
}: {
  storeId: number
  updates: Partial<{
    accessToken: string
    refreshToken: string
    tokenExpiresAt: Date
    status: 'connected' | 'disconnected' | 'error'
    lastSyncAt: Date
    syncErrors: any
  }>
}) => {
  // Encrypt tokens if provided
  const encryptedUpdates = {
    ...updates,
    ...(updates.accessToken && { accessToken: encrypt(updates.accessToken) }),
    ...(updates.refreshToken && { refreshToken: encrypt(updates.refreshToken) }),
  }

  const [updated] = await db
    .update(ifoodIntegrationsTable)
    .set(encryptedUpdates)
    .where(eq(ifoodIntegrationsTable.storeId, storeId))
    .returning()

  return updated
}

export const deleteIFoodIntegration = async (storeId: number) => {
  await db
    .delete(ifoodIntegrationsTable)
    .where(eq(ifoodIntegrationsTable.storeId, storeId))
}
```

**Key Patterns**:
- Encryption/decryption at DB boundary
- Simple CRUD operations
- No business logic
- Transaction-compatible (could add dbSession parameter)

#### **2. Business Logic & Matching** (`/src/features/ifood/utils.ts`)

```typescript
export interface LocalMenuItem {
  id: number
  name: string
  ean: string | null
  pdvCode: string | null  // externalCode in our system
}

export interface ItemMatch {
  ifoodItemId: string
  localItemId: number
  matchType: 'auto' | 'manual'
  confidence: 'high' | 'medium' | 'low'
}

export interface SuggestedMatch {
  localItem: LocalMenuItem
  reason: string
  confidence: 'medium' | 'low'
}

/**
 * Conservative auto-matching: ONLY by externalCode
 * User explicitly requested NOT to auto-match by EAN due to duplicates
 */
export function autoMatchItems(
  localItems: LocalMenuItem[],
  ifoodItems: IFoodMenuItem[]
): {
  matches: ItemMatch[]
  unmatched: IFoodMenuItem[]
} {
  const matches: ItemMatch[] = []
  const unmatched: IFoodMenuItem[] = []

  for (const ifoodItem of ifoodItems) {
    // ONLY match if both have externalCode AND they match exactly
    if (ifoodItem.externalCode) {
      const localMatch = localItems.find(
        local => local.pdvCode === ifoodItem.externalCode
      )

      if (localMatch) {
        matches.push({
          ifoodItemId: ifoodItem.id,
          localItemId: localMatch.id,
          matchType: 'auto',
          confidence: 'high',
        })
        continue
      }
    }

    // If no match found, add to unmatched
    unmatched.push(ifoodItem)
  }

  return { matches, unmatched }
}

/**
 * Find suggested matches for manual review
 * Uses EAN (if unique) and name similarity
 */
export function findSuggestedMatches(
  ifoodItem: IFoodMenuItem,
  localItems: LocalMenuItem[],
  limit = 3
): SuggestedMatch[] {
  const suggestions: SuggestedMatch[] = []

  // 1. EAN match (only if unique in local items)
  if (ifoodItem.ean) {
    const eanMatches = localItems.filter(local => local.ean === ifoodItem.ean)

    if (eanMatches.length === 1) {
      // Only suggest if EAN is unique
      suggestions.push({
        localItem: eanMatches[0],
        reason: 'Same EAN code',
        confidence: 'medium',
      })
    }
  }

  // 2. Name similarity (Levenshtein/word-based)
  const nameSimilarities = localItems
    .map(local => ({
      local,
      similarity: stringSimilarity(
        ifoodItem.name.toLowerCase(),
        local.name.toLowerCase()
      ),
    }))
    .filter(({ similarity }) => similarity > 0.6)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  for (const { local, similarity } of nameSimilarities) {
    if (!suggestions.find(s => s.localItem.id === local.id)) {
      suggestions.push({
        localItem: local,
        reason: `Similar name (${Math.round(similarity * 100)}% match)`,
        confidence: similarity > 0.8 ? 'medium' : 'low',
      })
    }
  }

  return suggestions.slice(0, limit)
}

/**
 * Word-based string similarity
 * More robust than Levenshtein for product names
 */
function stringSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/).filter(w => w.length > 2)
  const words2 = str2.split(/\s+/).filter(w => w.length > 2)

  if (words1.length === 0 || words2.length === 0) return 0

  const commonWords = words1.filter(w1 =>
    words2.some(w2 => w2.includes(w1) || w1.includes(w2))
  ).length

  return commonWords / Math.max(words1.length, words2.length)
}
```

**Critical Design Decisions**:

1. **Conservative Auto-Matching**: Only externalCode (PDV code)
   - User reported iFood has duplicate EANs across different items
   - Auto-matching by EAN would cause confusion and errors
   - Better to be conservative and require manual confirmation

2. **Suggestions, Not Auto-Matches**: EAN and name similarity
   - Show as suggestions requiring manual approval
   - EAN only suggested if unique in local items
   - Name similarity uses word-based matching (more robust)

3. **No Persistent Mappings**: Ephemeral state only
   - User only needs one-time onboarding flow
   - After PDV codes are synced, matching is automatic (by externalCode)
   - No need for mapping table in database

#### **3. Server Actions** (`/src/features/ifood/api.ts`)

```typescript
'use server'

import { IFoodService } from '@/services/ifood'

export async function connectIFoodAccount(
  storeId: number,
  authCode: string
) {
  // 1. Permission check
  await validateUserPermissionsForStore(storeId, 'admin')

  // 2. Exchange code for tokens (static service method)
  const tokens = await IFoodService.exchangeCodeForTokens(authCode)

  // 3. Get merchant ID from iFood
  const service = new IFoodService({ accessToken: tokens.access_token })
  const merchantId = await service.getMerchantId()

  // 4. Store encrypted tokens in database
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  await createIFoodIntegration({
    storeId,
    merchantId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt,
  })

  return { success: true }
}

export async function fetchIFoodMenu(storeId: number) {
  // 1. Permission check
  await validateUserPermissionsForStore(storeId, 'admin')

  // 2. Get integration with decrypted tokens
  const integration = await getIFoodIntegration(storeId)
  if (!integration) throw new Error('iFood not connected')

  // 3. Check if token needs refresh
  if (new Date() >= integration.tokenExpiresAt) {
    const newTokens = await IFoodService.refreshAccessToken(
      integration.refreshToken
    )

    await updateIFoodIntegration({
      storeId,
      updates: {
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      },
    })

    integration.accessToken = newTokens.access_token
  }

  // 4. Fetch menu from iFood (service layer)
  const service = new IFoodService({ accessToken: integration.accessToken })
  const ifoodMenu = await service.getMerchantMenu(integration.merchantId)

  // 5. Fetch local menu items (for matching)
  const localItems = await listMenuItems({ storeId })

  return {
    ifoodMenu,
    localItems,
  }
}

export async function updateIFoodPDVCodes(
  storeId: number,
  updates: Array<{ ifoodItemId: string; pdvCode: string }>
) {
  // 1. Permission check
  await validateUserPermissionsForStore(storeId, 'admin')

  // 2. Get integration
  const integration = await getIFoodIntegration(storeId)
  if (!integration) throw new Error('iFood not connected')

  // 3. Ensure fresh token
  if (new Date() >= integration.tokenExpiresAt) {
    const newTokens = await IFoodService.refreshAccessToken(
      integration.refreshToken
    )
    await updateIFoodIntegration({
      storeId,
      updates: {
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      },
    })
    integration.accessToken = newTokens.access_token
  }

  // 4. Update PDV codes in iFood (service layer)
  const service = new IFoodService({ accessToken: integration.accessToken })

  const results = await Promise.allSettled(
    updates.map(({ ifoodItemId, pdvCode }) =>
      service.updateItemExternalCode(
        integration.merchantId,
        ifoodItemId,
        pdvCode
      )
    )
  )

  // 5. Track errors
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r, i) => ({ itemId: updates[i].ifoodItemId, error: r.reason }))

  if (errors.length > 0) {
    await updateIFoodIntegration({
      storeId,
      updates: {
        syncErrors: errors,
        lastSyncAt: new Date(),
      },
    })
  } else {
    await updateIFoodIntegration({
      storeId,
      updates: {
        lastSyncAt: new Date(),
        syncErrors: null,
      },
    })
  }

  return {
    success: errors.length === 0,
    updated: results.filter(r => r.status === 'fulfilled').length,
    failed: errors.length,
    errors,
  }
}

export async function disconnectIFoodAccount(storeId: number) {
  await validateUserPermissionsForStore(storeId, 'admin')
  await deleteIFoodIntegration(storeId)
  return { success: true }
}
```

**Key Patterns**:
- Permission validation first
- Token refresh logic before API calls
- Service layer for API, features layer for orchestration
- Error tracking in database
- Type-safe end-to-end

---

### **Database Schema**

#### **iFood Integrations Table** (`/src/services/db/schema/ifood-integrations.ts`)

```typescript
export const ifoodIntegrationsTable = pgTable('ifood_integrations', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .unique()  // One integration per store
    .notNull()
    .references(() => storesTable.id),
  merchantId: text('merchant_id').notNull(),

  // Encrypted tokens
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at').notNull(),

  // Status tracking
  status: text('status', {
    enum: ['connected', 'disconnected', 'error'],
  })
    .notNull()
    .default('connected'),
  lastSyncAt: timestamp('last_sync_at'),
  syncErrors: jsonb('sync_errors'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const ifoodIntegrationsRelations = relations(
  ifoodIntegrationsTable,
  ({ one }) => ({
    store: one(storesTable, {
      fields: [ifoodIntegrationsTable.storeId],
      references: [storesTable.id],
    }),
  })
)
```

**Key Decisions**:
- Unique constraint on storeId (one integration per store)
- Encrypted tokens (accessToken and refreshToken)
- Status enum for connection state
- syncErrors as JSONB for flexible error storage
- No mapping table (ephemeral mappings only)

---

### **Token Encryption**

#### **Encryption Utilities** (`/src/lib/encryption.ts`)

```typescript
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16
const KEY_LENGTH = 32

function getKey(): Buffer {
  const key = process.env.IFOOD_TOKEN_ENCRYPTION_KEY
  if (!key) {
    throw new Error('IFOOD_TOKEN_ENCRYPTION_KEY is not set')
  }
  return Buffer.from(key, 'hex')
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = crypto.pbkdf2Sync(getKey(), salt, 100000, KEY_LENGTH, 'sha512')

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const tag = cipher.getAuthTag()

  // Format: iv:salt:tag:encrypted
  return [
    iv.toString('hex'),
    salt.toString('hex'),
    tag.toString('hex'),
    encrypted,
  ].join(':')
}

export function decrypt(encryptedText: string): string {
  const [ivHex, saltHex, tagHex, encrypted] = encryptedText.split(':')

  const iv = Buffer.from(ivHex, 'hex')
  const salt = Buffer.from(saltHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const key = crypto.pbkdf2Sync(getKey(), salt, 100000, KEY_LENGTH, 'sha512')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
```

**Security Features**:
- AES-256-GCM (authenticated encryption)
- Random IV per encryption
- PBKDF2 key derivation with salt
- Authentication tag for tampering detection
- Environment variable for encryption key

**Key Generation**:
```bash
openssl rand -hex 32
```

---

### **Frontend Components**

#### **1. Connection Card** (`/src/features/ifood/components/ifood-connection-card.tsx`)

```typescript
'use client'

import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useIFoodConnection } from '../hooks/use-ifood-connection'

export const IFoodConnectionCard = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { integration, isLoading, disconnect } = useIFoodConnection()

  const handleConnect = () => {
    if (!selectedStoreId) return

    const state = crypto.randomUUID() // CSRF protection
    sessionStorage.setItem('ifood_oauth_state', state)

    const authUrl = new URL('https://merchant-api.ifood.com.br/oauth/authorize')
    authUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_IFOOD_CLIENT_ID!)
    authUrl.searchParams.set('redirect_uri', process.env.NEXT_PUBLIC_IFOOD_REDIRECT_URI!)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('state', state)

    window.location.href = authUrl.toString()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IFoodIcon />
          <div>
            <CardTitle>iFood</CardTitle>
            <CardDescription>
              Connect your iFood account to sync menu items
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {integration ? (
          <div className="space-y-3">
            <Badge variant="success">Connected</Badge>
            <div className="text-sm text-muted-foreground">
              Merchant ID: {integration.merchantId}
            </div>
            {integration.lastSyncAt && (
              <div className="text-sm text-muted-foreground">
                Last sync: {formatDate(integration.lastSyncAt)}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => router.push('/settings/integracoes/ifood/mapper')}
              >
                Map Menu Items
              </Button>
              <Button
                variant="destructive"
                onClick={disconnect}
                disabled={isLoading}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={handleConnect} disabled={isLoading}>
            Connect iFood
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

**Key Features**:
- OAuth flow with state parameter (CSRF protection)
- State stored in sessionStorage for validation
- Connection status display
- Direct link to mapper page

#### **2. Menu Mapper** (`/src/features/ifood/components/ifood-menu-mapper.tsx`)

```typescript
'use client'

export const IFoodMenuMapper = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { ifoodMenu, localItems, isLoading } = useIFoodMenu()
  const [mappings, setMappings] = useState<Map<string, number>>(new Map())

  const handleAutoMatch = () => {
    if (!ifoodMenu || !localItems) return

    const allItems = ifoodMenu.categories.flatMap(c => c.items)
    const { matches } = autoMatchItems(localItems, allItems)

    const newMappings = new Map(mappings)
    for (const match of matches) {
      newMappings.set(match.ifoodItemId, match.localItemId)
    }
    setMappings(newMappings)

    dispatchToast({
      message: `Auto-matched ${matches.length} items by PDV code`,
      type: 'success',
    })
  }

  const handleSubmit = async () => {
    if (!selectedStoreId) return

    const updates = Array.from(mappings.entries()).map(
      ([ifoodItemId, localItemId]) => {
        const localItem = localItems?.find(i => i.id === localItemId)
        return {
          ifoodItemId,
          pdvCode: localItem!.pdvCode!,
        }
      }
    )

    const result = await updateIFoodPDVCodes(selectedStoreId, updates)

    if (result.success) {
      dispatchToast({
        message: `Updated ${result.updated} PDV codes in iFood`,
        type: 'success',
      })
      setMappings(new Map()) // Clear ephemeral state
    } else {
      dispatchToast({
        message: `Failed to update ${result.failed} items`,
        type: 'error',
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2>Map iFood Menu Items</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAutoMatch}>
            Auto-Match by PDV Code
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mappings.size === 0 || isLoading}
          >
            Update {mappings.size} PDV Codes
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>iFood Item</TableHead>
            <TableHead>Current PDV Code</TableHead>
            <TableHead>Map to Local Item</TableHead>
            <TableHead>Suggestions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ifoodMenu?.categories.map(category =>
            category.items.map(item => (
              <IFoodItemMappingRow
                key={item.id}
                ifoodItem={item}
                localItems={localItems ?? []}
                currentMapping={mappings.get(item.id)}
                onMappingChange={(localItemId) => {
                  const newMappings = new Map(mappings)
                  if (localItemId) {
                    newMappings.set(item.id, localItemId)
                  } else {
                    newMappings.delete(item.id)
                  }
                  setMappings(newMappings)
                }}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

**Key Features**:
- Ephemeral React state (Map<ifoodItemId, localItemId>)
- Auto-match button (conservative matching)
- Manual mapping with suggestions
- Batch update to iFood
- Clear state after successful sync

#### **3. Item Mapping Row** (`/src/features/ifood/components/ifood-item-mapping-row.tsx`)

```typescript
export const IFoodItemMappingRow = ({
  ifoodItem,
  localItems,
  currentMapping,
  onMappingChange,
}) => {
  const suggestions = findSuggestedMatches(ifoodItem, localItems, 3)
  const hasPDVCode = !!ifoodItem.externalCode

  return (
    <TableRow>
      <TableCell>
        <div>
          <div className="font-medium">{ifoodItem.name}</div>
          <div className="text-sm text-muted-foreground">
            {ifoodItem.description}
          </div>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          {hasPDVCode ? (
            <Badge variant="default">{ifoodItem.externalCode}</Badge>
          ) : (
            <Badge variant="destructive">No PDV Code</Badge>
          )}
        </div>
      </TableCell>

      <TableCell>
        <Combobox
          items={localItems}
          value={currentMapping}
          onChange={onMappingChange}
          placeholder="Select local item..."
          renderItem={(item) => (
            <div>
              <div>{item.name}</div>
              {item.pdvCode && (
                <div className="text-sm text-muted-foreground">
                  PDV: {item.pdvCode}
                </div>
              )}
            </div>
          )}
        />
      </TableCell>

      <TableCell>
        {suggestions.length > 0 ? (
          <div className="space-y-1">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.localItem.id}
                variant="ghost"
                size="sm"
                onClick={() => onMappingChange(suggestion.localItem.id)}
              >
                {suggestion.localItem.name}
                <Badge variant="outline" className="ml-2">
                  {suggestion.reason}
                </Badge>
              </Button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No suggestions</span>
        )}
      </TableCell>
    </TableRow>
  )
}
```

**Key Features**:
- Warning for items without PDV codes
- Combobox for manual selection
- Suggested matches with confidence indicators
- One-click suggestion application

---

### **OAuth Callback Route**

```typescript
// app/api/integrations/ifood/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectIFoodAccount } from '@/features/ifood/api'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/settings/integracoes?error=${encodeURIComponent(error)}`,
        request.url
      )
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/integracoes?error=invalid_request', request.url)
    )
  }

  // Validate state (CSRF protection)
  // Note: In production, validate against stored state

  try {
    // Get selected store from session/cookie
    const storeId = getSelectedStoreIdFromSession(request)

    if (!storeId) {
      throw new Error('No store selected')
    }

    // Exchange code for tokens and store
    await connectIFoodAccount(storeId, code)

    return NextResponse.redirect(
      new URL('/settings/integracoes?success=connected', request.url)
    )
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(
        `/settings/integracoes?error=${encodeURIComponent('connection_failed')}`,
        request.url
      )
    )
  }
}
```

**Security Features**:
- State parameter validation (CSRF protection)
- Error handling and user feedback
- Secure token exchange
- Redirect to settings page with status

---

### **Environment Variables**

Required in `.env.local`:

```bash
# iFood OAuth Credentials
NEXT_PUBLIC_IFOOD_CLIENT_ID=your_client_id
IFOOD_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_IFOOD_REDIRECT_URI=http://localhost:3000/api/integrations/ifood/callback

# iFood API
IFOOD_API_BASE_URL=https://merchant-api.ifood.com.br

# Token Encryption
# Generate with: openssl rand -hex 32
IFOOD_TOKEN_ENCRYPTION_KEY=your_64_char_hex_key
```

---

### **Key Architectural Lessons**

#### **1. Service/Feature Separation is Critical**

**DON'T**:
```typescript
// ❌ Business logic in service layer
class IFoodService {
  async matchMenuItems(localItems, ifoodItems) {
    // Matching logic here - WRONG LAYER!
  }
}
```

**DO**:
```typescript
// ✅ Service only handles API
class IFoodService {
  async getMerchantMenu() {
    // Only API call and parsing
  }
}

// ✅ Features layer handles business logic
// features/ifood/utils.ts
export function autoMatchItems(localItems, ifoodItems) {
  // Business logic here
}
```

#### **2. Conservative Matching Prevents Errors**

When user reported "iFood might have multiple items using the same EAN", we changed from:

**Before**:
```typescript
// ❌ Auto-match by EAN (causes false positives)
if (ifoodItem.ean && localItem.ean === ifoodItem.ean) {
  // Auto-match
}
```

**After**:
```typescript
// ✅ Only auto-match by unique identifier
if (ifoodItem.externalCode && localItem.pdvCode === ifoodItem.externalCode) {
  // Auto-match (1:1 guaranteed)
}

// ✅ EAN as suggestion only (requires manual approval)
const suggestions = findSuggestedMatches(ifoodItem, localItems)
```

#### **3. Ephemeral State for One-Time Operations**

**DON'T**:
```typescript
// ❌ Persistent mapping table (unnecessary overhead)
const ifoodItemMappingsTable = pgTable('ifood_item_mappings', {
  ifoodItemId: text('ifood_item_id'),
  localItemId: integer('local_item_id'),
  // ...
})
```

**DO**:
```typescript
// ✅ Ephemeral React state for onboarding
const [mappings, setMappings] = useState<Map<string, number>>(new Map())

// After sync completes, mappings are discarded
// Future matching is automatic via externalCode
```

#### **4. Token Management Best Practices**

- **Encryption at rest**: AES-256-GCM with authentication
- **Refresh before expiry**: Check tokenExpiresAt before API calls
- **Automatic refresh**: Transparent to user
- **Secure storage**: Environment variable for encryption key

#### **5. OAuth Security**

- State parameter for CSRF protection
- Validate state on callback
- Store tokens encrypted immediately
- Redirect with status (success/error)

---

### **Integration Checklist for Future Third-Party APIs**

When adding new integrations, follow this pattern:

**1. Service Layer** (`/src/services/[integration]/`):
- [ ] API client class with typed methods
- [ ] OAuth/authentication handling (static methods)
- [ ] Normalized response types (public)
- [ ] Raw API types (internal only)
- [ ] NO business logic

**2. Features Layer** (`/src/features/[integration]/`):
- [ ] Database operations (db.ts)
- [ ] Business logic utilities (utils.ts)
- [ ] Server actions (api.ts) with permission checks
- [ ] Feature-specific types (types.ts)
- [ ] Custom hooks for UI (hooks/)
- [ ] UI components (components/)

**3. Database**:
- [ ] Integration table with encrypted credentials
- [ ] Status tracking fields
- [ ] Error tracking (JSONB)
- [ ] Relations to stores/users

**4. Security**:
- [ ] Token encryption utilities
- [ ] OAuth state validation
- [ ] Permission checks in all server actions
- [ ] Environment variables for secrets

**5. UI Flow**:
- [ ] Connection card with OAuth initiation
- [ ] OAuth callback route
- [ ] Status display (connected/disconnected/error)
- [ ] Main functionality page (mapper, sync, etc.)
- [ ] Error handling and user feedback

---

### **Tools and Commands**

#### **Database Migrations** (using Bun):
```bash
# Generate migration
bunx --bun drizzle-kit generate

# Run migration
bunx --bun drizzle-kit migrate

# Studio
bunx --bun drizzle-kit studio
```

#### **Development**:
```bash
# Dev server
bun dev

# Build
bun run build

# Type check
bun run type-check
```

#### **Generate Encryption Key**:
```bash
openssl rand -hex 32
```

---

This integration demonstrates the complete pattern for adding third-party API integrations to the Clica Pedidos system, with emphasis on clean architecture, security, and maintainability.
