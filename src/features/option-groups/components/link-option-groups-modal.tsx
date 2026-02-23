'use client'

import { useOptionGroups } from '@/features/option-groups/hooks/use-option-groups'
import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { selectedStoreIdAtom } from '@/features/store/state'
import {
  formatValueToCurrency,
} from '@/shared/formatters/currency'
import { Button } from '@/shared/button'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { useAtom } from 'jotai'
import { useState } from 'react'
import { LinkOptionGroupsContent } from './link-option-groups-content'
import { OptionGroupFormValues } from './option-group-form'

type LinkOptionGroupsModalProps = {
  trigger: React.ReactNode
  itemOfferingId: number
  itemName: string
  currentOptionGroups?: OptionGroupWithOptions[]
  onSuccess?(): void
}

export const LinkOptionGroupsModal = ({
  trigger,
  itemOfferingId,
  itemName,
  currentOptionGroups = [],
  onSuccess,
}: LinkOptionGroupsModalProps) => {
  return (
    <BaseSideBarActionForm
      title="Grupos de complementos"
      description={`Selecione os grupos de complementos para "${itemName}"`}
      trigger={trigger}
      contentClassName="sm:max-w-lg h-fit"
    >
      {({ FooterContainer, closeSidebar }) => (
        <LinkOptionGroupsInner
          itemOfferingId={itemOfferingId}
          currentOptionGroups={currentOptionGroups}
          onSuccess={onSuccess}
          closeSidebar={closeSidebar}
          FooterContainer={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}

const LinkOptionGroupsInner = ({
  itemOfferingId,
  currentOptionGroups,
  onSuccess,
  closeSidebar,
  FooterContainer,
}: {
  itemOfferingId: number
  currentOptionGroups: OptionGroupWithOptions[]
  onSuccess?(): void
  closeSidebar(): void
  FooterContainer: ComponentWithChildren
}) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const {
    optionGroups: allGroups,
    linkOptionGroups,
    isLinking,
    createOptionGroup,
    isCreating,
  } = useOptionGroups()
  const [selectedIds, setSelectedIds] = useState<number[]>(
    currentOptionGroups.map((g) => g.id)
  )

  const addGroup = (groupId: number) => {
    setSelectedIds((prev) => [...prev, groupId])
  }

  const removeGroup = (groupId: number) => {
    setSelectedIds((prev) => prev.filter((id) => id !== groupId))
  }

  const reorderGroups = (updatedIds: number[]) => {
    setSelectedIds(updatedIds)
  }

  const handleCreateGroup = async (values: OptionGroupFormValues) => {
    if (!selectedStoreId) return
    const newGroup = await createOptionGroup({
      storeId: selectedStoreId,
      name: values.name,
      minQuantity: values.minQuantity,
      maxQuantity: values.maxQuantity,
      options: values.options.map((opt) => ({
        itemId: opt.itemId,
        price: formatValueToCurrency({ value: opt.price }),
        originalPrice: opt.originalPrice
          ? formatValueToCurrency({ value: opt.originalPrice })
          : null,
        minQuantity: opt.minQuantity,
        maxQuantity: opt.maxQuantity,
        index: opt.index,
      })),
    })
    setSelectedIds((prev) => [...prev, newGroup.id])
  }

  const handleSave = async () => {
    if (!selectedStoreId) return

    await linkOptionGroups({
      itemOfferingId,
      storeId: selectedStoreId,
      optionGroupIds: selectedIds,
    })
    onSuccess?.()
    closeSidebar()
  }

  return (
    <>
      <LinkOptionGroupsContent
        allGroups={allGroups}
        selectedIds={selectedIds}
        onAddGroup={addGroup}
        onRemoveGroup={removeGroup}
        onReorder={reorderGroups}
        onCreateGroup={handleCreateGroup}
        isCreating={isCreating}
        className="px-4 py-2 overflow-y-auto max-h-[60vh]"
      />
      <FooterContainer>
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button variant="secondary" onClick={closeSidebar}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLinking}>
            {isLinking ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </FooterContainer>
    </>
  )
}
