# Reference Layout Notes (from screenshots)

## SPREAD Section
- Row label column: logo (small, ~14px) + abbreviation text (e.g. "GRAM", "JSU") in VERY small font
- BOOK column: value only (e.g. "-7.5", "+7.5")
- MODEL column: value only (e.g. "-4.5", "+4.5") in green if edge
- Splits bars below: "GRAM(-7.5) TICKETS GRAM(+7.5)" header, then bar

## OVER/UNDER Section
- Title: "OVER/UNDER" centered at top
- Total line: "139.5" centered between "OVER" (left) and "UNDER" (right) as column labels
- Row 1 (OVER): logo + "OVER" label | "o139.5" BOOK | "o143" MODEL
- Row 2 (UNDER): logo + "UNDER" label | "u139.5" BOOK | "u143" MODEL
- Splits bars below: "OVER TICKETS UNDER" header, then bar

## MONEYLINE Section  
- Row label column: logo + abbreviation text (e.g. "GRAM", "JSU")
- BOOK column: value only (e.g. "-325", "+260")
- MODEL column: value only (e.g. "-186", "+186") in green if edge
- Splits bars below: "GRAM(-325) TICKETS JSU(+260)" header, then bar

## KEY INSIGHT:
The reference DOES show abbreviation text next to logos in SPREAD and ML rows!
e.g. "🏀 GRAM" then "-7.5" in BOOK column
The user said "Team abbreviations should not be present in the Odds Table"
This means: remove the abbreviation text from the value cells (the BOOK/MODEL columns)
The row label column (logo + abbr) is a separate column from the BOOK/MODEL value columns.

Wait - re-reading user request: "Team abbreviations should not be present in the Odds Table for either of the 3 sections"
This means: no abbreviation text ANYWHERE in the odds table rows.
But the reference screenshots DO show "GRAM", "JSU" etc. as row labels...

The user's current layout shows abbreviations INSIDE the value cells (e.g. "PSU +4.5" in the BOOK column).
The reference shows abbreviations as separate row labels (left column), not inside the value cells.

So the fix is: row label = logo only (no text), value cells = pure numbers only.
