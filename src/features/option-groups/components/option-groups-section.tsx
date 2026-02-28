'use client'

import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { useOptionGroups } from '@/features/option-groups/hooks/use-option-groups'
import { selectedStoreIdAtom } from '@/features/store/state'
import {
  formatValueToCurrency,
  getValueFromCurrencyString,
} from '@/shared/formatters/currency'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { DeleteButton } from '@/shared/buttons/delete-button'
import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { DeleteResourceConfirmationModal } from '@/shared/modals/delete-resource-confirmation-modal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { LargeText } from '@/shared/typography/large-text'
import { SmallText } from '@/shared/typography/small-text'
import { useAtom } from 'jotai'
import { Edit, Layers, Plus } from 'lucide-react'
import { OptionGroupForm, OptionGroupFormValues } from './option-group-form'

export const OptionGroupsSection = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const {
    optionGroups,
    isLoading,
    createOptionGroup,
    isCreating,
    updateOptionGroup,
    isUpdating,
    deleteOptionGroup,
    isDeleting,
  } = useOptionGroups()

  if (!selectedStoreId) return null

  const handleCreate = async (values: OptionGroupFormValues) => {
    await createOptionGroup({
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
  }

  const handleUpdate = async (values: OptionGroupFormValues) => {
    if (!values.id) return

    await updateOptionGroup({
      id: values.id,
      storeId: selectedStoreId,
      name: values.name,
      minQuantity: values.minQuantity,
      maxQuantity: values.maxQuantity,
      options: values.options.map((opt) => ({
        id: opt.id,
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
  }

  const hasOptionGroups = !!optionGroups?.length

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <Headline variant={300}>Grupos de complementos</Headline>
        <BaseSideBarActionForm
          title="Novo grupo de complementos"
          description="Crie um grupo de complementos reutilizável para vincular aos seus produtos."
          trigger={
            <Button variant="outline" className="font-semibold">
              <Plus size={20} strokeWidth={3} /> Grupo de complementos
            </Button>
          }
          contentClassName="sm:max-w-6xl"
        >
          {({ FooterContainer, closeSidebar }) => (
            <OptionGroupForm
              className="px-4 overflow-y-auto relative"
              onSubmit={async (values) => {
                await handleCreate(values)
                closeSidebar()
              }}
              isSubmitting={isCreating}
              FooterContainerComponent={FooterContainer}
            />
          )}
        </BaseSideBarActionForm>
      </div>

      {isLoading && <Body>Carregando...</Body>}

      {!isLoading && !hasOptionGroups && (
        <div className="flex flex-col items-center justify-center py-12 px-6 border border-dashed border-border rounded-lg bg-muted/30">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Layers size={32} className="text-primary" />
          </div>
          <LargeText variant="md" className="text-center mb-2">
            Nenhum grupo criado ainda
          </LargeText>
          <Body className="text-muted-foreground text-center max-w-md mb-6">
            Grupos de complementos permitem adicionar extras aos seus produtos,
            como tamanhos, ingredientes e adicionais.
          </Body>
          <BaseSideBarActionForm
            title="Novo grupo de complementos"
            description="Crie um grupo de complementos reutilizável para vincular aos seus produtos."
            trigger={
              <Button variant="default" className="font-semibold">
                <Plus size={20} strokeWidth={3} /> Criar primeiro grupo
              </Button>
            }
            contentClassName="sm:max-w-6xl"
          >
            {({ FooterContainer, closeSidebar }) => (
              <OptionGroupForm
                className="px-4 overflow-y-auto relative"
                onSubmit={async (values) => {
                  await handleCreate(values)
                  closeSidebar()
                }}
                isSubmitting={isCreating}
                FooterContainerComponent={FooterContainer}
              />
            )}
          </BaseSideBarActionForm>
        </div>
      )}

      {hasOptionGroups && (
        <Table className="table-auto">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-center">Tipo</TableHead>
              <TableHead className="text-center">Seleção</TableHead>
              <TableHead>Complementos</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {optionGroups?.map((group) => (
              <OptionGroupRow
                key={group.id}
                group={group}
                onUpdate={handleUpdate}
                isUpdating={isUpdating}
                onDelete={() => deleteOptionGroup(group)}
                isDeleting={isDeleting}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

const OptionGroupRow = ({
  group,
  onUpdate,
  isUpdating,
  onDelete,
  isDeleting,
}: {
  group: OptionGroupWithOptions
  onUpdate: (values: OptionGroupFormValues) => Promise<void>
  isUpdating: boolean
  onDelete: () => void
  isDeleting: boolean
}) => {
  const selectionLabel =
    group.minQuantity === group.maxQuantity
      ? `Exatamente ${group.minQuantity}`
      : `${group.minQuantity} a ${group.maxQuantity}`

  const isRequired = group.minQuantity > 0

  const optionNamesPreview = group.options
    .slice(0, 3)
    .map((opt) => opt.item.name)
    .join(', ')
  const remainingCount = group.options.length - 3
  const optionNamesDisplay =
    remainingCount > 0
      ? `${optionNamesPreview}...`
      : optionNamesPreview

  return (
    <TableRow className="odd:bg-muted/50">
      <TableCell>
        <LargeText variant="sm">{group.name}</LargeText>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={isRequired ? 'default' : 'secondary'}>
          {isRequired ? 'Obrigatório' : 'Opcional'}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <SmallText>{selectionLabel}</SmallText>
      </TableCell>
      <TableCell>
        <SmallText className="text-muted-foreground">
          {optionNamesDisplay || 'Nenhum complemento'}
        </SmallText>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-center gap-2">
          <BaseSideBarActionForm
            title="Editar grupo de complementos"
            description="Altere os dados do grupo de complementos."
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="group/edit"
                disabled={isDeleting}
              >
                <Edit
                  size={16}
                  className="group-hover/edit:text-primary"
                />
              </Button>
            }
            contentClassName="sm:max-w-6xl"
          >
            {({ FooterContainer, closeSidebar }) => (
              <OptionGroupForm
                className="px-4 overflow-y-auto relative"
                optionGroup={group}
                onSubmit={async (values) => {
                  await onUpdate(values)
                  closeSidebar()
                }}
                isSubmitting={isUpdating}
                FooterContainerComponent={FooterContainer}
              />
            )}
          </BaseSideBarActionForm>
          <DeleteResourceConfirmationModal
            trigger={<DeleteButton isDeleting={isDeleting} />}
            resource="grupo de complementos"
            resourceName={group.name}
            isDeleting={isDeleting}
            onConfirm={onDelete}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}
