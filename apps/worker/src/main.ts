export async function bootstrap() {
  console.log('[Worker] Transit import worker initialized');
  console.log('[Worker] Ingestion policy: discover -> fetch -> save raw -> parse -> validate -> map -> version -> promote');
}
