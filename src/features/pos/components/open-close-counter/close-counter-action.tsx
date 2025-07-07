'use client'

import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { Counter } from '../../types'
import { CloseCounterForm } from './close-counter-form'

type CloseCounterActionProps = {
  counter: Counter
  trigger: React.ReactNode
  onSuccess?(): void
}

export const CloseCounterAction = ({
  counter,
  trigger,
  onSuccess,
}: CloseCounterActionProps) => {
  return (
    <BaseSideBarActionForm
      title={`Fechar balcão '${counter.name}'`}
      description="Insira o valor restante no caixa."
      trigger={trigger}
    >
      {({ FooterContainer, closeSidebar }) => (
        <CloseCounterForm
          className="px-4 overflow-y-auto relative"
          counter={counter}
          onSuccess={() => {
            closeSidebar?.()
            onSuccess?.()
          }}
          onCancel={closeSidebar}
          FooterContainerComponent={FooterContainer}
        />
      )}
    </BaseSideBarActionForm>
  )
}
