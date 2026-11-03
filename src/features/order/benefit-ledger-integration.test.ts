import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { storesTable, ordersTable, publicOrderSubmissionsTable } from '@/services/db/schema'

const { mock } = require('bun:test') as { mock: { module(name: string, factory: () => unknown): void } }
const calls: { name: string; data: any; tx?: unknown }[] = []
let persisted: any = null
mock.module('@/features/benefit-programs/ledger', () => ({
  captureOrderBenefits: async (order: unknown,tx:unknown) => { calls.push({name:'capture',data:order,tx}) },
  settleOrderBenefits: async (order: unknown,tx:unknown) => { calls.push({name:'settle',data:order,tx}) },
  getOrderBenefitNotificationData: async (orderId: number,storeId: number,tx:unknown) => {
    calls.push({name:'read-ledger',data:{orderId,storeId},tx})
    return persisted
  },
}))
mock.module('@/features/whatsapp-bot/db', () => ({
  enqueueWhatsappTransactionalMessage: async (input: any) => {
    calls.push({name:'enqueue',data:input,tx:input.dbSession}); return {id:'queued'}
  },
}))
const {createOrderOnDb,enqueueOrderBenefitWhatsappNotificationsOnDb,transitionOrderOnDb} = await import('./db')

function order(overrides: Record<string, unknown> = {}) {
  return {id:1,storeId:9,displayId:'QA',type:'TAKEOUT',salesChannel:'DIGITAL_MENU',
    status:'PENDING',customerPhone:'+5511999999901',totalPrice:'20',
    snapshot:{benefits:{cashback:{grantId:'forged',earnedAmount:'999',balanceAmount:'999'}}},...overrides} as any
}
function session(current = order()) {
  let nextStatus = current.status
  const db = {
    insert: () => ({values: () => ({returning: async () => [current], then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve([]))})}),
    select: () => ({from: (table: unknown) => ({where: () => ({limit: () => {
      const result = table === storesTable ? [{name:'QA Store',subdomain:'qa-store'}] : table === ordersTable ? [current] : []
      return {then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)),for: async () => result}
    }})})}),
    update: (table: unknown) => ({set: (values: any) => {
      if(table===ordersTable && values.status) nextStatus=values.status
      return {where: () => ({returning: async () => table===publicOrderSubmissionsTable ? [] : [{...current,status:nextStatus}]})}
    }}),
  }
  return db as any
}
function reset() { calls.length=0; persisted=null }

describe('authoritative order benefit integration', () => {
  test('POS creation never captures benefits by default even if input spoofs channel/snapshot',async()=>{
    reset(); await createOrderOnDb({newOrder:order({status:'COMPLETED'}),dbSession:session(order({status:'COMPLETED'}))})
    assert.equal(calls.length,0)
  })
  test('only explicit server checkout opt-in captures and settles inside the supplied transaction',async()=>{
    reset(); const tx=session(); await createOrderOnDb({newOrder:order(),dbSession:tx,captureBenefits:true})
    assert.deepEqual(calls.map(c=>c.name),['capture','settle'])
    assert(calls.every(c=>c.tx===tx))
  })
  test('forged snapshot without authoritative grant cannot enqueue any benefit',async()=>{
    reset(); const result=await enqueueOrderBenefitWhatsappNotificationsOnDb({order:order({status:'COMPLETED'}),dbSession:session()})
    assert.deepEqual(result,[]); assert.deepEqual(calls.map(c=>c.name),['read-ledger'])
  })
  test('confirmed notification uses persisted gain, balance and pinned recipient only',async()=>{
    reset(); persisted={customerPhone:'+5511999999902',grants:[{type:'cashback',grantId:'actual-ledger-id',earnedAmount:'1.25',balanceAmount:'4.50',expiresAt:'2027-01-01T00:00:00Z'}]}
    await enqueueOrderBenefitWhatsappNotificationsOnDb({order:order({status:'COMPLETED'}),dbSession:session()})
    const sent=calls.find(c=>c.name==='enqueue')!.data
    assert.equal(sent.recipientPhone,persisted.customerPhone)
    assert.equal(sent.payload.grantId,'actual-ledger-id')
    assert.equal(sent.payload.earnedAmount,'1.25'); assert.equal(sent.payload.balanceAmount,'4.50')
    assert(!sent.text.includes('999')); assert(!JSON.stringify(sent.payload).includes('forged'))
  })
  test('pending orders never read or notify available grants',async()=>{
    reset(); persisted={customerPhone:'+5511999999902',grants:[{type:'cashback',grantId:'available',earnedAmount:'2',balanceAmount:'2'}]}
    await enqueueOrderBenefitWhatsappNotificationsOnDb({order:order(),dbSession:session()})
    assert.equal(calls.length,0)
  })
  test('completion settles before ledger read and preserves exact transaction through notification',async()=>{
    reset(); persisted={customerPhone:'+5511999999902',grants:[{type:'cashback',grantId:'grant-real',earnedAmount:'2',balanceAmount:'2'}]}
    const tx=session(order({status:'ACCEPTED',customerPhone:null}))
    await transitionOrderOnDb({orderId:1,storeId:9,action:'complete',actorUserId:'qa-user',requestId:'qa-complete',dbSession:tx})
    assert.deepEqual(calls.map(c=>c.name),['settle','read-ledger','enqueue'])
    assert(calls.every(c=>c.tx===tx)); assert.equal(calls[2].data.eventId,'order:1:benefit:cashback:grant-real')
  })
  test('existing cancellation transition settles pending grants before returning',async()=>{
    reset(); await transitionOrderOnDb({orderId:1,storeId:9,action:'cancel',reason:'QA cancellation',actorUserId:'qa-user',requestId:'qa-request',dbSession:session(order({customerPhone:null,salesChannel:'POS'}))})
    assert.equal(calls.filter(c=>c.name==='settle').length,1)
    assert.equal(calls.find(c=>c.name==='settle')!.data.status,'CANCELLED')
  })
})
