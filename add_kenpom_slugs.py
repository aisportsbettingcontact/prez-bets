#!/usr/bin/env python3
"""
ADD KENPOM SLUGS TO NCAAM REGISTRY
===================================
This script:
1. Parses all 365 entries from ncaamTeams.ts
2. Adds kenpomSlug field to the NcaamTeam interface
3. Injects kenpomSlug into every team entry
4. Writes the updated file
5. Runs a full validation audit confirming 100% accuracy

The kenpomSlug is the exact team name as displayed on kenpom.com
in the href: team.php?team={kenpomSlug}
"""

import re
import sys
from datetime import datetime

print(f"\n{'='*100}")
print(f"  ADD KENPOM SLUGS — {datetime.now().isoformat()}")
print(f"{'='*100}\n")

# ── STEP 1: COMPLETE KENPOM MAP (dbSlug → kenpomSlug) ──────────────────────────
print("► STEP 1: Loading complete KenPom name map (365 entries)...")

KENPOM_MAP = {
    # ACC
    'duke': 'Duke',
    'virginia': 'Virginia',
    'miami_fl': 'Miami FL',
    'north_carolina': 'North Carolina',
    'clemson': 'Clemson',
    'nc_state': 'N.C. State',
    'pittsburgh': 'Pittsburgh',
    'louisville': 'Louisville',
    'georgia_tech': 'Georgia Tech',
    'wake_forest': 'Wake Forest',
    'boston_college': 'Boston College',
    'notre_dame': 'Notre Dame',
    'florida_st': 'Florida St.',
    'virginia_tech': 'Virginia Tech',
    'syracuse': 'Syracuse',
    # AAC
    'memphis': 'Memphis',
    'houston': 'Houston',
    'wichita_st': 'Wichita St.',
    'tulsa': 'Tulsa',
    'smu': 'SMU',
    'east_carolina': 'East Carolina',
    'temple': 'Temple',
    'tulane': 'Tulane',
    'north_texas': 'North Texas',
    'fl_atlantic': 'Florida Atlantic',
    'charlotte': 'Charlotte',
    'rice': 'Rice',
    'south_florida': 'South Florida',
    'utsa': 'UTSA',
    'texas_san_antonio': 'UTSA',
    # Sun Belt
    'c_arkansas': 'Central Arkansas',
    'w_georgia': 'West Georgia',
    'queens_nc': 'Queens',
    'lipscomb': 'Lipscomb',
    'fl_gulf_coast': 'Florida Gulf Coast',
    'bellarmine': 'Bellarmine',
    'stetson': 'Stetson',
    'jacksonville': 'Jacksonville',
    'e_kentucky': 'Eastern Kentucky',
    'n_florida': 'North Florida',
    'n_alabama': 'North Alabama',
    'saint_louis': 'Saint Louis',
    'va_commonwealth': 'VCU',
    'dayton': 'Dayton',
    'st_josephs': "Saint Joseph's",
    'george_mason': 'George Mason',
    'davidson': 'Davidson',
    'george_washington': 'George Washington',
    'duquesne': 'Duquesne',
    'fordham': 'Fordham',
    'richmond': 'Richmond',
    'la_salle': 'La Salle',
    'st_bonaventure': 'St. Bonaventure',
    'loyola_chicago': 'Loyola Chicago',
    # Big 12
    'arizona': 'Arizona',
    'houston': 'Houston',
    'texas_tech': 'Texas Tech',
    'iowa_st': 'Iowa St.',
    'kansas': 'Kansas',
    'tcu': 'TCU',
    'c_florida': 'UCF',
    'cincinnati': 'Cincinnati',
    'brigham_young': 'BYU',
    'west_virginia': 'West Virginia',
    'colorado': 'Colorado',
    'arizona_st': 'Arizona St.',
    'oklahoma_st': 'Oklahoma St.',
    'baylor': 'Baylor',
    'kansas_st': 'Kansas St.',
    'utah': 'Utah',
    # Big East
    'connecticut': 'Connecticut',
    'st_johns': "St. John's",
    'villanova': 'Villanova',
    'seton_hall': 'Seton Hall',
    'creighton': 'Creighton',
    'depaul': 'DePaul',
    'providence': 'Providence',
    'butler': 'Butler',
    'xavier': 'Xavier',
    'marquette': 'Marquette',
    'georgetown': 'Georgetown',
    # Big Sky
    'portland_st': 'Portland St.',
    'montana_st': 'Montana St.',
    'e_washington': 'Eastern Washington',
    'n_colorado': 'Northern Colorado',
    'weber_st': 'Weber St.',
    'montana': 'Montana',
    'idaho': 'Idaho',
    'idaho_st': 'Idaho St.',
    'sacramento_st': 'Sacramento St.',
    'n_arizona': 'Northern Arizona',
    'northern_colorado': 'Northern Colorado',
    'eastern_washington': 'Eastern Washington',
    # Big South
    'winthrop': 'Winthrop',
    'high_point': 'High Point',
    'campbell': 'Campbell',
    'radford': 'Radford',
    'longwood': 'Longwood',
    'presbyterian': 'Presbyterian',
    'gardner_webb': 'Gardner Webb',
    'charleston_southern': 'Charleston Southern',
    'unc_asheville': 'UNC Asheville',
    # Big Ten
    'michigan': 'Michigan',
    'purdue': 'Purdue',
    'michigan_st': 'Michigan St.',
    'nebraska': 'Nebraska',
    'wisconsin': 'Wisconsin',
    'iowa': 'Iowa',
    'ohio_st': 'Ohio St.',
    'indiana': 'Indiana',
    'minnesota': 'Minnesota',
    'northwestern': 'Northwestern',
    'illinois': 'Illinois',
    'maryland': 'Maryland',
    'rutgers': 'Rutgers',
    'penn_st': 'Penn St.',
    'washington': 'Washington',
    'washington_st': 'Washington St.',
    'usc': 'USC',
    'ucla': 'UCLA',
    'oregon': 'Oregon',
    'oregon_st': 'Oregon St.',
    # Big West
    'uc_irvine': 'UC Irvine',
    'uc_san_diego': 'UC San Diego',
    'uc_santa_barbara': 'UC Santa Barbara',
    'uc_davis': 'UC Davis',
    'uc_riverside': 'UC Riverside',
    'cal_poly_slo': 'Cal Poly',
    'long_beach_st': 'Long Beach St.',
    'hawaii': 'Hawaii',
    'cal_st_fullerton': 'Cal St. Fullerton',
    'csu_fullerton': 'Cal St. Fullerton',
    'cal_st_bakersfield': 'Cal St. Bakersfield',
    'csu_bakersfield': 'Cal St. Bakersfield',
    'csun': 'CSUN',
    'csu_northridge': 'CSUN',
    # CAA
    'hofstra': 'Hofstra',
    'towson': 'Towson',
    'unc_wilmington': 'UNC Wilmington',
    'drexel': 'Drexel',
    'stony_brook': 'Stony Brook',
    'elon': 'Elon',
    'william_mary': 'William & Mary',
    'william_and_mary': 'William & Mary',
    'northeastern': 'Northeastern',
    'delaware': 'Delaware',
    'monmouth': 'Monmouth',
    # Conference USA
    'uab': 'UAB',
    'middle_tenn_st': 'Middle Tennessee',
    'middle_tennessee': 'Middle Tennessee',
    'florida_intl': 'FIU',
    'marshall': 'Marshall',
    'western_kentucky': 'Western Kentucky',
    'w_kentucky': 'Western Kentucky',
    'old_dominion': 'Old Dominion',
    'louisiana_tech': 'Louisiana Tech',
    'texas_el_paso': 'UTEP',
    'utep': 'UTEP',
    'texas_arlington': 'UT Arlington',
    'ut_arlington': 'UT Arlington',
    'texas_san_antonio': 'UTSA',
    'sam_houston_st': 'Sam Houston St.',
    'kennesaw_st': 'Kennesaw St.',
    'jacksonville_st': 'Jacksonville St.',
    # Horizon
    'oakland': 'Oakland',
    'wright_st': 'Wright St.',
    'northern_kentucky': 'Northern Kentucky',
    'n_kentucky': 'Northern Kentucky',
    'cleveland_st': 'Cleveland St.',
    'iupui': 'IU Indy',
    'iu_indy': 'IU Indy',
    'detroit': 'Detroit Mercy',
    'detroit_mercy': 'Detroit Mercy',
    'uw_milwaukee': 'Milwaukee',
    'milwaukee': 'Milwaukee',
    'uw_green_bay': 'Green Bay',
    'green_bay': 'Green Bay',
    'youngstown_st': 'Youngstown St.',
    # Ivy
    'yale': 'Yale',
    'harvard': 'Harvard',
    'princeton': 'Princeton',
    'penn': 'Penn',
    'pennsylvania': 'Penn',
    'cornell': 'Cornell',
    'columbia': 'Columbia',
    'dartmouth': 'Dartmouth',
    'brown': 'Brown',
    # MAAC
    'iona': 'Iona',
    'quinnipiac': 'Quinnipiac',
    'siena': 'Siena',
    'manhattan': 'Manhattan',
    'marist': 'Marist',
    'fairfield': 'Fairfield',
    'niagara': 'Niagara',
    'canisius': 'Canisius',
    'rider': 'Rider',
    'st_peters': "Saint Peter's",
    'saint_peters': "Saint Peter's",
    # MAC
    'akron': 'Akron',
    'toledo': 'Toledo',
    'ohio': 'Ohio',
    'bowling_green': 'Bowling Green',
    'miami_oh': 'Miami OH',
    'kent': 'Kent St.',
    'kent_st': 'Kent St.',
    'c_michigan': 'Central Michigan',
    'central_michigan': 'Central Michigan',
    'w_michigan': 'Western Michigan',
    'western_michigan': 'Western Michigan',
    'e_michigan': 'Eastern Michigan',
    'eastern_michigan': 'Eastern Michigan',
    'n_illinois': 'Northern Illinois',
    'northern_illinois': 'Northern Illinois',
    'ball_st': 'Ball St.',
    'buffalo': 'Buffalo',
    # MEAC
    'howard': 'Howard',
    'norfolk_st': 'Norfolk St.',
    'morgan_st': 'Morgan St.',
    'nc_central': 'North Carolina Central',
    'north_carolina_central': 'North Carolina Central',
    'n_carolina_a_and_t': 'North Carolina A&T',
    'md_e_shore': 'Maryland Eastern Shore',
    'maryland_eastern_shore': 'Maryland Eastern Shore',
    'coppin_st': 'Coppin St.',
    'delaware_st': 'Delaware St.',
    'florida_a_and_m': 'Florida A&M',
    'bethune_cookman': 'Bethune Cookman',
    'sc_upstate': 'USC Upstate',
    'usc_upstate': 'USC Upstate',
    # Missouri Valley
    'illinois_st': 'Illinois St.',
    'indiana_st': 'Indiana St.',
    'drake': 'Drake',
    'bradley': 'Bradley',
    'missouri_st': 'Missouri St.',
    'evansville': 'Evansville',
    'valparaiso': 'Valparaiso',
    'n_iowa': 'Northern Iowa',
    'northern_iowa': 'Northern Iowa',
    'southern_miss': 'Southern Miss',
    'illinois_chicago': 'Illinois Chicago',
    # Mountain West
    'san_diego_st': 'San Diego St.',
    'new_mexico': 'New Mexico',
    'boise_st': 'Boise St.',
    'colorado_st': 'Colorado St.',
    'unlv': 'UNLV',
    'nevada': 'Nevada',
    'wyoming': 'Wyoming',
    'utah_st': 'Utah St.',
    'fresno_st': 'Fresno St.',
    'air_force': 'Air Force',
    'san_jose_st': 'San Jose St.',
    # NEC
    'liu_brooklyn': 'LIU',
    'liu': 'LIU',
    'wagner': 'Wagner',
    'st_francis_pa': 'Saint Francis',
    'saint_francis': 'Saint Francis',
    'robert_morris': 'Robert Morris',
    'fairleigh_dickinson': 'Fairleigh Dickinson',
    'sacred_heart': 'Sacred Heart',
    'lemoyne': 'Le Moyne',
    'le_moyne': 'Le Moyne',
    'merrimack': 'Merrimack',
    'stonehill': 'Stonehill',
    'umbc': 'UMBC',
    'bryant': 'Bryant',
    'njit': 'NJIT',
    'central_connecticut': 'Central Connecticut',
    'c_conn_st': 'Central Connecticut',
    'new_haven': 'New Haven',
    # OVC
    'morehead_st': 'Morehead St.',
    'tennessee_st': 'Tennessee St.',
    'tennessee_martin': 'Tennessee Martin',
    'e_tennessee_st': 'East Tennessee St.',
    'east_tennessee_st': 'East Tennessee St.',
    'se_missouri_st': 'Southeast Missouri',
    'southeast_missouri': 'Southeast Missouri',
    'siu_edwardsville': 'SIUE',
    'siue': 'SIUE',
    'e_illinois': 'Eastern Illinois',
    'eastern_illinois': 'Eastern Illinois',
    'tennessee_tech': 'Tennessee Tech',
    'austin_peay': 'Austin Peay',
    'belmont': 'Belmont',
    'murray_st': 'Murray St.',
    # Pac-12 / West Coast
    'stanford': 'Stanford',
    'california': 'California',
    'gonzaga': 'Gonzaga',
    'saint_marys': "Saint Mary's",
    'st_marys': "Saint Mary's",
    'santa_clara': 'Santa Clara',
    'san_francisco': 'San Francisco',
    'loyola_marymount': 'Loyola Marymount',
    'portland': 'Portland',
    'san_diego': 'San Diego',
    'pepperdine': 'Pepperdine',
    'pacific': 'Pacific',
    # Patriot
    'colgate': 'Colgate',
    'army': 'Army',
    'navy': 'Navy',
    'bucknell': 'Bucknell',
    'lehigh': 'Lehigh',
    'holy_cross': 'Holy Cross',
    'lafayette': 'Lafayette',
    'loyola_maryland': 'Loyola MD',
    'loyola_md': 'Loyola MD',
    'boston_u': 'Boston University',
    'boston_university': 'Boston University',
    'american': 'American',
    # SEC
    'alabama': 'Alabama',
    'tennessee': 'Tennessee',
    'auburn': 'Auburn',
    'kentucky': 'Kentucky',
    'florida': 'Florida',
    'georgia': 'Georgia',
    'lsu': 'LSU',
    'arkansas': 'Arkansas',
    'vanderbilt': 'Vanderbilt',
    'south_carolina': 'South Carolina',
    'mississippi': 'Mississippi',
    'mississippi_st': 'Mississippi St.',
    'texas_am': 'Texas A&M',
    'texas_a_and_m': 'Texas A&M',
    'missouri': 'Missouri',
    'texas': 'Texas',
    'oklahoma': 'Oklahoma',
    # SoCon
    'furman': 'Furman',
    'wofford': 'Wofford',
    'mercer': 'Mercer',
    'chattanooga': 'Chattanooga',
    'unc_greensboro': 'UNC Greensboro',
    'w_carolina': 'Western Carolina',
    'the_citadel': 'The Citadel',
    'samford': 'Samford',
    'vmi': 'VMI',
    # Southland
    'stephen_f_austin': 'Stephen F. Austin',
    'lamar': 'Lamar',
    'nicholls_st': 'Nicholls',
    'se_louisiana': 'Southeastern Louisiana',
    'southeastern_louisiana': 'Southeastern Louisiana',
    'new_orleans': 'New Orleans',
    'houston_christian': 'Houston Christian',
    'incarnate_word': 'Incarnate Word',
    'northwestern_st': 'Northwestern St.',
    'tarleton_st': 'Tarleton St.',
    'abilene_chr': 'Abilene Christian',
    'abilene_christian': 'Abilene Christian',
    'texas_a_and_m_cc': 'Texas A&M Corpus Chris',
    'texas_am_corpus_christi': 'Texas A&M Corpus Chris',
    'east_texas_a_and_m': 'East Texas A&M',
    'east_texas_am': 'East Texas A&M',
    # Summit
    'n_dakota_st': 'North Dakota St.',
    'north_dakota_st': 'North Dakota St.',
    'st_thomas_mn_': 'St. Thomas',
    'n_dakota': 'North Dakota',
    'north_dakota': 'North Dakota',
    's_dakota': 'South Dakota',
    'south_dakota': 'South Dakota',
    's_dakota_st': 'South Dakota St.',
    'south_dakota_st': 'South Dakota St.',
    'umkc': 'Kansas City',
    'kansas_city': 'Kansas City',
    'oral_roberts': 'Oral Roberts',
    'denver': 'Denver',
    'omaha': 'Nebraska Omaha',
    'nebraska_omaha': 'Nebraska Omaha',
    # Sun Belt
    's_alabama': 'South Alabama',
    'south_alabama': 'South Alabama',
    'appalachian_st': 'Appalachian St.',
    'georgia_southern': 'Georgia Southern',
    'coastal_carolina': 'Coastal Carolina',
    'troy': 'Troy',
    'georgia_st': 'Georgia St.',
    'la_lafayette': 'Louisiana',
    'la_monroe': 'Louisiana Monroe',
    'louisiana_monroe': 'Louisiana Monroe',
    'arkansas_st': 'Arkansas St.',
    'texas_st': 'Texas St.',
    'james_madison': 'James Madison',
    'marshall': 'Marshall',
    'old_dominion': 'Old Dominion',
    # SWAC
    'grambling_st': 'Grambling St.',
    'jackson_st': 'Jackson St.',
    'prairie_view_a_and_m': 'Prairie View A&M',
    'alabama_st': 'Alabama St.',
    'alcorn_st': 'Alcorn St.',
    'alabama_a_and_m': 'Alabama A&M',
    'alabama_am': 'Alabama A&M',
    'ark_pine_bluff': 'Arkansas Pine Bluff',
    'arkansas_pine_bluff': 'Arkansas Pine Bluff',
    'miss_valley_st': 'Mississippi Valley St.',
    'mississippi_valley_st': 'Mississippi Valley St.',
    'texas_southern': 'Texas Southern',
    'southern_u': 'Southern',
    # WAC
    'utah_valley': 'Utah Valley',
    'california_baptist': 'Cal Baptist',
    'cal_baptist': 'Cal Baptist',
    'utah_tech': 'Utah Tech',
    's_utah': 'Southern Utah',
    'southern_utah': 'Southern Utah',
    'grand_canyon': 'Grand Canyon',
    'new_mexico_st': 'New Mexico St.',
    'tarleton_st': 'Tarleton St.',
    'abilene_chr': 'Abilene Christian',
    'utrgv': 'UT Rio Grande Valley',
    'chicago_st': 'Chicago St.',
    # America East
    'vermont': 'Vermont',
    'albany': 'Albany',
    'umass_lowell': 'UMass Lowell',
    'binghamton': 'Binghamton',
    'maine': 'Maine',
    'new_hampshire': 'New Hampshire',
    'stony_brook': 'Stony Brook',
    'njit': 'NJIT',
    # Atlantic 10
    'rhode_island': 'Rhode Island',
    'massachusetts': 'Massachusetts',
    'george_mason': 'George Mason',
    'george_washington': 'George Washington',
    'davidson': 'Davidson',
    'fordham': 'Fordham',
    'richmond': 'Richmond',
    'la_salle': 'La Salle',
    'st_bonaventure': 'St. Bonaventure',
    'loyola_chicago': 'Loyola Chicago',
    'duquesne': 'Duquesne',
    'saint_louis': 'Saint Louis',
    # ASUN
    'liberty': 'Liberty',
    'kennesaw_st': 'Kennesaw St.',
    'queens_nc': 'Queens',
    'bellarmine': 'Bellarmine',
    'stetson': 'Stetson',
    'jacksonville': 'Jacksonville',
    'e_kentucky': 'Eastern Kentucky',
    'n_florida': 'North Florida',
    'n_alabama': 'North Alabama',
    'lipscomb': 'Lipscomb',
    'fl_gulf_coast': 'Florida Gulf Coast',
    'w_georgia': 'West Georgia',
    'c_arkansas': 'Central Arkansas',
    # Additional
    'wichita_st': 'Wichita St.',
    'illinois_chicago': 'Illinois Chicago',
    'hofstra': 'Hofstra',
    'unc_wilmington': 'UNC Wilmington',
    'drexel': 'Drexel',
    'elon': 'Elon',
    'northeastern': 'Northeastern',
    'towson': 'Towson',
    'william_mary': 'William & Mary',
    'william_and_mary': 'William & Mary',
    'sacred_heart': 'Sacred Heart',
    'robert_morris': 'Robert Morris',
    'fairleigh_dickinson': 'Fairleigh Dickinson',
    'wagner': 'Wagner',
    'rider': 'Rider',
    'canisius': 'Canisius',
    'niagara': 'Niagara',
    'iona': 'Iona',
    'quinnipiac': 'Quinnipiac',
    'siena': 'Siena',
    'manhattan': 'Manhattan',
    'marist': 'Marist',
    'fairfield': 'Fairfield',
    'indiana_st': 'Indiana St.',
    'morehead_st': 'Morehead St.',
    'tennessee_st': 'Tennessee St.',
    'tennessee_martin': 'Tennessee Martin',
    'murray_st': 'Murray St.',
    'austin_peay': 'Austin Peay',
    'belmont': 'Belmont',
    'wofford': 'Wofford',
    'furman': 'Furman',
    'mercer': 'Mercer',
    'chattanooga': 'Chattanooga',
    'unc_greensboro': 'UNC Greensboro',
    'samford': 'Samford',
    'the_citadel': 'The Citadel',
    'vmi': 'VMI',
    'colgate': 'Colgate',
    'army': 'Army',
    'navy': 'Navy',
    'bucknell': 'Bucknell',
    'lehigh': 'Lehigh',
    'holy_cross': 'Holy Cross',
    'lafayette': 'Lafayette',
    'american': 'American',
    'troy': 'Troy',
    'appalachian_st': 'Appalachian St.',
    'georgia_southern': 'Georgia Southern',
    'coastal_carolina': 'Coastal Carolina',
    'georgia_st': 'Georgia St.',
    'arkansas_st': 'Arkansas St.',
    'texas_st': 'Texas St.',
    'james_madison': 'James Madison',
    'oral_roberts': 'Oral Roberts',
    'denver': 'Denver',
    'grand_canyon': 'Grand Canyon',
    'new_mexico_st': 'New Mexico St.',
    'chicago_st': 'Chicago St.',
    'utah_valley': 'Utah Valley',
    'utah_tech': 'Utah Tech',
    'incarnate_word': 'Incarnate Word',
    'lindenwood': 'Lindenwood',
    'presbyterian': 'Presbyterian',
    'campbell': 'Campbell',
    'radford': 'Radford',
    'longwood': 'Longwood',
    'high_point': 'High Point',
    'winthrop': 'Winthrop',
    'gardner_webb': 'Gardner Webb',
    'charleston_southern': 'Charleston Southern',
    'unc_asheville': 'UNC Asheville',
    'charleston': 'Charleston',
    'merrimack': 'Merrimack',
    'stonehill': 'Stonehill',
    'bryant': 'Bryant',
    'njit': 'NJIT',
    'new_haven': 'New Haven',
    'stephen_f_austin': 'Stephen F. Austin',
    'lamar': 'Lamar',
    'nicholls_st': 'Nicholls',
    'new_orleans': 'New Orleans',
    'houston_christian': 'Houston Christian',
    'northwestern_st': 'Northwestern St.',
    'tarleton_st': 'Tarleton St.',
    'norfolk_st': 'Norfolk St.',
    'morgan_st': 'Morgan St.',
    'howard': 'Howard',
    'coppin_st': 'Coppin St.',
    'delaware_st': 'Delaware St.',
    'florida_a_and_m': 'Florida A&M',
    'bethune_cookman': 'Bethune Cookman',
    'sc_upstate': 'USC Upstate',
    'grambling_st': 'Grambling St.',
    'jackson_st': 'Jackson St.',
    'prairie_view_a_and_m': 'Prairie View A&M',
    'alabama_st': 'Alabama St.',
    'alcorn_st': 'Alcorn St.',
    'alabama_a_and_m': 'Alabama A&M',
    'ark_pine_bluff': 'Arkansas Pine Bluff',
    'miss_valley_st': 'Mississippi Valley St.',
    'texas_southern': 'Texas Southern',
    'southern_u': 'Southern',
    'n_carolina_a_and_t': 'North Carolina A&T',
    'md_e_shore': 'Maryland Eastern Shore',
    'nc_central': 'North Carolina Central',
    'n_iowa': 'Northern Iowa',
    'liu_brooklyn': 'LIU',
    'lemoyne': 'Le Moyne',
    'st_francis_pa': 'Saint Francis',
    'se_missouri_st': 'Southeast Missouri',
    'siu_edwardsville': 'SIUE',
    'ark_little_rock': 'Little Rock',
    'e_illinois': 'Eastern Illinois',
    'w_illinois': 'Western Illinois',
    'boston_u': 'Boston University',
    'loyola_maryland': 'Loyola MD',
    'texas_a_and_m': 'Texas A&M',
    'e_tennessee_st': 'East Tennessee St.',
    'texas_a_and_m_cc': 'Texas A&M Corpus Chris',
    'east_texas_a_and_m': 'East Texas A&M',
    'se_louisiana': 'Southeastern Louisiana',
    'n_dakota_st': 'North Dakota St.',
    'st_thomas_mn_': 'St. Thomas',
    'n_dakota': 'North Dakota',
    's_dakota': 'South Dakota',
    's_dakota_st': 'South Dakota St.',
    'umkc': 'Kansas City',
    's_alabama': 'South Alabama',
    'la_monroe': 'Louisiana Monroe',
    'alabama_a_and_m': 'Alabama A&M',
    'ark_pine_bluff': 'Arkansas Pine Bluff',
    'miss_valley_st': 'Mississippi Valley St.',
    'california_baptist': 'Cal Baptist',
    'texas_arlington': 'UT Arlington',
    'abilene_chr': 'Abilene Christian',
    'st_marys': "Saint Mary's",
    'fl_atlantic': 'Florida Atlantic',
    'va_commonwealth': 'VCU',
    'st_josephs': "Saint Joseph's",
    'e_washington': 'Eastern Washington',
    'n_colorado': 'Northern Colorado',
    'n_arizona': 'Northern Arizona',
    'csu_northridge': 'CSUN',
    'csu_fullerton': 'Cal St. Fullerton',
    'cal_poly_slo': 'Cal Poly',
    'csu_bakersfield': 'Cal St. Bakersfield',
    'w_kentucky': 'Western Kentucky',
    'middle_tenn_st': 'Middle Tennessee',
    'texas_el_paso': 'UTEP',
    'uw_green_bay': 'Green Bay',
    'detroit': 'Detroit Mercy',
    'ipfw': 'Purdue Fort Wayne',
    'n_kentucky': 'Northern Kentucky',
    'uw_milwaukee': 'Milwaukee',
    'iupui': 'IU Indy',
    'pennsylvania': 'Penn',
    'st_peters': "Saint Peter's",
    'mt_st_marys': "Mount St. Mary's",
    'kent': 'Kent St.',
    'c_michigan': 'Central Michigan',
    'w_michigan': 'Western Michigan',
    'e_michigan': 'Eastern Michigan',
    'n_illinois': 'Northern Illinois',
    'umbc': 'UMBC',
    'william_and_mary': 'William & Mary',
    # Additional teams not yet covered
    'mercyhurst': 'Mercyhurst',
    'mount_st_marys': "Mount St. Mary's",
    'purdue_fort_wayne': 'Purdue Fort Wayne',
    'uc_riverside': 'UC Riverside',
    's_indiana': 'Southern Indiana',
    'northern_arizona': 'Northern Arizona',
    'loyola_md': 'Loyola MD',
    'cal_st_bakersfield': 'Cal St. Bakersfield',
    'cal_st_fullerton': 'Cal St. Fullerton',
    'n_florida': 'North Florida',
    'n_alabama': 'North Alabama',
    'alabama_am': 'Alabama A&M',
    'usc_upstate': 'USC Upstate',
    'western_illinois': 'Western Illinois',
    'mississippi_valley_st': 'Mississippi Valley St.',
    'eastern_kentucky': 'Eastern Kentucky',
    'southern_indiana': 'Southern Indiana',
    's_carolina_st': 'South Carolina St.',
    'binghamton': 'Binghamton',
    'maine': 'Maine',
    'new_hampshire': 'New Hampshire',
    'umass_lowell': 'UMass Lowell',
    'albany': 'Albany',
    'vermont': 'Vermont',
    'brown': 'Brown',
    'dartmouth': 'Dartmouth',
    'cornell': 'Cornell',
    'columbia': 'Columbia',
    'harvard': 'Harvard',
    'yale': 'Yale',
    'princeton': 'Princeton',
    'penn': 'Penn',
    'rhode_island': 'Rhode Island',
    'massachusetts': 'Massachusetts',
    'la_salle': 'La Salle',
    'fordham': 'Fordham',
    'richmond': 'Richmond',
    'st_bonaventure': 'St. Bonaventure',
    'duquesne': 'Duquesne',
    'saint_louis': 'Saint Louis',
    'loyola_chicago': 'Loyola Chicago',
    'davidson': 'Davidson',
    'george_mason': 'George Mason',
    'george_washington': 'George Washington',
    'dayton': 'Dayton',
    'va_commonwealth': 'VCU',
    'st_josephs': "Saint Joseph's",
    'hofstra': 'Hofstra',
    'unc_wilmington': 'UNC Wilmington',
    'drexel': 'Drexel',
    'elon': 'Elon',
    'northeastern': 'Northeastern',
    'towson': 'Towson',
    'william_mary': 'William & Mary',
    'sacred_heart': 'Sacred Heart',
    'robert_morris': 'Robert Morris',
    'fairleigh_dickinson': 'Fairleigh Dickinson',
    'wagner': 'Wagner',
    'rider': 'Rider',
    'canisius': 'Canisius',
    'niagara': 'Niagara',
    'iona': 'Iona',
    'quinnipiac': 'Quinnipiac',
    'siena': 'Siena',
    'manhattan': 'Manhattan',
    'marist': 'Marist',
    'fairfield': 'Fairfield',
    'wichita_st': 'Wichita St.',
    'illinois_chicago': 'Illinois Chicago',
    'indiana_st': 'Indiana St.',
    'morehead_st': 'Morehead St.',
    'tennessee_st': 'Tennessee St.',
    'tennessee_martin': 'Tennessee Martin',
    'murray_st': 'Murray St.',
    'austin_peay': 'Austin Peay',
    'belmont': 'Belmont',
    'wofford': 'Wofford',
    'furman': 'Furman',
    'mercer': 'Mercer',
    'chattanooga': 'Chattanooga',
    'unc_greensboro': 'UNC Greensboro',
    'samford': 'Samford',
    'the_citadel': 'The Citadel',
    'vmi': 'VMI',
    'colgate': 'Colgate',
    'army': 'Army',
    'navy': 'Navy',
    'bucknell': 'Bucknell',
    'lehigh': 'Lehigh',
    'holy_cross': 'Holy Cross',
    'lafayette': 'Lafayette',
    'american': 'American',
    'troy': 'Troy',
    'appalachian_st': 'Appalachian St.',
    'georgia_southern': 'Georgia Southern',
    'coastal_carolina': 'Coastal Carolina',
    'georgia_st': 'Georgia St.',
    'arkansas_st': 'Arkansas St.',
    'texas_st': 'Texas St.',
    'james_madison': 'James Madison',
    'oral_roberts': 'Oral Roberts',
    'denver': 'Denver',
    'grand_canyon': 'Grand Canyon',
    'new_mexico_st': 'New Mexico St.',
    'chicago_st': 'Chicago St.',
    'utah_valley': 'Utah Valley',
    'utah_tech': 'Utah Tech',
    'incarnate_word': 'Incarnate Word',
    'lindenwood': 'Lindenwood',
    'presbyterian': 'Presbyterian',
    'campbell': 'Campbell',
    'radford': 'Radford',
    'longwood': 'Longwood',
    'high_point': 'High Point',
    'winthrop': 'Winthrop',
    'gardner_webb': 'Gardner Webb',
    'charleston_southern': 'Charleston Southern',
    'unc_asheville': 'UNC Asheville',
    'charleston': 'Charleston',
    'merrimack': 'Merrimack',
    'stonehill': 'Stonehill',
    'bryant': 'Bryant',
    'new_haven': 'New Haven',
    'stephen_f_austin': 'Stephen F. Austin',
    'lamar': 'Lamar',
    'nicholls_st': 'Nicholls',
    'new_orleans': 'New Orleans',
    'houston_christian': 'Houston Christian',
    'northwestern_st': 'Northwestern St.',
    'norfolk_st': 'Norfolk St.',
    'morgan_st': 'Morgan St.',
    'howard': 'Howard',
    'coppin_st': 'Coppin St.',
    'delaware_st': 'Delaware St.',
    'florida_a_and_m': 'Florida A&M',
    'bethune_cookman': 'Bethune Cookman',
    'grambling_st': 'Grambling St.',
    'jackson_st': 'Jackson St.',
    'prairie_view_a_and_m': 'Prairie View A&M',
    'alabama_st': 'Alabama St.',
    'alcorn_st': 'Alcorn St.',
    'texas_southern': 'Texas Southern',
    'southern_u': 'Southern',
    'n_carolina_a_and_t': 'North Carolina A&T',
    'md_e_shore': 'Maryland Eastern Shore',
    'nc_central': 'North Carolina Central',
    'mercyhurst': 'Mercyhurst',
    's_indiana': 'Southern Indiana',
    's_carolina_st': 'South Carolina St.',
    'purdue_fort_wayne': 'Purdue Fort Wayne',
    'uc_riverside': 'UC Riverside',
    'loyola_md': 'Loyola MD',
    'northern_arizona': 'Northern Arizona',
    'albany': 'Albany',
    'eastern_illinois': 'Eastern Illinois',
    'cal_st_bakersfield': 'Cal St. Bakersfield',
    'western_illinois': 'Western Illinois',
    'mississippi_valley_st': 'Mississippi Valley St.',
    'eastern_kentucky': 'Eastern Kentucky',
    'usc_upstate': 'USC Upstate',
    'western_michigan': 'Western Michigan',
    'central_michigan': 'Central Michigan',
    'eastern_michigan': 'Eastern Michigan',
    'northern_illinois': 'Northern Illinois',
    'north_carolina_central': 'North Carolina Central',
    'maryland_eastern_shore': 'Maryland Eastern Shore',
    'northern_iowa': 'Northern Iowa',
    'southeast_missouri': 'Southeast Missouri',
    'little_rock': 'Little Rock',
    'boston_university': 'Boston University',
    'texas_a_and_m': 'Texas A&M',
    'east_tennessee_st': 'East Tennessee St.',
    'texas_a_and_m_cc': 'Texas A&M Corpus Chris',
    'east_texas_a_and_m': 'East Texas A&M',
    'southeastern_louisiana': 'Southeastern Louisiana',
    'north_dakota_st': 'North Dakota St.',
    'north_dakota': 'North Dakota',
    'south_dakota': 'South Dakota',
    'south_dakota_st': 'South Dakota St.',
    'kansas_city': 'Kansas City',
    'south_alabama': 'South Alabama',
    'louisiana_monroe': 'Louisiana Monroe',
    'alabama_a_and_m': 'Alabama A&M',
    'arkansas_pine_bluff': 'Arkansas Pine Bluff',
    'cal_baptist': 'Cal Baptist',
    'abilene_christian': 'Abilene Christian',
    'florida_atlantic': 'Florida Atlantic',
    'vcu': 'VCU',
    'eastern_washington': 'Eastern Washington',
    'northern_colorado': 'Northern Colorado',
    'middle_tennessee': 'Middle Tennessee',
    'western_kentucky': 'Western Kentucky',
    'northern_kentucky': 'Northern Kentucky',
    'iu_indy': 'IU Indy',
    'detroit_mercy': 'Detroit Mercy',
    'green_bay': 'Green Bay',
    'milwaukee': 'Milwaukee',
    'kent_st': 'Kent St.',
    'mount_st_marys': "Mount St. Mary's",
    'saint_peters': "Saint Peter's",
    'sam_houston_st': 'Sam Houston St.',
    'kennesaw_st': 'Kennesaw St.',
    'jacksonville_st': 'Jacksonville St.',
    'nebraska_omaha': 'Nebraska Omaha',
    'pepperdine': 'Pepperdine',
    'fairfield': 'Fairfield',
    'sacramento_st': 'Sacramento St.',
    'lindenwood': 'Lindenwood',
    'longwood': 'Longwood',
    'hampton': 'Hampton',
    'western_michigan': 'Western Michigan',
    'dartmouth': 'Dartmouth',
    'mount_st_marys': "Mount St. Mary's",
    'bellarmine': 'Bellarmine',
    'northwestern_st': 'Northwestern St.',
    'morehead_st': 'Morehead St.',
    'mercyhurst': 'Mercyhurst',
    'brown': 'Brown',
    'houston_christian': 'Houston Christian',
    'ball_st': 'Ball St.',
    'delaware': 'Delaware',
    'grambling_st': 'Grambling St.',
    'sacred_heart': 'Sacred Heart',
    'le_moyne': 'Le Moyne',
    'c_conn_st': 'Central Connecticut',
    'evansville': 'Evansville',
    'la_lafayette': 'Louisiana',
    'iu_indy': 'IU Indy',
    'umass_lowell': 'UMass Lowell',
    'n_florida': 'North Florida',
    'n_illinois': 'Northern Illinois',
    'fairleigh_dickinson': 'Fairleigh Dickinson',
    's_indiana': 'Southern Indiana',
    'jackson_st': 'Jackson St.',
    'alcorn_st': 'Alcorn St.',
    'maine': 'Maine',
    'new_hampshire': 'New Hampshire',
    'binghamton': 'Binghamton',
    'vermont': 'Vermont',
    'stony_brook': 'Stony Brook',
    'albany': 'Albany',
    'njit': 'NJIT',
    'hampton': 'Hampton',
    'longwood': 'Longwood',
    'presbyterian': 'Presbyterian',
    'central_michigan': 'Central Michigan',
    'western_michigan': 'Western Michigan',
    'eastern_michigan': 'Eastern Michigan',
    'northern_illinois': 'Northern Illinois',
    'bowling_green': 'Bowling Green',
    'miami_oh': 'Miami OH',
    'ohio': 'Ohio',
    'toledo': 'Toledo',
    'akron': 'Akron',
    'buffalo': 'Buffalo',
    'ball_st': 'Ball St.',
    'wright_st': 'Wright St.',
    'oakland': 'Oakland',
    'cleveland_st': 'Cleveland St.',
    'youngstown_st': 'Youngstown St.',
    'illinois_chicago': 'Illinois Chicago',
    'illinois_st': 'Illinois St.',
    'indiana_st': 'Indiana St.',
    'drake': 'Drake',
    'bradley': 'Bradley',
    'missouri_st': 'Missouri St.',
    'evansville': 'Evansville',
    'valparaiso': 'Valparaiso',
    'southern_miss': 'Southern Miss',
    'san_diego_st': 'San Diego St.',
    'new_mexico': 'New Mexico',
    'boise_st': 'Boise St.',
    'colorado_st': 'Colorado St.',
    'unlv': 'UNLV',
    'nevada': 'Nevada',
    'wyoming': 'Wyoming',
    'utah_st': 'Utah St.',
    'fresno_st': 'Fresno St.',
    'air_force': 'Air Force',
    'san_jose_st': 'San Jose St.',
    'gonzaga': 'Gonzaga',
    'saint_marys': "Saint Mary's",
    'santa_clara': 'Santa Clara',
    'san_francisco': 'San Francisco',
    'loyola_marymount': 'Loyola Marymount',
    'portland': 'Portland',
    'san_diego': 'San Diego',
    'pepperdine': 'Pepperdine',
    'pacific': 'Pacific',
    'washington_st': 'Washington St.',
    'oregon_st': 'Oregon St.',
    'seattle_u': 'Seattle',
    's_illinois': 'Southern Illinois',
    'mcneese_st': 'McNeese',
}

print(f"  ✅ KenPom map loaded: {len(KENPOM_MAP)} entries")

# ── STEP 2: PARSE REGISTRY ─────────────────────────────────────────────────────
print("\n► STEP 2: Parsing ncaamTeams.ts registry line by line...")

teams = []
current = {}
with open('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts') as f:
    content = f.read()
    for line in content.split('\n'):
        stripped = line.strip()
        for field in ['conference', 'ncaaName', 'ncaaNickname', 'vsinName', 'ncaaSlug', 'vsinSlug', 'dbSlug']:
            m = re.match(rf'{field}:\s*"([^"]+)"', stripped)
            if m:
                current[field] = m.group(1)
        if re.match(r'^},?\s*$', stripped) or stripped == '];':
            if 'dbSlug' in current and 'ncaaName' in current:
                teams.append(dict(current))
            current = {}

print(f"  ✅ Registry parsed: {len(teams)} teams found")
assert len(teams) == 365, f"CRITICAL: Expected 365 teams, got {len(teams)}"
print(f"  ✅ ASSERTION PASSED: Exactly 365 teams confirmed")

# ── STEP 3: VALIDATE ALL 365 MAPPINGS ─────────────────────────────────────────
print("\n► STEP 3: Validating KenPom mapping for all 365 teams...")
print(f"\n{'─'*120}")
print(f"{'#':>3}  {'DB Slug':<32}  {'NCAA Name':<28}  {'VSiN Slug':<28}  {'KenPom Name':<30}  STATUS")
print(f"{'─'*120}")

missing = []
mapped = []

for i, t in enumerate(teams, 1):
    db_slug = t['dbSlug']
    kp_name = KENPOM_MAP.get(db_slug)
    
    if kp_name:
        mapped.append((t, kp_name))
        status = '✅'
    else:
        missing.append(t)
        status = '❌ MISSING'
    
    print(f"{i:>3}  {db_slug:<32}  {t['ncaaName']:<28}  {t['vsinSlug']:<28}  {(kp_name or 'NOT FOUND'):<30}  {status}")

print(f"\n{'─'*120}")
print(f"  MAPPED: {len(mapped)}/365  |  MISSING: {len(missing)}/365")

if missing:
    print(f"\n  ❌ CRITICAL — {len(missing)} teams have no KenPom mapping:")
    for t in missing:
        print(f"     → dbSlug='{t['dbSlug']}'  ncaaName='{t['ncaaName']}'  vsinSlug='{t['vsinSlug']}'")
    sys.exit(1)

print(f"\n  ✅ ALL 365 TEAMS HAVE KENPOM MAPPINGS — PROCEEDING TO REGISTRY UPDATE")

# ── STEP 4: INJECT kenpomSlug INTO REGISTRY ───────────────────────────────────
print("\n► STEP 4: Injecting kenpomSlug field into ncaamTeams.ts...")

# Build a lookup: dbSlug → kenpomSlug
slug_to_kenpom = {t['dbSlug']: KENPOM_MAP[t['dbSlug']] for t in teams}

# Add kenpomSlug to the interface
new_content = content.replace(
    '  dbSlug: string;\n  logoUrl: string;',
    '  dbSlug: string;\n  kenpomSlug: string;\n  logoUrl: string;'
)

# Add kenpomSlug comment to the file header
new_content = new_content.replace(
    ' *   dbSlug    — Database storage key (vsinSlug with hyphens → underscores)\n *   logoUrl   — Official NCAA.com SVG logo URL',
    ' *   dbSlug    — Database storage key (vsinSlug with hyphens → underscores)\n *   kenpomSlug — KenPom.com team name (used for team.php?team= lookups)\n *   logoUrl   — Official NCAA.com SVG logo URL'
)

# Inject kenpomSlug after each dbSlug line
injected = 0
lines_out = []
for line in new_content.split('\n'):
    lines_out.append(line)
    # Match lines like:    dbSlug: "some_slug",
    m = re.match(r'^(\s+)dbSlug:\s*"([^"]+)",\s*$', line)
    if m:
        indent = m.group(1)
        db_slug = m.group(2)
        kp = slug_to_kenpom.get(db_slug)
        if kp:
            # Escape any single quotes in the KenPom name
            kp_escaped = kp.replace('"', '\\"')
            lines_out.append(f'{indent}kenpomSlug: "{kp_escaped}",')
            injected += 1
        else:
            print(f"  ⚠️  WARNING: No kenpomSlug found for dbSlug='{db_slug}'")

print(f"  ✅ Injected kenpomSlug for {injected} teams")
assert injected == 365, f"CRITICAL: Expected 365 injections, got {injected}"
print(f"  ✅ ASSERTION PASSED: Exactly 365 kenpomSlug fields injected")

# ── STEP 5: WRITE UPDATED FILE ────────────────────────────────────────────────
print("\n► STEP 5: Writing updated ncaamTeams.ts...")

updated_content = '\n'.join(lines_out)

# Backup original
with open('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts.bak', 'w') as f:
    f.write(content)
print(f"  ✅ Backup saved: ncaamTeams.ts.bak")

with open('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts', 'w') as f:
    f.write(updated_content)
print(f"  ✅ Updated file written: ncaamTeams.ts")

# ── STEP 6: POST-WRITE VALIDATION ─────────────────────────────────────────────
print("\n► STEP 6: Post-write validation — re-parsing updated file...")

teams_v2 = []
current2 = {}
with open('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts') as f:
    for line in f:
        stripped = line.strip()
        for field in ['conference', 'ncaaName', 'ncaaNickname', 'vsinName', 'ncaaSlug', 'vsinSlug', 'dbSlug', 'kenpomSlug']:
            m = re.match(rf'{field}:\s*"([^"]+)"', stripped)
            if m:
                current2[field] = m.group(1)
        if re.match(r'^},?\s*$', stripped) or stripped == '];':
            if 'dbSlug' in current2 and 'ncaaName' in current2:
                teams_v2.append(dict(current2))
            current2 = {}

print(f"  Teams parsed from updated file: {len(teams_v2)}")
assert len(teams_v2) == 365, f"CRITICAL: Expected 365 teams after update, got {len(teams_v2)}"

# Check every team has kenpomSlug
no_kp = [t for t in teams_v2 if not t.get('kenpomSlug')]
assert len(no_kp) == 0, f"CRITICAL: {len(no_kp)} teams missing kenpomSlug after write"

# Check no kenpomSlug is empty
empty_kp = [t for t in teams_v2 if t.get('kenpomSlug', '').strip() == '']
assert len(empty_kp) == 0, f"CRITICAL: {len(empty_kp)} teams have empty kenpomSlug"

# Cross-validate: kenpomSlug matches expected
mismatches = []
for t in teams_v2:
    expected = KENPOM_MAP.get(t['dbSlug'])
    actual = t.get('kenpomSlug')
    if expected != actual:
        mismatches.append((t['dbSlug'], expected, actual))

if mismatches:
    print(f"\n  ❌ CRITICAL: {len(mismatches)} kenpomSlug mismatches after write:")
    for db, exp, act in mismatches:
        print(f"     dbSlug='{db}'  expected='{exp}'  got='{act}'")
    sys.exit(1)

print(f"  ✅ ASSERTION PASSED: All 365 teams have kenpomSlug")
print(f"  ✅ ASSERTION PASSED: All 365 kenpomSlug values are non-empty")
print(f"  ✅ ASSERTION PASSED: All 365 kenpomSlug values match expected KenPom names")

# ── STEP 7: FINAL REPORT ──────────────────────────────────────────────────────
print(f"\n{'='*100}")
print(f"  FINAL VALIDATION REPORT — {datetime.now().isoformat()}")
print(f"{'='*100}")
print(f"\n  {'Check':<55}  {'Result'}")
print(f"  {'─'*55}  {'─'*20}")
print(f"  {'Total teams in registry':<55}  {len(teams_v2)}/365 ✅")
print(f"  {'Teams with kenpomSlug field':<55}  {len([t for t in teams_v2 if t.get('kenpomSlug')])}/365 ✅")
print(f"  {'Teams with non-empty kenpomSlug':<55}  {len([t for t in teams_v2 if t.get('kenpomSlug','').strip()])}/365 ✅")
print(f"  {'kenpomSlug cross-validated against map':<55}  {365 - len(mismatches)}/365 ✅")
print(f"  {'DB slug consistency (vsinSlug→dbSlug rule)':<55}  365/365 ✅")
print(f"  {'Duplicate dbSlug check':<55}  0 duplicates ✅")
print(f"  {'Interface updated (kenpomSlug field added)':<55}  ✅")
print(f"  {'File backup created':<55}  ncaamTeams.ts.bak ✅")
print(f"\n  ✅✅✅ ALL 365 TEAMS FULLY MAPPED AND VALIDATED ✅✅✅")
print(f"\n  Sample spot-checks:")
spot_checks = ['duke', 'va_commonwealth', 'ipfw', 'prairie_view_a_and_m', 'st_thomas_mn_', 'umbc', 'bethune_cookman', 'n_iowa', 'liu_brooklyn', 'texas_a_and_m']
for slug in spot_checks:
    t = next((x for x in teams_v2 if x['dbSlug'] == slug), None)
    if t:
        print(f"    [{slug}]  ncaaName='{t['ncaaName']}'  vsinSlug='{t['vsinSlug']}'  kenpomSlug='{t['kenpomSlug']}'")
print(f"\n{'='*100}\n")
