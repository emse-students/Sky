import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySecurityHeaders,
  CSP_REPORT_MAX_BYTES,
  forgetCspReports,
  noteCspReport,
  SECURITY_HEADERS,
} from '#lib/server/security-headers.js';
import { POST } from '../src/routes/api/csp-report/+server';
import { CSP, CSP_REPORT_PATH } from '../csp.config';

/**
 * The headers every answer carries, and the content security policy in its observing release:
 * nothing is blocked yet, and what WOULD be is logged where it can be read.
 */

describe('the headers of every answer', () => {
  it('are nosniff, an origin-only referrer across sites, and no framing by another site', () => {
    expect(SECURITY_HEADERS).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
    });
  });

  it('are written on a response that has none', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers.get(name)).toBe(value);
    }
  });

  it('leave a stricter value a route already set', () => {
    const headers = new Headers({ 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
    applySecurityHeaders(headers);

    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('a violation report', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    forgetCspReports();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => void warn.mockRestore());

  const report = (blocked = 'https://cdn.example/a.js?v=3') =>
    JSON.stringify({
      'csp-report': {
        'effective-directive': 'script-src-elem',
        'blocked-uri': blocked,
        'document-uri': 'https://sky.example/tree?id=someone#top',
        'source-file': 'https://sky.example/_app/immutable/a.js',
      },
    });

  it('is logged once, with no query and no fragment in it', () => {
    const line = noteCspReport(report());

    expect(line).toBe(
      '[CSP] would block: directive=script-src-elem blocked=https://cdn.example/a.js page=https://sky.example/tree source=https://sky.example/_app/immutable/a.js (occurrence #1)'
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is then said at its 10th and 100th occurrence, with the count', () => {
    const said = Array.from({ length: 100 }, () => noteCspReport(report())).filter(Boolean);

    expect(said).toHaveLength(3);
    expect(said[1]).toContain('(occurrence #10)');
    expect(said[2]).toContain('(occurrence #100)');
  });

  it('counts another blocked resource apart', () => {
    noteCspReport(report());

    expect(noteCspReport(report('https://other.example/b.js'))).toContain('(occurrence #1)');
  });

  it('reads the Reporting API shape too', () => {
    const line = noteCspReport(
      JSON.stringify([
        {
          type: 'csp-violation',
          body: {
            effectiveDirective: 'img-src',
            blockedURL: 'https://img.example/x.png',
            documentURL: 'https://sky.example/',
          },
        },
      ])
    );

    expect(line).toContain('directive=img-src blocked=https://img.example/x.png');
  });

  it.each(['not json', '{}', '[]', 'null', '{"csp-report":"text"}'])(
    'drops %p, and says it dropped one',
    (raw) => {
      expect(noteCspReport(raw)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    }
  );
});

describe('POST /api/csp-report', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    forgetCspReports();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => void warn.mockRestore());

  type PostEvent = Parameters<typeof POST>[0];
  const post = (body: string) =>
    POST({
      request: new Request(`http://sky.test${CSP_REPORT_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body,
      }),
    } as unknown as PostEvent);

  it('answers 204 and logs the violation', async () => {
    const res = await post(
      JSON.stringify({
        'csp-report': { 'effective-directive': 'style-src', 'blocked-uri': 'inline' },
      })
    );

    expect(res.status).toBe(204);
    expect(warn.mock.calls[0][0]).toContain('directive=style-src blocked=inline');
  });

  it('drops a body past the limit without reading a violation from it', async () => {
    const res = await post('x'.repeat(CSP_REPORT_MAX_BYTES + 1));

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('was dropped');
  });
});

describe('the content security policy', () => {
  it('enforces that no other site frames this one', () => {
    expect(CSP.directives).toEqual({ 'frame-ancestors': ['self'] });
  });

  it('observes the rest for this release, and reports to the route above', () => {
    expect(CSP.reportOnly['default-src']).toEqual(['self']);
    expect(CSP.reportOnly['script-src']).toEqual(['self']);
    expect(CSP.reportOnly['object-src']).toEqual(['none']);
    expect(CSP.reportOnly['report-uri']).toEqual([CSP_REPORT_PATH]);
  });
});
