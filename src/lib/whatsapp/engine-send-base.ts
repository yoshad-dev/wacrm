import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'
import { tryPhoneVariants } from './try-phone-variants'
import { persistMessage } from './persist-message'

export interface EngineSendContext {
  accountId: string
  contactId: string
  conversationId: string
}

export interface EngineConfig {
  phoneNumberId: string
  accessToken: string
}

export interface EngineContact {
  id: string
  phone: string
}

interface EngineSendResult {
  waMessageId: string
}

/**
 * Shared base for engine (automation / flow) sends.
 *
 * Handles the boilerplate every engine sender repeats:
 *   1. Look up the contact by id + account_id
 *   2. Sanitize & validate the phone
 *   3. Load + decrypt the whatsapp_config
 *   4. Run the caller-provided `attempt` through phone-variant retry
 *   5. Persist the working phone if it changed
 *   6. Insert the message row + bump conversation timestamps
 */
export async function engineSendBase(opts: {
  db: SupabaseClient
  ctx: EngineSendContext
  attempt: (phone: string, cfg: EngineConfig) => Promise<string>
  message: {
    senderType: 'agent' | 'bot'
    contentType: string
    contentText: string | null
    extra?: Record<string, unknown>
  }
}): Promise<EngineSendResult> {
  const { db, ctx, attempt, message } = opts

  // 1. Contact lookup, scoped by account_id
  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone')
    .eq('id', ctx.contactId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (contactErr || !contact?.phone) {
    throw new Error('contact not found for this account')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid: ${contact.phone}`)
  }

  // 2. WhatsApp config lookup, scoped by account_id
  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', ctx.accountId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const accessToken = decrypt(config.access_token)
  const cfg: EngineConfig = {
    phoneNumberId: config.phone_number_id,
    accessToken,
  }

  // 3. Phone-variant retry
  const { waMessageId, workingPhone } = await tryPhoneVariants(
    sanitized,
    (phone) => attempt(phone, cfg),
  )

  // 4. Persist corrected phone
  if (workingPhone !== sanitized) {
    await db.from('contacts').update({ phone: workingPhone }).eq('id', contact.id)
  }

  // 5. Message + conversation persistence
  await persistMessage({
    db,
    conversationId: ctx.conversationId,
    senderType: message.senderType,
    contentType: message.contentType,
    contentText: message.contentText,
    waMessageId,
    extra: message.extra,
  })

  return { waMessageId }
}
