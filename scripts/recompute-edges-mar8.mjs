/**
 * Recompute spreadEdge, spreadDiff, totalEdge, totalDiff for all NCAAM March 8 games
 * Uses the same logic as PublishProjections.tsx computeEdges()
 * Does NOT modify any other fields.
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

function computeEdges(awayBookSpread, homeBookSpread, bookTotal, awayModelSpread, homeModelSpread, modelTotal, awayTeam, homeTeam) {
  const awayBook = parseFloat(awayBookSpread);
  const homeBook = parseFloat(homeBookSpread);
  const bookTot  = parseFloat(bookTotal);
  const awayN    = parseFloat(awayModelSpread);
  const homeN    = parseFloat(homeModelSpread);
  const totalN   = parseFloat(modelTotal);

  let spreadEdge = null;
  let spreadDiff = null;
  let totalEdge  = null;
  let totalDiff  = null;

  // Spread edge: which team has the bigger model vs book discrepancy?
  if (!isNaN(awayN) && !isNaN(homeN) && !isNaN(awayBook) && !isNaN(homeBook)) {
    // Positive diff = model is more favorable for that team vs book
    const awayDiff = awayBook - awayN;
    const homeDiff = homeBook - homeN;
    const useAway  = Math.abs(awayDiff) >= Math.abs(homeDiff);
    const bestDiff = useAway ? awayDiff : homeDiff;
    const edgeTeam   = useAway ? awayTeam : homeTeam;
    const edgeSpread = useAway ? awayN : homeN;

    if (Math.abs(bestDiff) > 0) {
      spreadEdge = `${edgeTeam} (${edgeSpread > 0 ? "+" : ""}${edgeSpread})`;
      spreadDiff = String(Math.round(Math.abs(bestDiff) * 10) / 10);
    } else {
      spreadEdge = "PASS";
      spreadDiff = "0";
    }
  }

  // Total edge: model vs book total
  if (!isNaN(totalN) && !isNaN(bookTot)) {
    const diff = Math.round((totalN - bookTot) * 10) / 10;
    if (diff > 0) {
      totalEdge = `OVER ${totalN}`;
      totalDiff = String(Math.abs(diff));
    } else if (diff < 0) {
      totalEdge = `UNDER ${totalN}`;
      totalDiff = String(Math.abs(diff));
    } else {
      totalEdge = "PASS";
      totalDiff = "0";
    }
  }

  return { spreadEdge, spreadDiff, totalEdge, totalDiff };
}

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  console.log("Connected to DB");

  // Fetch all NCAAM March 8 games that have model data
  const [rows] = await conn.execute(
    `SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, bookTotal,
            awayModelSpread, homeModelSpread, modelTotal
     FROM games
     WHERE gameDate = '2026-03-08'
       AND sport = 'NCAAM'
       AND awayModelSpread IS NOT NULL
     ORDER BY startTimeEst`
  );

  console.log(`Found ${rows.length} games with model data`);

  let updated = 0;
  for (const row of rows) {
    const edges = computeEdges(
      row.awayBookSpread, row.homeBookSpread, row.bookTotal,
      row.awayModelSpread, row.homeModelSpread, row.modelTotal,
      row.awayTeam, row.homeTeam
    );

    await conn.execute(
      `UPDATE games SET spreadEdge = ?, spreadDiff = ?, totalEdge = ?, totalDiff = ? WHERE id = ?`,
      [edges.spreadEdge, edges.spreadDiff, edges.totalEdge, edges.totalDiff, row.id]
    );

    console.log(`  ${row.awayTeam} vs ${row.homeTeam}: spread=${edges.spreadEdge} (${edges.spreadDiff}), total=${edges.totalEdge} (${edges.totalDiff})`);
    updated++;
  }

  await conn.end();
  console.log(`\nDone. Updated edges for ${updated} games.`);
}

main().catch(console.error);
