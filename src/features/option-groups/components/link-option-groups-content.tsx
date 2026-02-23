'use client'

import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { ReorderButtons } from '@/shared/buttons/reorder-buttons'
import { Combobox } from '@/shared/combobox'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import { SmallText } from '@/shared/typography/small-text'
import { ChevronDown, GripVertical, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { OptionGroupForm, OptionGroupFormValues } from './option-group-form'

type LinkOptionGroupsContentProps = {
  allGroups?: OptionGroupWithOptions[]
  selectedIds: number[]
  onAddGroup: (groupId: number) => void
  onRemoveGroup: (groupId: number) => void
  onReorder: (updatedIds: number[]) => void
  onCreateGroup?: (values: OptionGroupFormValues) => Promise<void>
  isCreating?: boolean
  className?: string
}

const MAX_PREVIEW_ITEMS = 4

const getItemNamesPreview = (group: OptionGroupWithOptions): string => {
  const names = group.options.map((opt) => opt.item.name)
  if (names.length <= MAX_PREVIEW_ITEMS) return names.join(', ')
  const visible = names.slice(0, MAX_PREVIEW_ITEMS).join(', ')
  return `${visible} +${names.length - MAX_PREVIEW_ITEMS}`
}

export const LinkOptionGroupsContent = ({
  allGroups,
  selectedIds,
  onAddGroup,
  onRemoveGroup,
  onReorder,
  onCreateGroup,
  isCreating,
  className,
}: LinkOptionGroupsContentProps) => {
  const hasNoGroups = !allGroups || allGroups.length === 0
  const [showCreateForm, setShowCreateForm] = useState(hasNoGroups)

  // Auto-expand create form when no groups exist
  useEffect(() => {
    if (hasNoGroups && onCreateGroup) {
      setShowCreateForm(true)
    }
  }, [hasNoGroups, onCreateGroup])

  const availableGroups = useMemo(
    () => (allGroups ?? []).filter((g) => !selectedIds.includes(g.id)),
    [allGroups, selectedIds]
  )

  const selectedGroups = useMemo(
    () =>
      selectedIds
        .map((id) => (allGroups ?? []).find((g) => g.id === id))
        .filter(Boolean) as OptionGroupWithOptions[],
    [allGroups, selectedIds]
  )

  const handleCreate = async (values: OptionGroupFormValues) => {
    if (!onCreateGroup) return
    await onCreateGroup(values)
    setShowCreateForm(false)
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const updated = [...selectedIds]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    onReorder(updated)
  }

  const handleMoveDown = (index: number) => {
    if (index >= selectedIds.length - 1) return
    const updated = [...selectedIds]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    onReorder(updated)
  }

  return (
    <div className={cn('space-y-3', className)}>
      {onCreateGroup && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? (
            <>
              <ChevronDown size={16} className="rotate-180 transition-transform" />
              Fechar formulario
            </>
          ) : (
            <>
              <Plus size={16} />
              Criar novo grupo
            </>
          )}
        </Button>
      )}
      {showCreateForm && onCreateGroup && (
        <div className="border border-border rounded-lg p-3 space-y-3">
          {hasNoGroups && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
              <SmallText className="text-amber-800">
                Você ainda não tem grupos de complementos. Crie o primeiro abaixo!
              </SmallText>
            </div>
          )}
          <OptionGroupForm
            onSubmit={handleCreate}
            isSubmitting={isCreating}
          />
        </div>
      )}
      {!hasNoGroups && (
        <Label>
          Adicionar grupo de complementos
        <Combobox<OptionGroupWithOptions>
          options={availableGroups}
          value=""
          onChange={(selectedValue) => {
            const groupId = Number(selectedValue)
            if (groupId) onAddGroup(groupId)
          }}
          customKeyValueParserForOption={(option) => ({
            value: String(option.id),
            label: option.name,
            keywords: [option.name],
          })}
          placeholder="Selecione um grupo de complementos"
          searchPlaceholder="Buscar grupo..."
          noResultMessage="Nenhum grupo encontrado"
          disableUnselectingOption
        />
      </Label>
      )}
      {selectedGroups.length === 0 && !showCreateForm && (
        <Body className="text-muted-foreground py-2">
          Nenhum grupo selecionado.
        </Body>
      )}
      {selectedGroups.length > 0 && (
        <div className="space-y-2">
          <SmallText className="font-medium text-muted-foreground">
            Grupos selecionados ({selectedGroups.length})
          </SmallText>
          {selectedGroups.map((group, index) => (
            <div
              key={group.id}
              className="flex items-center gap-2 p-3 rounded-lg border border-primary bg-primary/5"
            >
              <div className="flex items-center gap-1">
                <GripVertical size={16} className="text-muted-foreground" />
                <ReorderButtons
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  disabledUp={index === 0}
                  disabledDown={index === selectedGroups.length - 1}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {index + 1}.
                  </Badge>
                  {index === 0 && (
                    <Badge variant="default" className="text-xs">
                      Principal
                    </Badge>
                  )}
                </div>
                <Body className="font-medium mt-1">{group.name}</Body>
                <SmallText className="text-muted-foreground truncate block">
                  {getItemNamesPreview(group)}
                </SmallText>
                <SmallText className="text-muted-foreground">
                  {group.options.length}{' '}
                  {group.options.length === 1 ? 'complemento' : 'complementos'} &middot;
                  Seleção: {group.minQuantity} a {group.maxQuantity}
                </SmallText>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                onClick={() => onRemoveGroup(group.id)}
              >
                <X size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
