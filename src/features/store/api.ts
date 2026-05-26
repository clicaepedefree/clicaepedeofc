'use server'
import {
  createAdditionalStoreWithAdminPermission,
  createFirstStoreWithAdminPermission,
  getPendingRecoveryStoresByEmail,
  getUserStorePermissions,
  insertStoreFile,
  isUserAdminOfAnyStore,
} from '@/features/store/db'
import {
  onboardingStoreSchema,
  type OnboardingStoreFormValues,
} from '@/features/store/form-validation/onboarding-store-schema'
import { finishUserOnboarding } from '@/features/user/api'
import { shouldBlockStoreOperations } from '@/features/user/user-policy'
import { requireAuth } from '@/services/auth'
import { currentUser } from '@clerk/nextjs/server'
import { db } from '@/services/db'
import { configurationsTable } from '@/services/db/schema/configurations'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import { InsertStoreFile } from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
import { coalesce } from '@/services/db/utils'
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { redirect, RedirectType } from 'next/navigation'
import { PermissionsError } from '../../shared/errors/permissions-error'
import { UserStoreRole } from './types'

type CreateStoreResult =
  | { success: true; storeId: number }
  | { success: false; error: string }

const USER_ALREADY_HAS_ADMIN_STORE_ERROR = 'USER_ALREADY_HAS_ADMIN_STORE'

const getStoreCreationErrorMessage = (error: unknown) => {
  if (
    error instanceof Error &&
    (error.message.includes('stores_subdomain_unique') ||
      error.message.includes('duplicate key'))
  ) {
    return 'Esse endereco publico ja esta em uso. Tente outro nome.'
  }

  return 'Nao foi possivel criar a loja agora. Tente novamente.'
}

export const getAvailableStores = async (): Promise<any[]> => {
  const user = await requireAuth()

  return await db
    .select(getTableColumns(storesTable))
    .from(storesTable)
    .innerJoin(
      userStorePermissionsTable,
      and(
        eq(userStorePermissionsTable.storeId, storesTable.id),
        eq(userStorePermissionsTable.userId, user.id),
        sql`${userStorePermissionsTable.revokedAt} is null`,
        eq(storesTable.status, 'active')
      )
    )
}

export const getRecoverableStoresForCurrentUserEmail = async () => {
  const clerkUser = await currentUser()

  if (!clerkUser) return []

  const primaryEmailAddress = clerkUser.emailAddresses.find(
    emailAddress => emailAddress.id === clerkUser.primaryEmailAddressId
  )

  if (!primaryEmailAddress) return []

  return await getPendingRecoveryStoresByEmail(primaryEmailAddress.emailAddress)
}

export const getStoreConfigurations = async (storeId: number): Promise<any[]> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await db
    .select({
      id: configurationsTable.id,
      category: configurationsTable.category,
      name: configurationsTable.name,
      type: configurationsTable.type,
      value: coalesce<string | null>(
        storeConfigurationsTable.value,
        configurationsTable.default
      ),
      createdAt: storeConfigurationsTable.createdAt,
      updatedAt: storeConfigurationsTable.updatedAt,
    })
    .from(configurationsTable)
    .leftJoin(
      storeConfigurationsTable,
      and(
        eq(configurationsTable.id, storeConfigurationsTable.configurationId),
        eq(storeConfigurationsTable.storeId, storeId)
      )
    )
}

export const updateStoreConfiguration = async (
  storeId: number,
  configurationId: number,
  value: string
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  await db
    .insert(storeConfigurationsTable)
    .values({ storeId, configurationId, value })
    .onConflictDoUpdate({
      target: [
        storeConfigurationsTable.storeId,
        storeConfigurationsTable.configurationId,
      ],
      set: { value },
    })
}

export const addStoreFile = async (values: InsertStoreFile) => {
  const { storePermissions: userStorePermissions } =
    await validateUserPermissionsForStore(values.storeId, 'admin')

  if (userStorePermissions.userId !== values.creatorId)
    throw new PermissionsError({
      type: 'USER_CONFLICT',
      message: 'Criador do arquivo não é o mesmo usuário',
    })

  return insertStoreFile(values)
}

export const validateAdminAccess = async () => {
  const user = await requireAuth()

  const isAdmin = await isUserAdminOfAnyStore(user.id)
  if (!isAdmin) redirect('/unauthorized', RedirectType.replace)
}

export const createFirstStoreForCurrentUser = async (
  values: OnboardingStoreFormValues
): Promise<CreateStoreResult> => {
  const user = await requireAuth()
  const parsedValues = onboardingStoreSchema.safeParse(values)

  if (!parsedValues.success) {
    return {
      success: false,
      error: parsedValues.error.issues[0]?.message ?? 'Dados invalidos',
    }
  }

  const alreadyHasStore = await isUserAdminOfAnyStore(user.id)

  if (alreadyHasStore) {
    const stores = await getAvailableStores()
    const firstStore = stores[0]

    return {
      success: true,
      storeId: firstStore.id,
    }
  }

  try {
    const store = await createFirstStoreWithAdminPermission({
      userId: user.id,
      store: parsedValues.data,
    })

    await finishUserOnboarding(user.id)

    return { success: true, storeId: store.id }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === USER_ALREADY_HAS_ADMIN_STORE_ERROR
    ) {
      const stores = await getAvailableStores()
      const firstStore = stores[0]

      if (firstStore) return { success: true, storeId: firstStore.id }

      return {
        success: false,
        error: 'Seu usuario ja administra uma loja.',
      }
    }

    console.error('[Onboarding] Failed to create first store:', error)

    return {
      success: false,
      error: getStoreCreationErrorMessage(error),
    }
  }
}

export const createAdditionalStoreForCurrentUser = async (
  values: OnboardingStoreFormValues
): Promise<CreateStoreResult> => {
  const user = await requireAuth()
  const parsedValues = onboardingStoreSchema.safeParse(values)

  if (!parsedValues.success) {
    return {
      success: false,
      error: parsedValues.error.issues[0]?.message ?? 'Dados invalidos',
    }
  }

  const alreadyHasStore = await isUserAdminOfAnyStore(user.id)

  if (!alreadyHasStore) {
    return {
      success: false,
      error: 'Complete o cadastro da primeira loja antes de adicionar outra.',
    }
  }

  try {
    const store = await createAdditionalStoreWithAdminPermission({
      userId: user.id,
      store: parsedValues.data,
    })

    return { success: true, storeId: store.id }
  } catch (error) {
    console.error('[Store] Failed to create additional store:', error)

    return {
      success: false,
      error: getStoreCreationErrorMessage(error),
    }
  }
}

export const validateUserPermissionsForStore = async (
  storeId: number,
  role: UserStoreRole
) => {
  const user = await requireAuth()

  const userPermissionsForStore = await getUserStorePermissions(
    user.id,
    storeId
  )

  if (
    userPermissionsForStore?.permission.role !== role ||
    shouldBlockStoreOperations(userPermissionsForStore.store.status)
  )
    throw new PermissionsError({
      type: 'FORBIDDEN',
      message: 'Usuário não possui permissão para executar operação na loja',
    })

  return { user, storePermissions: userPermissionsForStore.permission }
}
