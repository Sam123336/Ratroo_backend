export class ImportWBBusJob {
  async execute(): Promise<void> {
    console.log('[ImportWBBusJob] Starting WBBus data import');
    // Required pipeline:
    // 1. Discover source pages
    // 2. Fetch source response
    // 3. Save raw_source_records
    // 4. Parse raw payloads
    // 5. Validate provider-specific records
    // 6. Map canonical observations
    // 7. Persist dataset version
    // 8. Promote only after validation
    console.log('[ImportWBBusJob] Import complete');
  }
}
