import { db } from './index'

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbSession = typeof db | DbTransaction
