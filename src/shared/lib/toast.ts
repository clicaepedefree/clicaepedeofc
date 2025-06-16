import { toast, ToastT } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

const toastTypeToDispatcherMapping = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
}

export const dispatchToast = ({
  message,
  type,
  position = 'top-center',
}: {
  message: string
  type: ToastType
  position?: ToastT['position']
}) => {
  const toastDispatcher = toastTypeToDispatcherMapping[type]

  toastDispatcher(message, {
    richColors: true,
    position,
    dismissible: true,
    closeButton: true,
  })
}
