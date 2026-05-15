/**
 * audit_phi_bos3.mjs — correct column names from schema
 */
import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

const [[row]] = await db.execute(`SELECT * FROM games WHERE id = 2250616`);

if (!row) { console.log('Game not found'); await db.end(); process.exit(1); }

// Print ALL fields
console.log('\n[ALL FIELDS for PHI@BOS id=2250616]');
for (const [k, v] of Object.entries(row)) {
  if (v !== null && v !== undefined) {
    console.log(`  ${k} = ${v}`);
  }
}

console.log('\n[NULL/UNDEFINED FIELDS]');
for (const [k, v] of Object.entries(row)) {
  if (v === null || v === undefined) {
    console.log(`  ${k} = NULL`);
  }
}

await db.end();
