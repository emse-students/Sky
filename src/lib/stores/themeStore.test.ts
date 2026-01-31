import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { themeStore } from './themeStore';

describe('themeStore', () => {
	it('initializes with default value or respects simple store contract', () => {
		const value = get(themeStore);
		expect(['light', 'dark']).toContain(value);
	});

	it('can toggle theme', () => {
		const initial = get(themeStore);
		themeStore.toggle();
		const specific = get(themeStore);
		expect(specific).not.toBe(initial);
	});
});
