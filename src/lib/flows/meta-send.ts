import {
  sendInteractiveButtons,
  sendInteractiveList,
  sendMediaMessage,
  sendTextMessage,
  type InteractiveButton,
  type InteractiveListSection,
  type MediaKind,
} from '@/lib/whatsapp/meta-api'
import { supabaseAdmin } from './admin-client'
import { engineSendBase, type EngineSendContext } from '@/lib/whatsapp/engine-send-base'

// ------------------------------------------------------------
// Flows-side Meta sender (text, media, interactive variants).
//
// Each public function delegates to `engineSendBase` which handles
// contact lookup, phone-variant retry, and message persistence.
// The only per-function concern is building the Meta API call.
// ------------------------------------------------------------

interface SendTextEngineArgs extends EngineSendContext {
  userId: string
  text: string
}

/**
 * Send a plain-text WhatsApp message from the Flows engine.
 *
 * Used by the runner's `send_message` and `collect_input` nodes.
 */
export async function engineSendText(
  args: SendTextEngineArgs,
): Promise<{ whatsapp_message_id: string }> {
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

interface SendMediaEngineArgs extends EngineSendContext {
  userId: string
  kind: MediaKind
  /** Public URL Meta fetches at send time. */
  link: string
  caption?: string
  /** Document-only; ignored by Meta for image/video. */
  filename?: string
}

/**
 * Send an image / video / document from the Flows engine.
 *
 * Used by the runner's `send_media` node.
 */
export async function engineSendMedia(
  args: SendMediaEngineArgs,
): Promise<{ whatsapp_message_id: string }> {
  const { waMessageId } = await engineSendBase({
    db: supabaseAdmin(),
    ctx: args,
    attempt: (phone, cfg) =>
      sendMediaMessage({
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
        to: phone,
        kind: args.kind,
        link: args.link,
        caption: args.caption,
        filename: args.filename,
      }).then((r) => r.messageId),
    message: {
      senderType: 'bot',
      contentType: args.kind,
      contentText: args.caption ?? null,
    },
  })
  return { whatsapp_message_id: waMessageId }
}

interface SendInteractiveButtonsEngineArgs extends EngineSendContext {
  userId: string
  bodyText: string
  buttons: InteractiveButton[]
  headerText?: string
  footerText?: string
}

interface SendInteractiveListEngineArgs extends EngineSendContext {
  userId: string
  bodyText: string
  buttonLabel: string
  sections: InteractiveListSection[]
  headerText?: string
  footerText?: string
}

/**
 * Send an interactive-button WhatsApp message from the Flows engine.
 */
export async function engineSendInteractiveButtons(
  args: SendInteractiveButtonsEngineArgs,
): Promise<{ whatsapp_message_id: string }> {
  return sendInteractiveViaMeta({ ...args, kind: 'buttons' })
}

/**
 * Send an interactive-list WhatsApp message from the Flows engine.
 * Used when the flow needs more than 3 options (Meta's button cap).
 */
export async function engineSendInteractiveList(
  args: SendInteractiveListEngineArgs,
): Promise<{ whatsapp_message_id: string }> {
  return sendInteractiveViaMeta({ ...args, kind: 'list' })
}

type SendInput =
  | (SendInteractiveButtonsEngineArgs & { kind: 'buttons' })
  | (SendInteractiveListEngineArgs & { kind: 'list' })

async function sendInteractiveViaMeta(
  input: SendInput,
): Promise<{ whatsapp_message_id: string }> {
  const { waMessageId } = await engineSendBase({
    db: supabaseAdmin(),
    ctx: input,
    attempt: (phone, cfg) => {
      if (input.kind === 'buttons') {
        return sendInteractiveButtons({
          phoneNumberId: cfg.phoneNumberId,
          accessToken: cfg.accessToken,
          to: phone,
          bodyText: input.bodyText,
          buttons: input.buttons,
          headerText: input.headerText,
          footerText: input.footerText,
        }).then((r) => r.messageId)
      }
      return sendInteractiveList({
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
        to: phone,
        bodyText: input.bodyText,
        buttonLabel: input.buttonLabel,
        sections: input.sections,
        headerText: input.headerText,
        footerText: input.footerText,
      }).then((r) => r.messageId)
    },
    message: {
      senderType: 'bot',
      contentType: 'interactive',
      contentText: input.bodyText,
    },
  })
  return { whatsapp_message_id: waMessageId }
}
