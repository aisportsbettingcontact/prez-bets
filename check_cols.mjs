import mysql from 'mysql2/promise';

const needed = ['id','fileId','gameDate','startTimeEst','awayTeam','awayBookSpread','awayModelSpread','homeTeam','homeBookSpread','homeModelSpread','bookTotal','modelTotal','spreadEdge','spreadDiff','totalEdge','totalDiff','sport','gameType','conference','publishedToFeed','publishedModel','spreadAwayBetsPct','spreadAwayMoneyPct','totalOverBetsPct','totalOverMoneyPct','mlAwayBetsPct','mlAwayMoneyPct','awayML','homeML','awaySpreadOdds','homeSpreadOdds','overOdds','underOdds','openAwaySpread','openAwaySpreadOdds','openHomeSpread','openHomeSpreadOdds','openTotal','openOverOdds','openUnderOdds','openAwayML','openHomeML','modelAwayML','modelHomeML','modelAwayScore','modelHomeScore','modelOverRate','modelUnderRate','modelAwaySpreadOdds','modelHomeSpreadOdds','modelAwayWinPct','modelHomeWinPct','modelSpreadClamped','modelTotalClamped','modelCoverDirection','modelRunAt','rotNums','sortOrder','ncaaContestId','bracketGameId','bracketRound','bracketRegion','bracketSlot','nextBracketGameId','nextBracketSlot','gameStatus','awayScore','homeScore','gameClock','awayGoalie','homeGoalie','awayGoalieConfirmed','homeGoalieConfirmed','modelAwayPLCoverPct','modelHomePLCoverPct','modelAwayPuckLine','modelHomePuckLine','modelAwayPLOdds','modelHomePLOdds','modelOverOdds','modelUnderOdds','createdAt'];

const c = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await c.query('SHOW COLUMNS FROM games');
const existing = new Set(rows.map(r => r.Field));
const missing = needed.filter(n => !existing.has(n));
console.log('Missing columns:', missing.length > 0 ? missing : 'NONE');
await c.end();
