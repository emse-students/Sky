/**
 * Cookie portant le token d une demande de liaison en attente (login ambigu).
 * Le token reference une ligne `pending_links` cote serveur (identite SSO
 * verifiee) ; le client ne porte jamais l identite elle-meme.
 */
export const PENDING_COOKIE_NAME = "__pending_link";
