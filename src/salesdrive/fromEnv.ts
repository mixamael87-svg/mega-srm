import { createSalesDriveClient, type SalesDriveClient } from './client';
import { createMockSalesDrive } from './mock';

let cached: SalesDriveClient | undefined;

/** SalesDrive client from env; SALESDRIVE_MOCK=1 → in-memory demo data (e2e/dev without API key). */
export function salesDrive(): SalesDriveClient {
  if (cached) return cached;
  if (process.env.SALESDRIVE_MOCK === '1') return (cached = createMockSalesDrive());
  const baseUrl = process.env.SALESDRIVE_BASE_URL, apiKey = process.env.SALESDRIVE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('SALESDRIVE_BASE_URL and SALESDRIVE_API_KEY must be set');
  return (cached = createSalesDriveClient({ baseUrl, apiKey, catalogYmlUrl: process.env.SALESDRIVE_YML_URL || undefined }));
}
