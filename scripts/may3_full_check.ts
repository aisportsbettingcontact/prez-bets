import { listGamesByDate } from '../server/db';

async function main() {
  const mlb = await listGamesByDate('2026-05-03', 'MLB');
  const nhl = await listGamesByDate('2026-05-03', 'NHL');

  console.log('=== MLB May 3 (' + mlb.length + ' games) ===');
  for (const g of mlb) {
    console.log(
      `[${g.id}] ${g.awayTeam}@${g.homeTeam}` +
      ` | time=${g.startTimeEst}` +
      ` | RL=${g.awayBookSpread} total=${g.bookTotal} ml=${g.awayML}/${g.homeML}` +
      ` | spreadOdds=${g.awaySpreadOdds}/${g.homeSpreadOdds} O/U=${g.overOdds}/${g.underOdds}` +
      ` | RL_bets=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}%` +
      ` | Tot_bets=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}%` +
      ` | ML_bets=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}%` +
      ` | modelRun=${g.modelRunAt ? 'YES' : 'NO'}` +
      ` | published=${g.publishedToFeed}` +
      ` | pitcher=${g.awayStartingPitcher ?? 'TBD'}/${g.homeStartingPitcher ?? 'TBD'}`
    );
  }
  console.log('=== NHL May 3 (' + nhl.length + ' games) ===');
  for (const g of nhl) {
    console.log(
      `[${g.id}] ${g.awayTeam}@${g.homeTeam}` +
      ` | time=${g.startTimeEst}` +
      ` | PL=${g.awayBookSpread} total=${g.bookTotal} ml=${g.awayML}/${g.homeML}` +
      ` | spreadOdds=${g.awaySpreadOdds}/${g.homeSpreadOdds} O/U=${g.overOdds}/${g.underOdds}` +
      ` | PL_bets=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}%` +
      ` | Tot_bets=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}%` +
      ` | ML_bets=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}%` +
      ` | modelRun=${g.modelRunAt ? 'YES' : 'NO'}` +
      ` | published=${g.publishedToFeed}`
    );
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
