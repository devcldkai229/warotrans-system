import { fill, getLanguage } from './index'
import { vi } from './vi'
import { viServerErrors } from './vi/serverErrors'

/** The values a server message quotes ('JOB-1', 'RBT-002' …), in order of appearance. */
function quotedValues(message: string): Record<string, string> {
  const values: Record<string, string> = {}
  let index = 1
  for (const match of message.matchAll(/'([^']*)'/g)) values[`q${index++}`] = match[1]
  return values
}

/**
 * The message of an API error in the interface language. English keeps the server's own wording (it names the exact
 * Job, robot or Container). Vietnamese looks the error's code up and re-says it, filling in the values the server's
 * message quoted; an error without a known code falls back to the server's wording.
 */
export function localizeServerMessage(code: string | null, message: string): string {
  if (getLanguage() !== 'vi') return message
  const template = code ? viServerErrors[code] : undefined
  if (template) return fill(template, quotedValues(message))
  return vi[message] ?? message
}
