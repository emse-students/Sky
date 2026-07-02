/**
 * Cookie carrying the token of a pending link request (ambiguous login). The
 * token references a `pending_links` row server-side (verified SSO identity);
 * the client never carries the identity itself.
 */
export const PENDING_COOKIE_NAME = "__pending_link";
