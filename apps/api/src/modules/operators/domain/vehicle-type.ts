/**
 * What is actually carrying passengers.
 *
 * Wider than the transit `routeType` (BUS/RAIL/FERRY/TRAM/METRO) on purpose:
 * the operators who will register here are the ones the scrapers never cover —
 * a man with three autos on a village route, a shared-taxi stand, an
 * e-rickshaw circuit. Those are real services riders take, and until now the
 * app had no way to represent them at all.
 */
export enum VehicleType {
  BUS = 'BUS',
  MINIBUS = 'MINIBUS',
  AUTO = 'AUTO',
  E_RICKSHAW = 'E_RICKSHAW',
  SHARED_TAXI = 'SHARED_TAXI',
  FERRY = 'FERRY',
  TRAM = 'TRAM',
}
