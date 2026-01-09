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
