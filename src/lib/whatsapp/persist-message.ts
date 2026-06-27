import type { SupabaseClient } from '@supabase/supabase-js'

interface PersistMessageArgs {
  db: SupabaseClient
  conversationId: string
  senderType: 'agent' | 'bot' | 'customer'
  contentType: string
  contentText: string | null
  waMessageId: string
  /** Extra columns merged into the messages INSERT (template_name, media_url, etc.). */
  extra?: Record<string, unknown>
}

/**
 * Insert a sent message row and bump the conversation's
 * `last_message_text` / timestamps in one shot.
 *
 * Shared by the manual-send route, automations engine, and flows
 * engine so the insert shape + conversation update stay consistent.
 */
export async function persistMessage(args: PersistMessageArgs): Promise<void> {
  const { db, conversationId, senderType, contentType, contentText, waMessageId, extra } = args

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: conversationId,
    sender_type: senderType,
    content_type: contentType,
    content_text: contentText,
    message_id: waMessageId,
    status: 'sent',
    ...extra,
  })
  if (msgErr) {
    throw new Error(`sent to Meta but DB insert failed: ${msgErr.message}`)
  }

  const preview =
    contentText?.trim() || `[${contentType}]`

  await db
    .from('conversations')
    .update({
      last_message_text: preview,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}
