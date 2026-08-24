import { ServiceUnavailableException } from '@nestjs/common';

/**
 * TeleCMI PIOPIY outbound calling, India leg.
 *
 * One job: ring a number, then bridge a second number into the same call. Both
 * ends see the Ratroo caller ID, so neither party learns the other's number.
 *
 * https://rest.telecmi.com/v2/ind_pcmo_make_call
 */
const ENDPOINT = 'https://rest.telecmi.com/v2/ind_pcmo_make_call';

/** Hang up a bridged call after this long. Nobody needs an hour-long leg open. */
const MAX_CALL_SECONDS = 600;

/** How long the second leg rings before TeleCMI gives up on it. */
const RING_SECONDS = 25;

/**
 * TeleCMI wants a bare 91-prefixed number, no plus. Riders and operators give
 * theirs with +91, a leading zero, spaces and dashes — all the same number, and
 * rejecting one over formatting drops a call we were asked to place.
 */
export function toTeleCmiNumber(phone: string): number {
  const digits = phone.replace(/\D/g, '');
  const local =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits;

  // Indian mobile numbers are ten digits opening 6–9. A landline or a typo
  // placed as a call costs money and reaches nobody.
  if (!/^[6-9]\d{9}$/.test(local)) {
    throw new Error(`Not an Indian mobile number: ${phone}`);
  }
  return Number(`91${local}`);
}

/**
 * Ring `to`, then bridge `connectTo` into the same call.
 *
 * Resolves once TeleCMI has accepted the request — the phone is still ringing
 * at that point, so the returned id is what identifies the call afterwards, not
 * proof anyone picked up.
 */
export async function bridgeCall(
  to: string,
  connectTo: string,
): Promise<{ requestId: string; status: string }> {
  const appid = Number(process.env.TELECMI_APP_ID);
  const secret = process.env.TELECMI_SECRET;
  const from = process.env.TELECMI_CALLER_ID;
  if (!appid || !secret || !from) {
    throw new ServiceUnavailableException(
      'TELECMI_APP_ID, TELECMI_SECRET and TELECMI_CALLER_ID must be set to place calls.',
    );
  }

  const callerId = toTeleCmiNumber(from);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      appid,
      secret,
      from: callerId,
      to: toTeleCmiNumber(to),
      pcmo: [
        {
          action: 'bridge',
          duration: MAX_CALL_SECONDS,
          timeout: RING_SECONDS,
          from: callerId,
          connect: [{ type: 'pstn', number: toTeleCmiNumber(connectTo) }],
        },
      ],
    }),
  });

  // TeleCMI reports failures both ways: an HTTP 420/422/502, and a `code` in an
  // otherwise 200 body. Trusting either alone silently swallows the other.
  const body = (await res.json().catch(() => null)) as
    | { status?: string; request_id?: string; code?: number; msg?: string }
    | null;
  if (!res.ok || body?.code !== 200 || !body.request_id) {
    throw new Error(
      `TeleCMI refused the call (HTTP ${res.status}, code ${body?.code ?? 'none'})` +
        `${body?.msg ? `: ${body.msg}` : ''}`,
    );
  }

  return { requestId: body.request_id, status: body.status ?? 'progress' };
}
