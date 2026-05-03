import { listGamesByDate } from '../server/db';

async function main() {
  const mlb = await listGamesByDate('2026-05-03', 'MLB');
  const nhl = await listGamesByDate('2026-05-03', 'NHL');

  console.log('=== MLB May 3 (' + mlb.length + ' games) ===');
  for (const g of mlb) {
    console.log(
      `${g.awayTeam}@${g.homeTeam} | time=${g.gameTime} | spread=${g.bookSpreadAway} total=${g.bookTotal} ml=${g.bookMoneyAway}/${g.bookMoneyHome}` +
      ` | RL_bets=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% | Tot_bets=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}%` +
      ` | ML_bets=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}% | published=${g.projectionPublished}`
    );
  }
  console.log('=== NHL May 3 (' + nhl.length + ' games) ===');
  for (const g of nhl) {
    console.log(
      `${g.awayTeam}@${g.homeTeam} | time=${g.gameTime} | spread=${g.bookSpreadAway} total=${g.bookTotal} ml=${g.bookMoneyAway}/${g.bookMoneyHome}` +
      ` | puck_bets=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% | Tot_bets=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}%` +
      ` | ML_bets=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}% | published=${g.projectionPublished}`
    );
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
