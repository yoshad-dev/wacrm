import { sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { supabaseAdmin } from './admin-client'
import { engineSendBase, type EngineSendContext } from '@/lib/whatsapp/engine-send-base'

// ------------------------------------------------------------
// Automation-side Meta sender (text + template).
//
// Each public function delegates to `engineSendBase` which handles
// contact lookup, phone-variant retry, and message persistence.
// ------------------------------------------------------------

interface SendTextArgs extends EngineSendContext {
  userId: string
  text: string
}

interface SendTemplateArgs extends EngineSendContext {
  userId: string
  templateName: string
  language?: string
  params?: string[]
}

export async function engineSendText(args: SendTextArgs): Promise<{ whatsapp_message_id: string }> {
  const { waMessageId } = await engineSendBase({
    db: supabaseAdmin(),
    ctx: args,
    attempt: (phone, cfg) =>
      sendTextMessage({
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
        to: phone,
        text: args.text,
      }).then((r) => r.messageId),
    message: {
      senderType: 'bot',
      contentType: 'text',
      contentText: args.text,
    },
  })
  return { whatsapp_message_id: waMessageId }
}

export async function engineSendTemplate(
  args: SendTemplateArgs,
): Promise<{ whatsapp_message_id: string }> {
  const { waMessageId } = await engineSendBase({
    db: supabaseAdmin(),
    ctx: args,
    attempt: (phone, cfg) =>
      sendTemplateMessage({
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
        to: phone,
        templateName: args.templateName,
        language: args.language,
        params: args.params,
      }).then((r) => r.messageId),
    message: {
      senderType: 'bot',
      contentType: 'template',
      contentText: null,
      extra: { template_name: args.templateName },
    },
  })
  return { whatsapp_message_id: waMessageId }
}
