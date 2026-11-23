/**
 * The step-up, as the BROWSER sees it (the server half is `#lib/server/handoff/step-up.js`): a
 * session a Canari sign-in handoff opened is refused any change, every refusal carries the header
 * below, and the page then sends the user through the ordinary MiConnect sign-in. After it, the
 * session is an ordinary one and the action works.
 */

/** The refusal's code, in the JSON body of a refused `fetch`. */
export const STEP_UP_CODE = 'STEP_UP_REQUIRED';
/** Set on every refusal, so the client recognises it without reading (and consuming) the body. */
export const STEP_UP_HEADER = 'x-step-up-required';
/** Where a refused session is sent: the MiConnect sign-in, which lands on `/`. */
export const STEP_UP_LOGIN_PATH = '/auth/login';

/** Whether a response is the step-up refusal. */
export function isStepUpRefusal(res: Response): boolean {
  return res.headers.get(STEP_UP_HEADER) === '1';
}

/**
 * Wraps `fetch` once, at boot (`hooks.client.ts`): a step-up refusal sends the page to MiConnect's
 * sign-in. The response is still returned, so the caller's own error path runs as it would for any
 * refusal while the navigation happens. `use:enhance` posts through this same `fetch`.
 */
export function installStepUpRedirect(win: Window & typeof globalThis = window): void {
  const original = win.fetch.bind(win);
  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await original(input, init);
    if (isStepUpRefusal(res)) {
      console.warn(
        '[step-up] a session opened from Canari needs a MiConnect sign-in for this action'
      );
      win.location.assign(STEP_UP_LOGIN_PATH);
    }
    return res;
  };
  // Keep the static members (`preconnect`) the platform's fetch carries.
  win.fetch = Object.assign(guarded, original) as typeof fetch;
}
