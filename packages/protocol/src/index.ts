import { z } from 'zod'

export const adminSectionSchema = z.enum(['overview', 'app-passwords', 'floccus', 'security'])
export type AdminSection = z.infer<typeof adminSectionSchema>

export const appPasswordSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type AppPassword = z.infer<typeof appPasswordSchema>

export const storageStatusSchema = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  lastModifiedAt: z.string().datetime().nullable(),
  maxFileBytes: z.number().int().positive(),
})
export type StorageStatus = z.infer<typeof storageStatusSchema>

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
})
export type ApiError = z.infer<typeof apiErrorSchema>

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('bookmark-vault-api'),
  version: z.string(),
})
