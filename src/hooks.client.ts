import type { ClientInit } from '@sveltejs/kit/hooks';
import { installStepUpRedirect } from '#lib/step-up.js';

/** A session a Canari handoff opened is sent through MiConnect when it tries to change something. */
export const init: ClientInit = () => {
  installStepUpRedirect();
};
