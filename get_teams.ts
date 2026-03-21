import { NCAAM_TEAMS } from "./shared/ncaamTeams";

const slugs = ['st_johns','kansas','ucla','connecticut','florida','iowa','arizona','utah_st','miami_fl','purdue','texas_tech','alabama','tennessee','virginia','kentucky','iowa_st'];
slugs.forEach(s => {
  const t = NCAAM_TEAMS.find(x => x.dbSlug === s);
  if (t) console.log(`${s} -> kenpom="${t.kenpomSlug}" conf="${t.conference}"`);
  else console.log(`${s} -> NOT FOUND`);
});
