export class ImportWBBusJob {
  async execute(): Promise<void> {
    console.log('[ImportWBBusJob] Starting WBBus data import');
    // 1. Fetch WBBus HTML pages via client
    // 2. Parse HTML into raw models
    // 3. Map to canonical model
    // 4. Save via repository
    console.log('[ImportWBBusJob] Import complete');
  }
}
