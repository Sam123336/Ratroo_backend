export { AgencyModel } from './agency.model';
export { RouteModel } from './route.model';
export { StopModel } from './stop.model';
export { StopTimeModel } from './stop-time.model';
export { TripModel } from './trip.model';

import { AgencyModel } from './agency.model';
import { RouteModel } from './route.model';
import { StopModel } from './stop.model';
import { StopTimeModel } from './stop-time.model';
import { TripModel } from './trip.model';

export const TRANSIT_SEQUELIZE_MODELS = [
  AgencyModel,
  StopModel,
  RouteModel,
  TripModel,
  StopTimeModel,
];
