/**
 * backfillHrFactor.mjs
 * One-time script to populate mlb_park_factors.hrFactor from the
 * PARK_FACTORS dict in MLBAIModel.py.
 *
 * Run: node server/backfillHrFactor.mjs
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

// DB_TO_RETRO mapping (mirrors MLBAIModel.py)
const DB_TO_RETRO = {
  PIT: "PIT", NYM: "NYN", CWS: "CHA", MIL: "MIL", WSH: "WAS",
  CHC: "CHN", NYY: "NYA", SF: "SFN", LAD: "LAN", SD: "SDN",
  STL: "STL", TB: "TBA", PHI: "PHI", HOU: "HOU", DET: "DET",
  ARI: "ARI", SEA: "SEA", CLE: "CLE", MIN: "MIN", BAL: "BAL",
  BOS: "BOS", CIN: "CIN", LAA: "ANA", TEX: "TEX", ATL: "ATL",
  COL: "COL", KC: "KCA", TOR: "TOR", ATH: "OAK", OAK: "OAK", MIA: "MIA",
};

// PARK_FACTORS from MLBAIModel.py (hr values / 100.0)
const PARK_FACTORS = {
  COL: { r: 113, hr: 119 }, BOS: { r: 105, hr: 103 }, CIN: { r: 105, hr: 108 },
  PHI: { r: 104, hr: 106 }, NYA: { r: 104, hr: 108 }, BAL: { r: 103, hr: 107 },
  TEX: { r: 103, hr: 105 }, HOU: { r: 102, hr: 101 }, MIL: { r: 102, hr: 103 },
  ARI: { r: 102, hr: 104 }, ATL: { r: 101, hr: 102 }, LAN: { r: 100, hr: 99  },
  CHN: { r: 100, hr: 101 }, SFN: { r: 99,  hr: 97  }, STL: { r: 99,  hr: 98  },
  NYN: { r: 99,  hr: 99  }, SDN: { r: 98,  hr: 96  }, MIN: { r: 98,  hr: 99  },
  DET: { r: 98,  hr: 97  }, CLE: { r: 97,  hr: 95  }, SEA: { r: 97,  hr: 94  },
  TBA: { r: 97,  hr: 96  }, CHA: { r: 97,  hr: 96  }, PIT: { r: 97,  hr: 95  },
  KCA: { r: 96,  hr: 94  }, WAS: { r: 96,  hr: 95  }, MIA: { r: 95,  hr: 92  },
  OAK: { r: 95,  hr: 93  }, TOR: { r: 100, hr: 100 }, ANA: { r: 99,  hr: 98  },
};

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log("[INPUT] Connected to DB");

  // Fetch all park factor rows
  const [rows] = await conn.execute("SELECT id, teamAbbrev FROM mlb_park_factors");
  console.log(`[STATE] Found ${rows.length} park factor rows`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const dbAbbrev = row.teamAbbrev;
    const retroKey = DB_TO_RETRO[dbAbbrev] ?? dbAbbrev;
    const pf = PARK_FACTORS[retroKey];

    if (!pf) {
      console.log(`[SKIP] ${dbAbbrev} → retroKey=${retroKey} — no PARK_FACTORS entry`);
      skipped++;
      continue;
    }

    const hrFactor = pf.hr / 100.0;
    await conn.execute(
      "UPDATE mlb_park_factors SET hrFactor = ? WHERE id = ?",
      [hrFactor, row.id]
    );
    console.log(`[STEP] ${dbAbbrev} → retroKey=${retroKey} hrFactor=${hrFactor.toFixed(4)}`);
    updated++;
  }

  console.log(`[OUTPUT] Backfill complete: updated=${updated} skipped=${skipped}`);
  console.log(`[VERIFY] updated+skipped=${updated + skipped} === total=${rows.length}: ${updated + skipped === rows.length ? "PASS" : "FAIL"}`);
  await conn.end();
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
