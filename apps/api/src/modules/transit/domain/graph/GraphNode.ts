export interface GraphNode {
  id: string;
  type: 'STOP' | 'STATION' | 'INTERCHANGE';
  coordinates: {
    lat: number;
    lng: number;
  };
  properties: Record<string, unknown>;
}
