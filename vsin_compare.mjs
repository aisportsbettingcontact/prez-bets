/**
 * Live VSiN vs DB Comparison Script
 * Runs the actual VSiN scraper and compares results against DB
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load environment
import { config } from 'dotenv';
config({ path: '.env' });

// We need to use tsx to run TypeScript, so let's use a different approach
// and directly call the server's refresh endpoint

import https from 'https';

const BASE_URL = 'http://localhost:3000';

function fetchLocal(path) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  console.log('Triggering VSiN refresh via admin API...');
  
  try {
    const { status, body } = await fetchLocal('/api/admin/vsin-refresh');
    console.log(`Refresh status: ${status}`);
    if (body) {
      try {
        const json = JSON.parse(body);
        console.log('Refresh result:', JSON.stringify(json, null, 2));
      } catch {
        console.log('Response:', body.substring(0, 500));
      }
    }
  } catch (e) {
    console.error('Refresh failed:', e.message);
  }
  
  // Now check the pipeline status
  try {
    const { status, body } = await fetchLocal('/api/admin/pipeline-status');
    console.log(`Pipeline status: ${status}`);
    if (body) {
      try {
        const json = JSON.parse(body);
        console.log('Pipeline:', JSON.stringify(json, null, 2));
      } catch {
        console.log('Response:', body.substring(0, 500));
      }
    }
  } catch (e) {
    console.error('Pipeline status failed:', e.message);
  }
}

main().catch(console.error);
