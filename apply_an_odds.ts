/**
 * Script to apply Action Network odds from downloaded HTML files to the database.
 * Run with: npx tsx apply_an_odds.ts
 */
import { readFileSync } from 'fs';
import { parseAnAllMarketsHtml, type AnSport } from './server/anHtmlParser';
import { listGamesByDate, updateAnOdds } from './server/db';
import { NCAAM_TEAMS } from './shared/ncaamTeams';
import { NBA_TEAMS } from './shared/nbaTeams';
import { NHL_TEAMS } from './shared/nhlTeams';

const GAME_DATE = '2026-03-14';

async function ingestSport(htmlPath: string, sport: 'NCAAM' | 'NBA' | 'NHL') {
  const html = readFileSync(htmlPath, 'utf-8');
  const anSport: AnSport = sport === 'NBA' ? 'nba' : sport === 'NHL' ? 'nhl' : 'ncaab';
  const parseResult = parseAnAllMarketsHtml(html, anSport);
  
  console.log(`\n=== ${sport} ===`);
  console.log(`Parsed ${parseResult.games.length} games from AN HTML`);
  if (parseResult.warnings.length) {
    console.log('Warnings:', parseResult.warnings);
  }

  // Build URL-slug → dbSlug lookup
  const byNormSlug = new Map<string, string>();
  
  if (sport === 'NCAAM') {
    const NCAAM_URL_ALIASES: Record<string, string> = {
      'wichita-state': 'wichita_st',
      'san-diego-state': 'san_diego_st',
      'utah-state': 'utah_st',
      'prairie-view-am': 'prairie_view_a_and_m',
      'southern-university': 'southern_u',
      'kennesaw-state': 'kennesaw_st',
      'north-carolina-central': 'nc_central',
      'cal-baptist': 'california_baptist',
      'utah-valley': 'utah_valley',
      'penn': 'pennsylvania',
      'ole-miss': 'mississippi',
      'uconn': 'connecticut',
      'vcu': 'va_commonwealth',
      'big-red': 'cornell',
      'catamounts': 'vermont',
      'retrievers': 'umbc',
      'crimson': 'harvard',
      'hawks': 'saint_josephs',
      'rebels': 'ole_miss',
      'cougars': 'houston',
      'wildcats': 'kentucky',
      'aztecs': 'san_diego_st',
      'aggies': 'new_mexico_st',
      'badgers': 'wisconsin',
      '49ers': 'charlotte',
      'golden-hurricane': 'tulsa',
      'eagles': 'eastern_michigan',
      'bison': 'north_dakota_st',
      'billikens': 'saint_louis',
      'bruins': 'ucla',
      'purdue': 'purdue',
    };
    for (const [alias, dbSlug] of Object.entries(NCAAM_URL_ALIASES)) {
      byNormSlug.set(alias, dbSlug);
    }
    for (const t of NCAAM_TEAMS) {
      byNormSlug.set(t.dbSlug.replace(/_/g, '-'), t.dbSlug);
      byNormSlug.set(t.ncaaSlug, t.dbSlug);
      byNormSlug.set(t.vsinSlug, t.dbSlug);
      byNormSlug.set(t.anSlug, t.dbSlug);
    }
  } else if (sport === 'NBA') {
    const NBA_URL_ALIASES: Record<string, string> = {
      'wizards': 'washington_wizards',
      'celtics': 'boston_celtics',
      'magic': 'orlando_magic',
      'heat': 'miami_heat',
      'nets': 'brooklyn_nets',
      '76ers': 'philadelphia_76ers',
      'bucks': 'milwaukee_bucks',
      'hawks': 'atlanta_hawks',
      'hornets': 'charlotte_hornets',
      'spurs': 'san_antonio_spurs',
      'nuggets': 'denver_nuggets',
      'lakers': 'los_angeles_lakers',
      'kings': 'sacramento_kings',
      'clippers': 'los_angeles_clippers',
    };
    for (const [alias, dbSlug] of Object.entries(NBA_URL_ALIASES)) {
      byNormSlug.set(alias, dbSlug);
    }
    for (const t of NBA_TEAMS) {
      byNormSlug.set(t.dbSlug.replace(/_/g, '-'), t.dbSlug);
      byNormSlug.set(t.anSlug, t.dbSlug);
      byNormSlug.set(t.vsinSlug, t.dbSlug);
    }
  } else if (sport === 'NHL') {
    const NHL_URL_ALIASES: Record<string, string> = {
      'penguins': 'pittsburgh_penguins',
      'utah': 'utah_mammoth',
      'mammoth': 'utah_mammoth',
      'utah-hockey-club': 'utah_mammoth',
      'blackhawks': 'chicago_blackhawks',
      'golden-knights': 'vegas_golden_knights',
      'kraken': 'seattle_kraken',
      'canucks': 'vancouver_canucks',
      'rangers': 'new_york_rangers',
      'wild': 'minnesota_wild',
      'kings': 'los_angeles_kings',
      'devils': 'new_jersey_devils',
      'sharks': 'san_jose_sharks',
      'canadiens': 'montreal_canadiens',
      'hurricanes': 'carolina_hurricanes',
      'lightning': 'tampa_bay_lightning',
      'maple-leafs': 'toronto_maple_leafs',
      'sabres': 'buffalo_sabres',
      'flames': 'calgary_flames',
      'islanders': 'new_york_islanders',
      'blue-jackets': 'columbus_blue_jackets',
      'flyers': 'philadelphia_flyers',
      'red-wings': 'detroit_red_wings',
      'stars': 'dallas_stars',
      'ducks': 'anaheim_ducks',
      'senators': 'ottawa_senators',
      'bruins': 'boston_bruins',
      'capitals': 'washington_capitals',
      'avalanche': 'colorado_avalanche',
      'jets': 'winnipeg_jets',
      'oilers': 'edmonton_oilers',
      'predators': 'nashville_predators',
      'blues': 'st_louis_blues',
      'panthers': 'florida_panthers',
    };
    for (const [alias, dbSlug] of Object.entries(NHL_URL_ALIASES)) {
      byNormSlug.set(alias, dbSlug);
    }
    for (const t of NHL_TEAMS) {
      byNormSlug.set(t.dbSlug.replace(/_/g, '-'), t.dbSlug);
      byNormSlug.set(t.anSlug, t.dbSlug);
      byNormSlug.set(t.vsinSlug, t.dbSlug);
      byNormSlug.set(t.nhlSlug, t.dbSlug);
    }
  }

  function splitCombinedSlug(combined: string): [string, string] | null {
    const parts = combined.split('-');
    for (let i = 1; i < parts.length; i++) {
      const awayPart = parts.slice(0, i).join('-');
      const homePart = parts.slice(i).join('-');
      if (byNormSlug.has(awayPart) && byNormSlug.has(homePart)) {
        return [byNormSlug.get(awayPart)!, byNormSlug.get(homePart)!];
      }
    }
    return null;
  }

  // Load existing DB games for the date
  const existingGames = await listGamesByDate(GAME_DATE, sport);
  console.log(`DB games for ${GAME_DATE}: ${existingGames.length}`);

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const slugErrors: string[] = [];

  for (const g of parseResult.games) {
    // Extract combined slug from game URL
    const urlParts = g.gameUrl.split('/');
    const gamePart = urlParts[2] || '';
    const combined = gamePart.replace(/-score-odds-.*$/, '');
    const slugMatch = splitCombinedSlug(combined);
    if (!slugMatch) {
      const msg = `NO_SLUG: cannot split "${combined}" (${g.awayName} @ ${g.homeName})`;
      errors.push(msg);
      slugErrors.push(combined);
      console.warn(`  ✗ ${msg}`);
      skipped++;
      continue;
    }
    const [awayDbSlug, homeDbSlug] = slugMatch;
    const dbGame = existingGames.find(
      (e) => e.awayTeam === awayDbSlug && e.homeTeam === homeDbSlug
    );
    if (!dbGame) {
      const msg = `NO_MATCH: ${awayDbSlug} @ ${homeDbSlug} (${g.awayName} @ ${g.homeName})`;
      errors.push(msg);
      console.warn(`  ✗ ${msg}`);
      skipped++;
      continue;
    }

    await updateAnOdds(dbGame.id, {
      openAwaySpread: g.openAwaySpread?.line ?? null,
      openAwaySpreadOdds: g.openAwaySpread?.juice ?? null,
      openHomeSpread: g.openHomeSpread?.line ?? null,
      openHomeSpreadOdds: g.openHomeSpread?.juice ?? null,
      openTotal: g.openOver?.line?.replace(/^[ou]/i, '') ?? null,
      openOverOdds: g.openOver?.juice ?? null,
      openUnderOdds: g.openUnder?.juice ?? null,
      openAwayML: g.openAwayML?.line ?? null,
      openHomeML: g.openHomeML?.line ?? null,
      awayBookSpread: g.dkAwaySpread?.line ?? null,
      awaySpreadOdds: g.dkAwaySpread?.juice ?? null,
      homeBookSpread: g.dkHomeSpread?.line ?? null,
      homeSpreadOdds: g.dkHomeSpread?.juice ?? null,
      bookTotal: g.dkOver?.line?.replace(/^[ou]/i, '') ?? null,
      overOdds: g.dkOver?.juice ?? null,
      underOdds: g.dkUnder?.juice ?? null,
      awayML: g.dkAwayML?.line ?? null,
      homeML: g.dkHomeML?.line ?? null,
    });
    updated++;
    console.log(
      `  ✓ ${awayDbSlug} @ ${homeDbSlug} | spread=${g.dkAwaySpread?.line}/${g.dkHomeSpread?.line} total=${g.dkOver?.line} ml=${g.dkAwayML?.line}/${g.dkHomeML?.line}`
    );
  }

  console.log(`\nResult: updated=${updated} skipped=${skipped} errors=${errors.length}`);
  if (errors.length) {
    console.log('Errors:');
    errors.forEach(e => console.log('  -', e));
  }
  return { updated, skipped, errors };
}

async function main() {
  console.log('Applying Action Network odds for', GAME_DATE);
  
  await ingestSport('/home/ubuntu/Downloads/ncaab_all_markets.html', 'NCAAM');
  await ingestSport('/home/ubuntu/Downloads/nba_all_markets.html', 'NBA');
  await ingestSport('/home/ubuntu/Downloads/nhl_all_markets.html', 'NHL');
  
  console.log('\n=== DONE ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
