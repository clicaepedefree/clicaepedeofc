'use client'

import type { LocalMenuItem } from '@/features/ifood/types'
import { findSuggestedMatches } from '@/features/ifood/utils'
import type { IFoodMenuItem } from '@/services/ifood/types'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Combobox } from '@/shared/combobox'
import { TableCell, TableRow } from '@/shared/table'
import { useMemo } from 'react'

interface IFoodItemMappingRowProps {
  ifoodItem: IFoodMenuItem & { categoryName: string }
  localItems: LocalMenuItem[]
  selectedLocalItemId: number | null
  onUpdateMapping: (ifoodItemId: string, localItemId: number | null) => void
}

export function IFoodItemMappingRow({
  ifoodItem,
  localItems,
  selectedLocalItemId,
  onUpdateMapping,
}: IFoodItemMappingRowProps) {
  // Find suggested matches
  const suggestions = useMemo(
    () => findSuggestedMatches(ifoodItem, localItems, 3),
    [ifoodItem, localItems]
  )

  // Build combobox options
  const options = localItems.map(item => ({
    value: item.id.toString(),
    label: `${item.name} ${item.externalCode ? `(PDV: ${item.externalCode})` : '(sem PDV)'}`,
  }))

  const currentPdvCode = ifoodItem.externalCode || null
  const selectedLocalItem = selectedLocalItemId
    ? localItems.find(item => item.id === selectedLocalItemId)
    : null

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium">{ifoodItem.name}</p>
          <p className="text-sm text-muted-foreground">{ifoodItem.categoryName}</p>
          {ifoodItem.description && (
            <p className="text-xs text-muted-foreground mt-1">
              {ifoodItem.description.substring(0, 60)}
              {ifoodItem.description.length > 60 ? '...' : ''}
            </p>
          )}
        </div>
      </TableCell>

      <TableCell>
        {currentPdvCode ? (
          <Badge variant="default">{currentPdvCode}</Badge>
        ) : (
          <Badge variant="secondary">sem código</Badge>
        )}
      </TableCell>

      <TableCell>
        <div className="space-y-2">
          <Combobox
            value={selectedLocalItemId?.toString() || ''}
            onChange={value => {
              onUpdateMapping(ifoodItem.id, value ? Number(value) : null)
            }}
            options={options}
            placeholder="Selecione um item local"
          />

          {suggestions.length > 0 && !selectedLocalItemId && (
            <div className="text-xs text-blue-600">
              Sugestões:{' '}
              {suggestions.map(s => (
                <span key={s.item.id} className="mr-2">
                  {s.item.name}
                </span>
              ))}
            </div>
          )}

          {/* {selectedLocalItem && !selectedLocalItem.externalCode && (
            <p className="text-xs text-orange-600">
              ⚠ Item local não possui código PDV
            </p>
          )} */}
        </div>
      </TableCell>

      <TableCell>
        {selectedLocalItemId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdateMapping(ifoodItem.id, null)}
          >
            Remover
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
