'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import {
  appendBenefitProgramsConfiguration,
  readBenefitProgramsConfiguration,
} from './db'
import {
  BenefitProgramsError,
  benefitProgramsInputSchema,
  type BenefitProgramsInput,
} from './policy'

export async function getBenefitProgramsConfiguration(storeId: number) {
  try {
    if (!Number.isInteger(storeId) || storeId < 1 || storeId > 2147483647)
      throw new Error('Invalid store')
    await validateUserPermissionsForStore(storeId, 'store.settings.manage')
  } catch {
    throw new Error(
      'Voce nao tem permissao para configurar os beneficios desta loja.'
    )
  }
  try {
    return await readBenefitProgramsConfiguration(storeId)
  } catch {
    throw new Error('Nao foi possivel carregar os beneficios. Tente novamente.')
  }
}

export async function saveBenefitProgramsConfiguration(
  storeId: number,
  input: BenefitProgramsInput
): Promise<
  { success: true; version: number } | { success: false; error: string }
> {
  let actorUserId: string
  try {
    if (!Number.isInteger(storeId) || storeId < 1 || storeId > 2147483647)
      throw new Error('Invalid store')
    const { user } = await validateUserPermissionsForStore(
      storeId,
      'store.settings.manage'
    )
    actorUserId = user.id
  } catch {
    return {
      success: false,
      error: 'Voce nao tem permissao para configurar os beneficios desta loja.',
    }
  }
  const parsed = benefitProgramsInputSchema.safeParse(input)
  if (!parsed.success)
    return {
      success: false,
      error: 'Configuracao invalida. Confira os campos dos programas.',
    }
  try {
    const version = await appendBenefitProgramsConfiguration(
      storeId,
      actorUserId,
      parsed.data
    )
    return { success: true, version }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof BenefitProgramsError
          ? error.message
          : 'Nao foi possivel salvar os beneficios. Tente novamente mais tarde.',
    }
  }
}
