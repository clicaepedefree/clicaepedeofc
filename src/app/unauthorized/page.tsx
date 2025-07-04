import { AlertTriangle } from 'lucide-react'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Acesso Negado',
  description: 'Você não possui permissões de administrador para nenhuma loja.',
}

export default function UnauthorizedPage() {
  return (
    <div className="h-full bg-accent flex flex-col items-center justify-center py-12 px-2 lg:px-8">
      <div className="flex flex-col items-center text-center bg-background py-8 px-4 shadow sm:rounded-lg sm:px-10 rounded-lg max-w-md">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>

        <p className="text-gray-600">
          Você não possui permissões de administrador para nenhuma loja. Entre
          em contato com o administrador da loja para pedir acesso.
        </p>

        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <p className="text-xs text-gray-500">
            <strong>Precisa de ajuda?</strong>
            <br />
            Entre em contato com nossa equipe de suporte se acredita que isso é
            um erro.
          </p>
        </div>
      </div>
    </div>
  )
}
