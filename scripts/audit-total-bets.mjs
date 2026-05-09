const bets = [
  { id: 30101, away: 1, home: 6, side: 'UNDER', line: 7.5, stored: 'WIN' },
  { id: 30102, away: 3, home: 0, side: 'UNDER', line: 7.5, stored: 'WIN' },
  { id: 30104, away: 4, home: 2, side: 'OVER', line: 7.5, stored: 'LOSS' },
  { id: 30105, away: 4, home: 1, side: 'OVER', line: 8.5, stored: 'LOSS' },
  { id: 30096, away: 0, home: 3, side: 'UNDER', line: 7.5, stored: 'WIN' },
  { id: 30075, away: 10, home: 4, side: 'OVER', line: 8.0, stored: 'WIN' },
  { id: 30070, away: 2, home: 6, side: 'OVER', line: 9.0, stored: 'LOSS' },
  { id: 30071, away: 4, home: 1, side: 'UNDER', line: 9.5, stored: 'WIN' },
  { id: 30064, away: 2, home: 4, side: 'OVER', line: 8.0, stored: 'LOSS' },
  { id: 30058, away: 8, home: 5, side: 'UNDER', line: 9.0, stored: 'LOSS' },
  { id: 30051, away: 5, home: 4, side: 'UNDER', line: 9.5, stored: 'WIN' },
  { id: 30052, away: 5, home: 6, side: 'UNDER', line: 9.0, stored: 'LOSS' },
  { id: 30054, away: 1, home: 2, side: 'OVER', line: 8.5, stored: 'LOSS' },
  { id: 30045, away: 1, home: 13, side: 'UNDER', line: 7.0, stored: 'LOSS' },
  { id: 30010, away: 8, home: 3, side: 'UNDER', line: 9.0, stored: 'LOSS' },
];

let correct = 0, wrong = 0;
for (const b of bets) {
  const total = b.away + b.home;
  let grade;
  if (b.side === 'OVER') {
    grade = total > b.line ? 'WIN' : total < b.line ? 'LOSS' : 'PUSH';
  } else {
    grade = total < b.line ? 'WIN' : total > b.line ? 'LOSS' : 'PUSH';
  }
  const ok = grade === b.stored;
  if (ok) {
    console.log(`PASS BET ${b.id}: total=${total} ${b.side} ${b.line} => ${grade}`);
    correct++;
  } else {
    console.log(`FAIL BET ${b.id}: total=${total} ${b.side} ${b.line} => computed=${grade} stored=${b.stored}`);
    wrong++;
  }
}
console.log(`\nSUMMARY: ${correct} correct, ${wrong} wrong out of ${bets.length} TOTAL bets`);
