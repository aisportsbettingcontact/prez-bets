import { refreshAnApiOdds } from '../server/vsinAutoRefresh';

async function main() {
  console.log('[RefreshOdds] Triggering AN API odds refresh for 2026-05-03 MLB + NHL...');
  const result = await refreshAnApiOdds('2026-05-03', ['mlb', 'nhl'], 'manual');
  console.log('[RefreshOdds] Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(e => { console.error('[RefreshOdds] ERROR:', e); process.exit(1); });
