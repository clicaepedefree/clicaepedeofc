'use client'

import { BaseSideBarActionForm } from '@/shared/form/base-side-bar-action-form'
import { Counter } from '../../types'
import { OpenCounterForm } from './open-counter-form'

type OpenCounterActionProps = {
  counter: Counter
  trigger: React.ReactNode
  onSuccess?(): void
}
export const OpenCounterAction = ({
  counter,
  trigger,
  onSuccess,
}: OpenCounterActionProps) => {
  return (
    <BaseSideBarActionForm
      title={`Abrir balcão '${counter.name}'`}
      description="Insira o valor disponível no caixa."
      trigger={trigger}
    >
      {({ FooterContainer, closeSidebar }) => (
        <OpenCounterForm
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
