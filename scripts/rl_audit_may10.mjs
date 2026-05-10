import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  const [rows] = await db.execute(
    `SELECT id, awayTeam, homeTeam,
      awayBookSpread, awayModelSpread, homeBookSpread, homeModelSpread,
      modelAwaySpreadOdds, modelHomeSpreadOdds,
      spreadDiff, spreadEdge, modelRunAt
    FROM games WHERE gameDate='2026-05-10' AND sport='MLB' ORDER BY id`
  );
  let inverted = 0;
  for (const r of rows) {
    const bk = parseFloat(r.awayBookSpread);
    const mdl = parseFloat(r.awayModelSpread);
    const hasData = r.awayModelSpread !== null && r.awayBookSpread !== null;
    const signMatch = (bk > 0 && mdl > 0) || (bk < 0 && mdl < 0) || (bk === 0 && mdl === 0);
    const flag = (hasData && !signMatch) ? ' ← INVERTED' : '';
    if (flag) inverted++;
    console.log(`${r.awayTeam}@${r.homeTeam}: bookAway=${r.awayBookSpread} mdlAway=${r.awayModelSpread} | spreadDiff=${r.spreadDiff} spreadEdge=${r.spreadEdge}${flag}`);
  }
  console.log(`\nTotal: ${rows.length} games, ${inverted} inverted`);
  await db.end();
}
main().catch(console.error);
