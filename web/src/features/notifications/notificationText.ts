import type { AdminNotification } from '@/shared/api/contracts'
import { getLanguage, msg, t, type TranslationValues } from '@/shared/i18n'
import { humanize } from '@/shared/lib/format'

/**
 * Notifications are stored with their English text (backend AdminNotificationProducer / IssueService). In Vietnamese
 * the web recognises the sentence the backend wrote, takes the values out of it (the robot, the Job, how long it has
 * waited …) and says it again in Vietnamese. A sentence it does not recognise (an old notification, or text a person
 * wrote, such as an issue's description) is shown as stored.
 *
 * The templates below are the backend's sentences with `{name}` where a value goes; each one has a Vietnamese entry in
 * `i18n/vi/notifications.ts`, which the coverage test checks.
 */
const TEMPLATES: string[] = [
  // Job
  msg('Job {job} failed'),
  msg('The job stopped and will not continue.'),
  msg('The job stopped and will not continue. Reason: {reason}.'),
  msg('Job {job} is paused'),
  msg('A step failed and the workflow waits for an operator to resume it.'),
  msg('A step failed and the workflow waits for an operator to resume it. Reason: {reason}.'),
  msg('Job {job} needs another robot'),
  msg('The robot could not finish the job; assign it to a different robot.'),
  msg('The robot could not finish the job; assign it to a different robot. Reason: {reason}.'),
  msg('Job {job} needs recovery'),
  msg('The job lost its robot and has to be recovered by an admin.'),
  msg('The job lost its robot and has to be recovered by an admin. Reason: {reason}.'),
  msg('Job {job} has not been started'),
  msg('It has been waiting {waited} for a robot. Run it on a robot from its job page.'),
  msg('Job {job} is waiting for a person'),
  msg('The step "{step}" needs someone to confirm it and has waited {waited}.'),
  // Robot
  msg('Robot {robot} went offline'),
  msg('No heartbeat from the robot. A job it was running may need to be reassigned.'),
  msg('Robot {robot} did not answer a command'),
  msg('The {command} command timed out waiting for the robot to acknowledge it.'),
  msg('Robot {robot} rejected a command'),
  msg('The {command} command was refused.'),
  msg('The {command} command was refused ({error}).'),
  msg('Robot {robot} battery is low'),
  msg('{percent}% left and the robot is not charging.'),
  msg('Robot {robot} reported an error'),
  msg('Error code: {code}.'),
  // Transport request
  msg('Transport request {request} failed'),
  msg('None of its {count} container(s) could be delivered.'),
  msg('Transport request {request} has failed containers'),
  msg('{failed} of {total} container(s) failed, {completed} delivered.'),
  msg('Transport request {request} was rejected'),
  msg('Transport request {request} was cancelled'),
  msg('Reason: {reason}'),
  msg('Cancelled request {request} still has cargo on a robot'),
  msg('{count} container(s) are on a robot. Unload them and cancel the Job, or resume it to deliver them.'),
  // Issue (the content of these is what the person wrote, so it is left alone)
  msg('Issue {issue} reported ({severity})'),
  msg('Issue {issue} was assigned to you'),
  msg('Issue {issue} you reported was resolved'),
]

/** How long something has waited, as the backend words it ("12 min", "3 h 05 min", "8 days"). */
const DURATIONS: string[] = [msg('{minutes} min'), msg('{hours} h {minutes} min'), msg('{days} days')]

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Values that are always a number match digits only, so "3 h 05 min" is never read as "{minutes} min". */
const NUMBERS = new Set(['minutes', 'hours', 'days', 'count', 'failed', 'total', 'completed', 'percent'])

/** `Job {job} failed` → /^Job (?<job>.+?) failed$/ */
function compile(template: string) {
  const pattern = escapeRegExp(template).replace(
    /\\\{(\w+)\\\}/g,
    (_, name: string) => `(?<${name}>${NUMBERS.has(name) ? '\\d+' : '.+?'})`,
  )
  return { template, regex: new RegExp(`^${pattern}$`) }
}

const COMPILED = TEMPLATES.map(compile)
const COMPILED_DURATIONS = DURATIONS.map(compile)

function recognise(text: string, compiled: ReturnType<typeof compile>[]) {
  for (const { template, regex } of compiled) {
    const match = regex.exec(text)
    // A sentence with no value in it has no named groups at all, but it still matches.
    if (match) return { template, values: { ...match.groups } as TranslationValues }
  }
  return null
}

function localize(text: string): string {
  const found = recognise(text, COMPILED)
  if (!found) return text
  const { template, values } = found
  if (typeof values.waited === 'string') values.waited = localizeDuration(values.waited)
  if (typeof values.severity === 'string') values.severity = humanize(values.severity)
  return t(template, values)
}

function localizeDuration(text: string): string {
  const found = recognise(text, COMPILED_DURATIONS)
  return found ? t(found.template, found.values) : text
}

/** The title and content of a notification in the interface language (English is returned as stored). */
export function localizedNotificationText(notification: Pick<AdminNotification, 'title' | 'content'>) {
  if (getLanguage() === 'en') return { title: notification.title, content: notification.content }
  return { title: localize(notification.title), content: localize(notification.content) }
}
