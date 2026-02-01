import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

function createThemeStore() {
	// Initial value from localStorage or system preference
	let initialTheme: Theme = 'light';

	if (browser) {
		const stored = localStorage.getItem('theme') as Theme;
		if (stored) {
			initialTheme = stored;
		} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			initialTheme = 'dark';
		}
	}

	const { subscribe, set, update } = writable<Theme>(initialTheme);

	return {
		subscribe,
		toggle: () =>
			update((current) => {
				const newTheme = current === 'light' ? 'dark' : 'light';
				if (browser) {
					localStorage.setItem('theme', newTheme);
					document.documentElement.classList.toggle(
						'dark',
						newTheme === 'dark'
					);
				}
				return newTheme;
			}),
		set: (theme: Theme) => {
			if (browser) {
				localStorage.setItem('theme', theme);
				document.documentElement.classList.toggle('dark', theme === 'dark');
			}
			set(theme);
		},
		init: () => {
			if (browser) {
				const stored = localStorage.getItem('theme') as Theme;
				if (stored) {
					set(stored);
					document.documentElement.classList.toggle('dark', stored === 'dark');
				} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
					set('dark');
					document.documentElement.classList.toggle('dark', true);
				}
			}
		}
	};
}

export const themeStore = createThemeStore();
