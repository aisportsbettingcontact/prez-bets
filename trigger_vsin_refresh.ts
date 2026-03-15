/**
 * Trigger VSiN refresh directly to get latest betting splits for all sports.
 */
import dotenv from 'dotenv';
dotenv.config();

import { runVsinRefresh } from './server/vsinAutoRefresh';

async function main() {
  console.log('=== Triggering VSiN Refresh ===\n');
  console.log('Fetching VSiN betting splits for NCAAM, NBA, and NHL...\n');
  
  try {
    const result = await runVsinRefresh();
    console.log('\n=== VSiN Refresh Result ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('VSiN refresh failed:', err);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
