/**
 * Whether an operator's data may reach riders.
 *
 * Anyone can register; nothing they submit is published until a human has
 * checked they are who they say they are. Owner-supplied data outranks scraped
 * data once trusted, so the trust decision has to be explicit — an unverified
 * stranger must not be able to overwrite a real operator's timetable.
 */
export enum OperatorStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  SUSPENDED = 'SUSPENDED',
}

/** Whether a route belonging to this operator may be published to riders. */
export function canPublish(status: OperatorStatus): boolean {
  return status === OperatorStatus.VERIFIED;
}
