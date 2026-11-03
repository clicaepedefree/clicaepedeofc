import { test } from 'bun:test'
import assert from 'node:assert/strict'
const { mock } = require('bun:test') as { mock: { module(name: string,factory:()=>unknown):void } }
let options:any
const tx={select:()=>({from:()=>({where:async()=>[{name:'QA POS'}]})})}
mock.module('@/services/db',()=>({db:{transaction:async(fn:(session:unknown)=>unknown)=>fn(tx)}}))
mock.module('@/features/store/api',()=>({validateUserPermissionsForStore:async()=>({user:{id:'qa-actor'}})}))
mock.module('@/services/auth',()=>({requireAuth:async()=>({id:'qa-actor'})}))
mock.module('@/features/receipt/templates/order',()=>({OrderTemplate:{render:async()=> 'QA receipt'}}))
mock.module('@/features/order/db',()=>({
  checkStockAvailability:async()=>[],getNextOrderDisplayIdForStore:async()=> '1',
  createOrderOnDb:async(input:any)=>{options=input;return {...input.newOrder,id:1,createdAt:new Date()}},
  createOrderAuditEventOnDb:async()=>({}),updateOrderItemInventoryOnDb:async()=>true,
  createOrderItemOnDb:async()=>({}),createOrderItemOptionsOnDb:async()=>[],createOrderPaymentOnDb:async()=>({}),
  addOrderAuditNoteOnDb:async()=>({}),transitionOrderOnDb:async()=>({}),
}))
const {createOrder}=await import('./api')
test('authenticated POS action cannot promote a forged payload to trusted checkout capture',async()=>{
  await createOrder({storeId:9,type:'TAKEOUT',salesChannel:'DIGITAL_MENU',status:'COMPLETED',totalPrice:'100',customerPhone:'11999999901',
    snapshot:{benefits:{cashback:{grantId:'forged',earnedAmount:'9999',balanceAmount:'9999'}}},captureBenefits:true,items:[],payments:[]} as any)
  assert(options);assert.equal(options.dbSession,tx)
  assert.equal(options.captureBenefits,undefined)
  assert.equal(options.newOrder.captureBenefits,true,'Untrusted nested property must never become helper opt-in')
})
