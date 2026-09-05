'use client'

import { WhatsappConnectionCard } from '@/features/whatsapp-bot/components/whatsapp-connection-card'
import { WhatsappAssistantConfigCard } from '@/features/whatsapp-bot/components/whatsapp-assistant-config-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { MessageCircle, SlidersHorizontal } from 'lucide-react'

export function WhatsappAutomationSettings() {
  return (
    <Tabs defaultValue="connection" className="gap-4">
      <TabsList className="h-auto w-full justify-start gap-1 bg-muted/60 p-1 md:w-fit">
        <TabsTrigger value="connection" className="gap-2">
          <MessageCircle className="h-4 w-4" />
          Conexao
        </TabsTrigger>
        <TabsTrigger value="personality" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Personalidade
        </TabsTrigger>
      </TabsList>

      <TabsContent value="connection">
        <WhatsappConnectionCard />
      </TabsContent>

      <TabsContent value="personality">
        <WhatsappAssistantConfigCard />
      </TabsContent>
    </Tabs>
  )
}
