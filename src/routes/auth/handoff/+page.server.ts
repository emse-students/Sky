import type { PageServerLoad } from './$types';

/**
 * The landing page's headers: the token rides in the FRAGMENT, which no browser sends, and this page
 * removes it from the address bar at once - `no-referrer` keeps even the bare path out of whatever
 * it links to, and `no-store` keeps a copy of the page out of every cache.
 */
export const load: PageServerLoad = ({ setHeaders }) => {
  setHeaders({ 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
};
