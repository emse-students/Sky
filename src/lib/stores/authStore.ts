import { writable } from 'svelte/store';
import type { User } from '$types/api';

function createAuthStore() {
	const { subscribe, set, update } = writable<{
    user: User | null;
    loading: boolean;
  }>({
  	user: null,
  	loading: true
  });

	return {
		subscribe,
		setUser: (user: User | null) => update((state) => ({ ...state, user })),
		setLoading: (loading: boolean) =>
			update((state) => ({ ...state, loading })),
		logout: async () => {
			try {
				await fetch('/api/auth/logout', { method: 'POST' });
				set({ user: null, loading: false });
			} catch (error) {
				console.error('Logout failed:', error);
			}
		},
		checkAuth: async () => {
			try {
				const res = await fetch('/api/auth/me');
				if (res.ok) {
					const data = (await res.json()) as { user: User | null };
					set({ user: data.user, loading: false });
				} else {
					set({ user: null, loading: false });
				}
			} catch (error) {
				console.error('Auth check failed:', error);
				set({ user: null, loading: false });
			}
		}
	};
}

export const authStore = createAuthStore();
