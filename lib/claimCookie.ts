// The claim link's token while its owner signs in (brief 08, 1.2). It is
// kept out of the sign-in address (?next=), which is passed to the sign-in
// service, and held in a cookie only this site's server can read, sent
// only to /claim pages, for 30 minutes.
export const CLAIM_COOKIE = "pp_claim";
export const CLAIM_COOKIE_SECONDS = 30 * 60;
