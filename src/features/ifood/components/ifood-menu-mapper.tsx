'use client'

import { updateIFoodPDVCodes } from '@/features/ifood/api'
import { useIFoodMenu } from '@/features/ifood/hooks/use-ifood-menu'
import type { ItemMatch, LocalMenuItem } from '@/features/ifood/types'
import { autoMatchItems } from '@/features/ifood/utils'
import { selectedStoreIdAtom } from '@/features/store/state'
import type { IFoodMenuItem } from '@/services/ifood/types'
import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import { Button } from '@/shared/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { useAtomValue } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { IFoodItemMappingRow } from './ifood-item-mapping-row'

export function IFoodMenuMapper() {
  const storeId = useAtomValue(selectedStoreIdAtom)
  const router = useRouter()
  const { ifoodMenu, localItems, isLoading, error } = useIFoodMenu(storeId!)

  // State: mapping from ifoodItemId to localItemOfferingId
  const [mappings, setMappings] = useState<Record<string, number>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Flatten iFood menu items
  const ifoodItems = useMemo(() => {
    if (!ifoodMenu) return []
    return ifoodMenu.categories.flatMap(category =>
      category.items.map(item => ({ ...item, categoryName: category.name }))
    )
  }, [ifoodMenu])

  // Convert local items to the format expected by matching logic
  const localMenuItems = useMemo((): LocalMenuItem[] => {
    if (!localItems) return []
    return localItems.map(item => ({
      id: item.id,
      name: item.name,
      externalCode: item.externalCode,
      ean: item.ean,
      categoryId: item.category.id,
      categoryName: item.category.name,
      price: Number(item.price),
      originalPrice: item.originalPrice ? Number(item.originalPrice) : null,
    }))
  }, [localItems])

  // Auto-match on mount
  useEffect(() => {
    if (ifoodItems.length > 0 && localMenuItems.length > 0) {
      const { matches } = autoMatchItems(localMenuItems, ifoodItems)

      const autoMappings: Record<string, number> = {}
      matches.forEach(match => {
        autoMappings[match.ifoodItemId] = match.localItemOfferingId
      })

      setMappings(autoMappings)
    }
  }, [ifoodItems, localMenuItems])

  const handleApplyAutoMatches = () => {
    const { matches } = autoMatchItems(localMenuItems, ifoodItems)

    const autoMappings: Record<string, number> = {}
    matches.forEach(match => {
      autoMappings[match.ifoodItemId] = match.localItemOfferingId
    })

    setMappings(autoMappings)
    toast.success(`${matches.length} itens correspondidos automaticamente`)
  }

  const handleUpdateMapping = (
    ifoodItemId: string,
    localItemId: number | null
  ) => {
    setMappings(prev => {
      const next = { ...prev }
      if (localItemId === null) {
        delete next[ifoodItemId]
      } else {
        next[ifoodItemId] = localItemId
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (!storeId) {
      toast.error('Selecione uma loja primeiro')
      return
    }

    // Build updates array
    const updates = Object.entries(mappings)
      .map(([ifoodItemId, localItemId]) => {
        const localItem = localMenuItems.find(item => item.id === localItemId)
        return {
          ifoodItemId,
          localItemId: localItem?.id,
          pdvCode: `CP__${localItem?.id ?? ''}`,
        }
      })
      .filter(update => update.localItemId !== null)

    if (updates.length === 0) {
      toast.error('Nenhum item mapeado')
      return
    }

    // Validate all have PDV codes
    // const missingPdv = updates.filter(u => !u.pdvCode)
    // if (missingPdv.length > 0) {
    //   toast.error(
    //     `${missingPdv.length} itens mapeados não possuem código PDV no sistema local`
    //   )
    //   return
    // }

    setIsSubmitting(true)
    try {
      const results = await updateIFoodPDVCodes(storeId, updates)

      const successful = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length

      if (failed === 0) {
        toast.success(
          `${successful} códigos PDV atualizados com sucesso no iFood!`
        )
        // Redirect back to integrations page
        setTimeout(() => {
          router.push('/settings/integracoes')
        }, 1500)
      } else {
        toast.warning(
          `${successful} códigos atualizados, ${failed} falharam. Verifique os erros.`
        )
      }
    } catch (error) {
      console.error('Error updating PDV codes:', error)
      toast.error('Erro ao atualizar códigos PDV no iFood')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!storeId) {
    return (
      <div className="p-4">
        <p className="text-gray-500">Selecione uma loja primeiro</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <PageHeaderBlock
          title="Sincronizar Cardápio iFood"
          subtitle="Erro ao carregar dados"
        />
        <p className="text-red-500">
          Erro: {error instanceof Error ? error.message : 'Erro desconhecido'}
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <PageHeaderBlock
          title="Sincronizar Cardápio iFood"
          subtitle="Carregando..."
        />
        <p className="text-gray-500">Carregando cardápios...</p>
      </div>
    )
  }

  const autoMatchCount = Object.keys(mappings).length
  const totalItems = ifoodItems.length
  console.log('ifoodItems', ifoodItems)

  return (
    <div className="p-4 space-y-4">
      <PageHeaderBlock
        title="Sincronizar Cardápio iFood"
        subtitle="Conecte itens do iFood com seu cardápio local"
      />

      <div className="flex items-center justify-between border-b pb-4">
        <div className="space-y-1">
          <p className="text-sm text-gray-600">
            {autoMatchCount} de {totalItems} itens mapeados
          </p>
          <p className="text-xs text-gray-500">
            Os códigos PDV dos itens locais serão enviados para o iFood
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleApplyAutoMatches}>
            Relacionar items automaticamente ({autoMatchCount})
          </Button>
          <Button
            variant="default"
            onClick={handleSubmit}
            disabled={isSubmitting || autoMatchCount === 0}
          >
            {isSubmitting
              ? 'Atualizando...'
              : `Atualizar ${autoMatchCount} Códigos PDV no iFood`}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Item iFood</TableHead>
              <TableHead className="w-[150px]">Código PDV Atual</TableHead>
              <TableHead className="w-[300px]">Item Local</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ifoodItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500">
                  Nenhum item encontrado no cardápio do iFood
                </TableCell>
              </TableRow>
            ) : (
              ifoodItems.map(ifoodItem => (
                <IFoodItemMappingRow
                  key={ifoodItem.id}
                  ifoodItem={ifoodItem}
                  localItems={localMenuItems}
                  selectedLocalItemId={mappings[ifoodItem.id] || null}
                  onUpdateMapping={handleUpdateMapping}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
