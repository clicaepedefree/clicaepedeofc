export function IntegrationUnavailable({ name }: { name: string }) {
  return (
    <div
      role="alert"
      className="min-w-0 rounded-md border p-4 text-sm text-muted-foreground"
    >
      {name}: estado desconhecido. Nao foi possivel consultar esta integracao.
      Verifique sua permissao com um proprietario ou gerente e tente novamente.
      Os controles estao bloqueados ate a consulta ser concluida com sucesso.
    </div>
  )
}
