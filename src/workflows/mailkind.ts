/** System notices nobody answers: receipts, portals, no-reply senders. They get no tasks and no contacts. */
export function isAutomated(from: string, fromName: string, subject: string): boolean {
  return /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|postmaster/i.test(`${from} ${fromName}`) || /payment received|invoice #|receipt|delivery status notification|out of office|automatic reply/i.test(subject);
}
