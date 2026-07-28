export type TurnstileWidgetCallbacks = {
  onToken: (token: string | null) => void
  onError: (message: string) => void
}

export const buildDigitalMenuTurnstileOptions = ({
  siteKey,
  onToken,
  onError,
}: TurnstileWidgetCallbacks & {
  siteKey: string
}) => ({
  sitekey: siteKey,
  action: 'digital_menu_checkout',
  theme: 'auto',
  size: 'flexible',
  appearance: 'always',
  callback: (token: string) => onToken(token),
  'expired-callback': () => {
    onToken(null)
    onError('A verificacao expirou. Faca novamente para enviar o pedido.')
  },
  'error-callback': () => {
    onToken(null)
    onError(
      'Nao foi possivel carregar a verificacao. Confira sua conexao e tente novamente.'
    )
  },
  'unsupported-callback': () => {
    onToken(null)
    onError(
      'Seu navegador nao conseguiu carregar a verificacao. Atualize o navegador ou tente em outro dispositivo.'
    )
  },
})
