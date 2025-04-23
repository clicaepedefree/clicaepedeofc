import { AnyFieldApi } from '@tanstack/react-form'

export const FormFieldError = ({ field }: { field: AnyFieldApi }) => {
  const errors = field.state.meta.errors
  const hasErrors = field.state.meta.isTouched && errors.length
  if (!hasErrors) return null

  return (
    <em className="text-red-500 text-xs">
      {errors.map((error, index) => (
        <div key={`${field.name}-error-${index}`}>{error.message}</div>
      ))}
    </em>
  )
}
