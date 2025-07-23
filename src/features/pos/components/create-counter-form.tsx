import { IconButton } from '@/shared/buttons/icon-button'
import { Input } from '@/shared/input'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { useForm } from '@tanstack/react-form'
import { Check } from 'lucide-react'
import { createCounterSchema } from '../form-validation/counter.schema'
import { useCounter } from '../hooks/use-counter'

export const CreateCounterForm = ({
  onSuccess,
}: {
  onSuccess?: () => void
}) => {
  const { createCounter } = useCounter()
  const form = useForm({
    defaultValues: {
      name: '',
    },
    validators: {
      onSubmit: createCounterSchema,
    },
    onSubmit: async ({ value }) => {
      createCounter(value, { onSuccess })
    },
  })

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {field => (
          <>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Nome do caixa"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={e => field.handleChange(e.target.value)}
                autoFocus
              />
              <form.Subscribe
                selector={state => [state.canSubmit, state.isSubmitting]}
              >
                {([canSubmit, isSubmitting]) => (
                  <IconButton
                    type="submit"
                    disabled={!canSubmit}
                    className={cn(
                      'border not-disabled:border-primary bg-white text-primary hover:bg-primary/80 hover:text-white rounded-sm',
                      { 'border-0 p-1': isSubmitting }
                    )}
                  >
                    {isSubmitting ? <LoadingSpinner /> : <Check size={14} />}
                  </IconButton>
                )}
              </form.Subscribe>
            </div>
            {field.state.meta.errors[0]?.message && (
              <span className="text-red-500 text-xs text-wrap">
                {field.state.meta.errors[0]?.message}
              </span>
            )}
          </>
        )}
      </form.Field>
    </form>
  )
}
