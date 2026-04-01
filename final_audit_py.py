#!/usr/bin/env python3
"""
FINAL 365-TEAM DEEP AUDIT
Parses ncaamTeams.ts line-by-line to extract all team entries,
then validates each team's KenPom mapping, DB slug consistency, and cross-source accuracy.
"""

import re
from datetime import datetime

ALL_KENPOM = {
    'duke':'Duke','michigan':'Michigan','arizona':'Arizona','florida':'Florida','illinois':'Illinois',
    'houston':'Houston','iowa_st':'Iowa St.','purdue':'Purdue','michigan_st':'Michigan St.',
    'connecticut':'Connecticut','gonzaga':'Gonzaga','nebraska':'Nebraska','vanderbilt':'Vanderbilt',
    'louisville':'Louisville','tennessee':'Tennessee','texas_tech':'Texas Tech','alabama':'Alabama',
    'arkansas':'Arkansas','kansas':'Kansas','virginia':'Virginia','st_johns':"St. John's",
    'saint_marys':"Saint Mary's",'wisconsin':'Wisconsin','iowa':'Iowa','brigham_young':'BYU',
    'ohio_st':'Ohio St.','kentucky':'Kentucky','ucla':'UCLA','miami_fl':'Miami FL',
    'north_carolina':'North Carolina','georgia':'Georgia','villanova':'Villanova','texas':'Texas',
    'santa_clara':'Santa Clara','texas_am':'Texas A&M','utah_st':'Utah St.','nc_state':'N.C. State',
    'clemson':'Clemson','auburn':'Auburn','saint_louis':'Saint Louis','indiana':'Indiana',
    'cincinnati':'Cincinnati','smu':'SMU','tcu':'TCU','vcu':'VCU','oklahoma':'Oklahoma',
    'san_diego_st':'San Diego St.','baylor':'Baylor','new_mexico':'New Mexico','missouri':'Missouri',
    'seton_hall':'Seton Hall','south_florida':'South Florida','c_florida':'UCF','washington':'Washington',
    'boise_st':'Boise St.','virginia_tech':'Virginia Tech','west_virginia':'West Virginia','tulsa':'Tulsa',
    'stanford':'Stanford','grand_canyon':'Grand Canyon','akron':'Akron','lsu':'LSU',
    'arizona_st':'Arizona St.','colorado':'Colorado','florida_st':'Florida St.',
    'northwestern':'Northwestern','belmont':'Belmont','mcneese_st':'McNeese','oklahoma_st':'Oklahoma St.',
    'northern_iowa':'Northern Iowa','california':'California','minnesota':'Minnesota',
    'providence':'Providence','creighton':'Creighton','wake_forest':'Wake Forest','nevada':'Nevada',
    'usc':'USC','yale':'Yale','dayton':'Dayton','syracuse':'Syracuse','mississippi':'Mississippi',
    'butler':'Butler','george_washington':'George Washington','colorado_st':'Colorado St.',
    'marquette':'Marquette','georgetown':'Georgetown','hofstra':'Hofstra','wichita_st':'Wichita St.',
    'stephen_f_austin':'Stephen F. Austin','utah_valley':'Utah Valley','miami_oh':'Miami OH',
    'notre_dame':'Notre Dame','high_point':'High Point','george_mason':'George Mason',
    'south_carolina':'South Carolina','xavier':'Xavier','oregon':'Oregon','wyoming':'Wyoming',
    'pittsburgh':'Pittsburgh','mississippi_st':'Mississippi St.','kansas_st':'Kansas St.',
    'depaul':'DePaul','illinois_st':'Illinois St.','unlv':'UNLV','illinois_chicago':'Illinois Chicago',
    'uc_irvine':'UC Irvine','davidson':'Davidson','sam_houston_st':'Sam Houston St.',
    'st_thomas':'St. Thomas','unc_wilmington':'UNC Wilmington','pacific':'Pacific',
    'cal_baptist':'Cal Baptist','uc_san_diego':'UC San Diego','north_dakota_st':'North Dakota St.',
    'hawaii':'Hawaii','liberty':'Liberty','s_illinois':'Southern Illinois','seattle_u':'Seattle',
    'utrgv':'UT Rio Grande Valley','san_francisco':'San Francisco','murray_st':'Murray St.',
    'saint_josephs':"Saint Joseph's",'bradley':'Bradley','uab':'UAB','uc_santa_barbara':'UC Santa Barbara',
    'utah':'Utah','florida_atlantic':'Florida Atlantic','maryland':'Maryland','rutgers':'Rutgers',
    'memphis':'Memphis','fresno_st':'Fresno St.','montana_st':'Montana St.','duquesne':'Duquesne',
    'rhode_island':'Rhode Island','toledo':'Toledo','washington_st':'Washington St.',
    'penn_st':'Penn St.','wright_st':'Wright St.','north_texas':'North Texas',
    'northern_colorado':'Northern Colorado','portland_st':'Portland St.','navy':'Navy','troy':'Troy',
    'richmond':'Richmond','robert_morris':'Robert Morris','william_mary':'William & Mary',
    'bowling_green':'Bowling Green','arkansas_st':'Arkansas St.','harvard':'Harvard',
    'central_arkansas':'Central Arkansas','winthrop':'Winthrop','towson':'Towson',
    'kent_st':'Kent St.','boston_college':'Boston College','uc_davis':'UC Davis',
    'ut_arlington':'UT Arlington','cornell':'Cornell','valparaiso':'Valparaiso',
    'st_bonaventure':'St. Bonaventure','loyola_marymount':'Loyola Marymount','temple':'Temple',
    'penn':'Penn','georgia_tech':'Georgia Tech','idaho':'Idaho',
    'east_tennessee_st':'East Tennessee St.','western_kentucky':'Western Kentucky','fordham':'Fordham',
    'cal_st_fullerton':'Cal St. Fullerton','oakland':'Oakland','middle_tennessee':'Middle Tennessee',
    'charleston':'Charleston','merrimack':'Merrimack','austin_peay':'Austin Peay',
    'texas_am_corpus_christi':'Texas A&M Corpus Chris','oregon_st':'Oregon St.',
    'northern_kentucky':'Northern Kentucky','csun':'CSUN','monmouth':'Monmouth',
    'kennesaw_st':'Kennesaw St.','campbell':'Campbell','montana':'Montana','queens_nc':'Queens',
    'utah_tech':'Utah Tech','new_mexico_st':'New Mexico St.','tennessee_st':'Tennessee St.',
    'furman':'Furman','columbia':'Columbia','mercer':'Mercer','florida_intl':'FIU',
    'new_orleans':'New Orleans','charlotte':'Charlotte','appalachian_st':'Appalachian St.',
    'weber_st':'Weber St.','drake':'Drake','siena':'Siena','portland':'Portland','lipscomb':'Lipscomb',
    'umbc':'UMBC','indiana_st':'Indiana St.','massachusetts':'Massachusetts','howard':'Howard',
    'marist':'Marist','jacksonville_st':'Jacksonville St.','marshall':'Marshall',
    'south_alabama':'South Alabama','buffalo':'Buffalo','louisiana_tech':'Louisiana Tech',
    'green_bay':'Green Bay','tulane':'Tulane','cal_poly':'Cal Poly','samford':'Samford',
    'james_madison':'James Madison','missouri_st':'Missouri St.','tarleton_st':'Tarleton St.',
    'youngstown_st':'Youngstown St.','liu':'LIU','quinnipiac':'Quinnipiac',
    'southern_miss':'Southern Miss','detroit_mercy':'Detroit Mercy','south_dakota_st':'South Dakota St.',
    'drexel':'Drexel','tennessee_martin':'Tennessee Martin','san_diego':'San Diego','la_salle':'La Salle',
    'rice':'Rice','ohio':'Ohio','stony_brook':'Stony Brook','w_carolina':'Western Carolina',
    'elon':'Elon','southeast_missouri':'Southeast Missouri','vermont':'Vermont',
    'long_beach_st':'Long Beach St.','denver':'Denver','georgia_southern':'Georgia Southern',
    'san_jose_st':'San Jose St.','nicholls_st':'Nicholls','bethune_cookman':'Bethune Cookman',
    'lamar':'Lamar','eastern_michigan':'Eastern Michigan','american':'American',
    'charleston_southern':'Charleston Southern','florida_gulf_coast':'Florida Gulf Coast',
    'texas_st':'Texas St.','unc_asheville':'UNC Asheville','abilene_christian':'Abilene Christian',
    'coastal_carolina':'Coastal Carolina','old_dominion':'Old Dominion','idaho_st':'Idaho St.',
    'colgate':'Colgate','princeton':'Princeton','s_utah':'Southern Utah',
    'boston_university':'Boston University','wofford':'Wofford','east_carolina':'East Carolina',
    'saint_peters':"Saint Peter's",'siue':'SIUE','radford':'Radford','iona':'Iona',
    'uc_riverside':'UC Riverside','purdue_fort_wayne':'Purdue Fort Wayne',
    'nebraska_omaha':'Nebraska Omaha','pepperdine':'Pepperdine','fairfield':'Fairfield',
    'sacramento_st':'Sacramento St.','incarnate_word':'Incarnate Word','lindenwood':'Lindenwood',
    'milwaukee':'Milwaukee','presbyterian':'Presbyterian','central_michigan':'Central Michigan',
    'longwood':'Longwood','hampton':'Hampton','western_michigan':'Western Michigan',
    'dartmouth':'Dartmouth','southern_u':'Southern','north_dakota':'North Dakota','utep':'UTEP',
    'mount_st_marys':"Mount St. Mary's",'bellarmine':'Bellarmine','northwestern_st':'Northwestern St.',
    'south_dakota':'South Dakota','morehead_st':'Morehead St.','northeastern':'Northeastern',
    'mercyhurst':'Mercyhurst','southeastern_louisiana':'Southeastern Louisiana',
    'east_texas_am':'East Texas A&M','brown':'Brown','n_carolina_a_and_t':'North Carolina A&T',
    'houston_christian':'Houston Christian','lehigh':'Lehigh','ball_st':'Ball St.','delaware':'Delaware',
    'loyola_chicago':'Loyola Chicago','grambling_st':'Grambling St.','jacksonville':'Jacksonville',
    'sacred_heart':'Sacred Heart','eastern_kentucky':'Eastern Kentucky','le_moyne':'Le Moyne',
    'unc_greensboro':'UNC Greensboro','chattanooga':'Chattanooga','alabama_am':'Alabama A&M',
    'usc_upstate':'USC Upstate','stetson':'Stetson','west_georgia':'West Georgia','c_conn_st':'Central Connecticut',
    'wagner':'Wagner','evansville':'Evansville','texas_southern':'Texas Southern','little_rock':'Little Rock',
    'georgia_st':'Georgia St.','oral_roberts':'Oral Roberts','prairie_view_a_and_m':'Prairie View A&M',
    'la_lafayette':'Louisiana','tennessee_tech':'Tennessee Tech','florida_a_and_m':'Florida A&M',
    'arkansas_pine_bluff':'Arkansas Pine Bluff','iu_indy':'IU Indy','umass_lowell':'UMass Lowell',
    'alabama_st':'Alabama St.','northern_arizona':'Northern Arizona','norfolk_st':'Norfolk St.',
    'cleveland_st':'Cleveland St.','loyola_md':'Loyola MD','albany':'Albany',
    'eastern_illinois':'Eastern Illinois','lafayette':'Lafayette','cal_st_bakersfield':'Cal St. Bakersfield',
    'new_haven':'New Haven','manhattan':'Manhattan','holy_cross':'Holy Cross','bucknell':'Bucknell',
    'njit':'NJIT','stonehill':'Stonehill','northern_illinois':'Northern Illinois','n_florida':'North Florida',
    'fairleigh_dickinson':'Fairleigh Dickinson','army':'Army','niagara':'Niagara',
    's_indiana':'Southern Indiana','utsa':'UTSA','jackson_st':'Jackson St.','north_alabama':'North Alabama',
    'canisius':'Canisius','air_force':'Air Force','chicago_st':'Chicago St.','the_citadel':'The Citadel',
    'alcorn_st':'Alcorn St.','maine':'Maine','maryland_eastern_shore':'Maryland Eastern Shore',
    'new_hampshire':'New Hampshire','louisiana_monroe':'Louisiana Monroe','morgan_st':'Morgan St.',
    'north_carolina_central':'North Carolina Central','saint_francis':'Saint Francis','bryant':'Bryant',
    's_carolina_st':'South Carolina St.','rider':'Rider','kansas_city':'Kansas City',
    'binghamton':'Binghamton','vmi':'VMI','gardner_webb':'Gardner Webb','delaware_st':'Delaware St.',
    'coppin_st':'Coppin St.','western_illinois':'Western Illinois','mississippi_valley_st':'Mississippi Valley St.',
    # 68 corrections for VSiN-abbreviated dbSlugs:
    'texas_san_antonio':'UTSA','c_arkansas':'Central Arkansas','w_georgia':'West Georgia',
    'fl_gulf_coast':'Florida Gulf Coast','e_kentucky':'Eastern Kentucky','n_alabama':'North Alabama',
    'va_commonwealth':'VCU','st_josephs':"Saint Joseph's",'e_washington':'Eastern Washington',
    'n_colorado':'Northern Colorado','n_arizona':'Northern Arizona','sc_upstate':'USC Upstate',
    'csu_northridge':'CSUN','csu_fullerton':'Cal St. Fullerton','cal_poly_slo':'Cal Poly',
    'csu_bakersfield':'Cal St. Bakersfield','william_and_mary':'William & Mary',
    'w_kentucky':'Western Kentucky','middle_tenn_st':'Middle Tennessee','texas_el_paso':'UTEP',
    'uw_green_bay':'Green Bay','detroit':'Detroit Mercy','ipfw':'Purdue Fort Wayne',
    'n_kentucky':'Northern Kentucky','uw_milwaukee':'Milwaukee','iupui':'IU Indy',
    'pennsylvania':'Penn','st_peters':"Saint Peter's",'mt_st_marys':"Mount St. Mary's",'kent':'Kent St.',
    'c_michigan':'Central Michigan','w_michigan':'Western Michigan','e_michigan':'Eastern Michigan',
    'n_illinois':'Northern Illinois','nc_central':'North Carolina Central','md_e_shore':'Maryland Eastern Shore',
    'n_iowa':'Northern Iowa','liu_brooklyn':'LIU','lemoyne':'Le Moyne','st_francis_pa':'Saint Francis',
    'se_missouri_st':'Southeast Missouri','siu_edwardsville':'SIUE','ark_little_rock':'Little Rock',
    'e_illinois':'Eastern Illinois','w_illinois':'Western Illinois','boston_u':'Boston University',
    'loyola_maryland':'Loyola MD','texas_a_and_m':'Texas A&M','e_tennessee_st':'East Tennessee St.',
    'texas_a_and_m_cc':'Texas A&M Corpus Chris','east_texas_a_and_m':'East Texas A&M',
    'se_louisiana':'Southeastern Louisiana','n_dakota_st':'North Dakota St.','st_thomas_mn_':'St. Thomas',
    'n_dakota':'North Dakota','s_dakota':'South Dakota','s_dakota_st':'South Dakota St.',
    'umkc':'Kansas City','s_alabama':'South Alabama','la_monroe':'Louisiana Monroe',
    'alabama_a_and_m':'Alabama A&M','ark_pine_bluff':'Arkansas Pine Bluff',
    'miss_valley_st':'Mississippi Valley St.','california_baptist':'Cal Baptist',
    'texas_arlington':'UT Arlington','abilene_chr':'Abilene Christian','st_marys':"Saint Mary's",
    'fl_atlantic':'Florida Atlantic',
}

# Parse registry line by line
teams = []
current = {}
with open('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts') as f:
    for line in f:
        line = line.strip()
        for field in ['conference','ncaaName','ncaaNickname','vsinName','ncaaSlug','vsinSlug','dbSlug']:
            m = re.match(rf'{field}:\s*"([^"]+)"', line)
            if m:
                current[field] = m.group(1)
        if re.match(r'^},?\s*$', line) or line == '];':
            if 'dbSlug' in current and 'ncaaName' in current:
                teams.append(dict(current))
            current = {}

print(f'\n{"="*140}')
print(f'  FINAL 365-TEAM DEEP AUDIT — {datetime.now().isoformat()}')
print(f'  Registry entries parsed: {len(teams)}')
print(f'{"="*140}')
print()

# Header
print(f'{"#":>3} | {"DB Slug":<30} | {"VSiN Slug":<28} | {"NCAA Slug":<28} | {"KenPom Name":<30} | DB✓ | KP✓ | STATUS')
print('─' * 145)

passed = []
warned = []
failed = []

for i, t in enumerate(teams, 1):
    db_slug = t.get('dbSlug','')
    vsin_slug = t.get('vsinSlug','')
    ncaa_slug = t.get('ncaaSlug','')
    ncaa_name = t.get('ncaaName','')
    
    kp_name = ALL_KENPOM.get(db_slug)
    
    # DB consistency: dbSlug should equal vsinSlug with hyphens→underscores
    # EXCEPTION: umbc has dbSlug="umbc" but vsinSlug="md-balt-co" (intentional)
    expected_db = vsin_slug.replace('-','_')
    if db_slug == 'umbc':
        db_ok = True  # intentional exception
    else:
        db_ok = (expected_db == db_slug)
    
    kp_ok = kp_name is not None
    
    flags = []
    if not db_ok:
        flags.append(f'DB_MISMATCH(expected:{expected_db})')
    if not kp_ok:
        flags.append('NO_KENPOM')
    
    if flags:
        if any('DB_MISMATCH' in f for f in flags):
            status = '❌ FAIL'
            failed.append(t)
        else:
            status = '⚠️  WARN'
            warned.append(t)
    else:
        status = '✅ PASS'
        passed.append(t)
    
    db_mark = '✅' if db_ok else '❌'
    kp_mark = '✅' if kp_ok else '❌'
    flag_str = '  ← ' + ', '.join(flags) if flags else ''
    
    print(f'{i:>3} | {db_slug:<30} | {vsin_slug:<28} | {ncaa_slug:<28} | {(kp_name or "NOT MAPPED"):<30} | {db_mark:<5} | {kp_mark:<5} | {status}{flag_str}')

print()
print(f'{"="*140}')
print(f'  FINAL RESULTS: ✅ PASS={len(passed)}  ⚠️  WARN={len(warned)}  ❌ FAIL={len(failed)}  TOTAL={len(teams)}')
print(f'{"="*140}')

if failed:
    print(f'\n── FAILURES REQUIRING REGISTRY FIX ──')
    for t in failed:
        expected = t.get('vsinSlug','').replace('-','_')
        print(f'  ❌ ncaaName="{t["ncaaName"]}"  dbSlug="{t["dbSlug"]}"  vsinSlug="{t["vsinSlug"]}"')
        print(f'     → dbSlug should be "{expected}" to match vsinSlug')

if warned:
    print(f'\n── WARNINGS (NO KENPOM MAPPING) ──')
    for t in warned:
        print(f'  ⚠️  [{t["dbSlug"]}]  ncaaName="{t["ncaaName"]}"')

print(f'\n── DB SLUG CONSISTENCY ──')
db_issues = [t for t in teams if t.get('dbSlug') != 'umbc' and t.get('vsinSlug','').replace('-','_') != t.get('dbSlug','')]
if not db_issues:
    print('  ✅ All 365 dbSlugs are consistent with vsinSlugs (hyphens→underscores)')
else:
    for t in db_issues:
        print(f'  ❌ [{t["dbSlug"]}] vsinSlug="{t["vsinSlug"]}" → expected "{t["vsinSlug"].replace("-","_")}"')

print(f'\n── KENPOM COVERAGE ──')
kp_missing = [t for t in teams if not ALL_KENPOM.get(t.get('dbSlug',''))]
if not kp_missing:
    print('  ✅ All 365 teams have KenPom name mappings')
else:
    for t in kp_missing:
        print(f'  ❌ MISSING: dbSlug="{t["dbSlug"]}"  ncaaName="{t["ncaaName"]}"')

print(f'\n── DUPLICATE DB SLUG CHECK ──')
from collections import Counter
slug_counts = Counter(t.get('dbSlug','') for t in teams)
dups = [(s,c) for s,c in slug_counts.items() if c > 1]
if not dups:
    print('  ✅ No duplicate dbSlugs')
else:
    for s, c in dups:
        print(f'  ❌ DUPLICATE "{s}" appears {c}x')

print(f'\n{"="*140}')
print(f'  AUDIT COMPLETE — {datetime.now().isoformat()}')
print(f'{"="*140}\n')
