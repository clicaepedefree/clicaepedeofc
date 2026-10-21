'use client'

import { WhatsappConnectionCard } from '@/features/whatsapp-bot/components/whatsapp-connection-card'
import { WhatsappAssistantConfigCard } from '@/features/whatsapp-bot/components/whatsapp-assistant-config-card'
import { WhatsappHumanHandoffCard } from '@/features/whatsapp-bot/components/whatsapp-human-handoff-card'
import { WhatsappOperationalDiagnosticsCard } from '@/features/whatsapp-bot/components/whatsapp-operational-diagnostics-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { Activity, Inbox, MessageCircle, SlidersHorizontal } from 'lucide-react'

export function WhatsappAutomationSettings() {
  return (
    <Tabs defaultValue="connection" className="min-w-0 gap-4">
      <TabsList aria-label="Atendimento automatizado" className="h-auto min-h-11 w-full max-w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1 md:w-fit">
        <TabsTrigger value="connection" className="min-h-11 shrink-0 flex-none gap-2 px-3">
          <MessageCircle className="h-4 w-4" />
          Conexao
        </TabsTrigger>
        <TabsTrigger value="personality" className="min-h-11 shrink-0 flex-none gap-2 px-3">
          <SlidersHorizontal className="h-4 w-4" />
          Personalidade
        </TabsTrigger>
        <TabsTrigger value="handoff" className="min-h-11 shrink-0 flex-none gap-2 px-3">
          <Inbox className="h-4 w-4" />
          Atendimentos
        </TabsTrigger>
        <TabsTrigger value="diagnostics" className="min-h-11 shrink-0 flex-none gap-2 px-3">
          <Activity className="h-4 w-4" />
          Diagnostico
        </TabsTrigger>
      </TabsList>

      <TabsContent value="connection">
        <WhatsappConnectionCard />
      </TabsContent>

      <TabsContent value="personality">
        <WhatsappAssistantConfigCard />
      </TabsContent>

      <TabsContent value="handoff">
        <WhatsappHumanHandoffCard />
      </TabsContent>

      <TabsContent value="diagnostics">
        <WhatsappOperationalDiagnosticsCard />
      </TabsContent>
    </Tabs>
  )
}
