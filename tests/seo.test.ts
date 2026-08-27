import { describe, it, expect } from 'vitest';
import {
  INSTITUTION_ID,
  canonicalUrl,
  defaultImage,
  institutionNode,
  jsonLdScript,
  prune,
  serializeJsonLd,
  siteNode,
} from '$lib/seo';

/**
 * Sky's head has a narrower job than a public site's - `src/hooks.server.ts` keeps everything but
 * `/` and `/unauthorized` behind a session - but the parts that DO run fail silently when they are
 * wrong: a relative `og:image` no unfurler can resolve, a graph a validator rejects for a
 * declared-but-empty property, and a name that closes the script element it sits in.
 *
 * None of those break a page render, so none would show up in a smoke test. They show up as a
 * preview card that never appears, weeks later, with nothing logged anywhere.
 */

describe('absolute URLs', () => {
  it('builds the preview image and the canonical from the request origin', () => {
    expect(defaultImage('https://sky.mitv.fr')).toBe('https://sky.mitv.fr/sky.png');
    expect(canonicalUrl('http://localhost:5173', '/')).toBe('http://localhost:5173/');
  });

  it('drops query and hash - the same page under a filter is not a second page', () => {
    expect(canonicalUrl('https://sky.mitv.fr', '/unauthorized')).toBe(
      'https://sky.mitv.fr/unauthorized'
    );
  });
});

describe('serializeJsonLd', () => {
  it('wraps the nodes in a schema.org graph', () => {
    const parsed = JSON.parse(serializeJsonLd([{ '@type': 'WebSite' }]));
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@graph']).toEqual([{ '@type': 'WebSite' }]);
  });

  it('cannot close the script element it is embedded in', () => {
    const hostile = serializeJsonLd([{ name: '</script><img src=x onerror=alert(1)>' }]);
    expect(hostile).not.toContain('</script>');
    expect(hostile).not.toContain('<');
    // Still the same document to a JSON parser: the escape is at the JSON level, not a mangling.
    expect(JSON.parse(hostile)['@graph'][0].name).toBe('</script><img src=x onerror=alert(1)>');
  });

  it('escapes ampersands too, so an entity in a name survives verbatim', () => {
    const out = serializeJsonLd([{ name: 'Arts &amp; Metiers' }]);
    expect(out).not.toContain('&');
    expect(JSON.parse(out)['@graph'][0].name).toBe('Arts &amp; Metiers');
  });
});

describe('jsonLdScript', () => {
  it('emits a complete, correctly typed script element', () => {
    const html = jsonLdScript([{ '@type': 'WebSite' }]);
    expect(html.startsWith('<script type="application/ld+json">')).toBe(true);
    expect(html.endsWith('</script>')).toBe(true);
    // Exactly one closing tag: the payload contributed none.
    expect(html.split('</script>')).toHaveLength(2);
  });
});

describe('prune', () => {
  it('removes undefined, null and empty members and keeps falsy-but-real ones', () => {
    expect(prune({ a: 'x', b: null, c: undefined, d: '', e: 0, f: false })).toEqual({
      a: 'x',
      e: 0,
      f: false,
    });
  });
});

describe('graph nodes', () => {
  it('hangs the site off one institution @id rather than naming the school twice', () => {
    expect(institutionNode()['@id']).toBe(INSTITUTION_ID);
    expect(siteNode('https://sky.mitv.fr').publisher).toEqual({
      '@id': INSTITUTION_ID,
    });
  });

  it('gives the institution the fields that make a three-letter school identifiable', () => {
    const node = institutionNode();
    expect(node['@type']).toBe('CollegeOrUniversity');
    expect(node.url).toBe('https://www.mines-stetienne.fr/');
    expect(node.address).toMatchObject({ addressLocality: 'Saint-Etienne' });
  });

  it('builds the site node from the request origin', () => {
    const node = siteNode('http://localhost:5173');
    expect(node['@id']).toBe('http://localhost:5173/#website');
    expect(node.url).toBe('http://localhost:5173/');
    expect(typeof node.description).toBe('string');
    expect(node.description).not.toBe('');
  });
});
