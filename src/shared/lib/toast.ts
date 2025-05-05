import { toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

const toastTypeToDispatcherMapping = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
}

export const dispatchToast = ({ message, type }: { message: string; type: ToastType }) => {
  const toastDispatcher = toastTypeToDispatcherMapping[type]

  toastDispatcher(message, {
    richColors: true,
    position: 'top-center',
    dismissible: true,
    closeButton: true,
  })
}
