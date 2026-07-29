export class Transfer {
  constructor(
    public readonly fromStopId: string,
    public readonly toStopId: string,
    public readonly distanceMeters: number,
    public readonly durationSeconds: number,
    public readonly mode: 'WALKING' | 'BUS' | 'METRO' | 'TRAIN' | 'AUTO',
  ) {}

  get isWalkable(): boolean {
    return this.distanceMeters <= 2000;
  }
}
