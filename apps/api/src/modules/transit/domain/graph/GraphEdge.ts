export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  weight: number;
  mode: string;
  properties: Record<string, unknown>;
}
