import { phoneVariants, isRecipientNotAllowedError } from './phone-utils'

/**
 * Retry a Meta send across phone-number variants.
 *
 * Many numbers differ only in a trunk-prefix 0 between domestic and
 * international format. Meta's sandbox also registers numbers in one
 * format and rejects the other. This helper tries every variant
 * returned by `phoneVariants()` and returns the first one that
 * succeeds.
 *
 * Only "recipient not in allowed list" errors trigger a retry; any
 * other error propagates immediately.
 *
 * @param sanitizedPhone - digits-only phone from `sanitizePhoneForMeta`
 * @param attempt        - async fn that sends via Meta and returns the message id
 * @returns `{ waMessageId, workingPhone }` on success
 */
export async function tryPhoneVariants(
  sanitizedPhone: string,
  attempt: (phone: string) => Promise<string>,
): Promise<{ waMessageId: string; workingPhone: string }> {
  const variants = phoneVariants(sanitizedPhone)
  let workingPhone = sanitizedPhone
  let waMessageId = ''
  let lastError: unknown = null

  for (const v of variants) {
    try {
      waMessageId = await attempt(v)
      workingPhone = v
      lastError = null
      break
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isRecipientNotAllowedError(msg)) throw err
      lastError = err
    }
  }
  if (lastError) throw lastError

  return { waMessageId, workingPhone }
}
