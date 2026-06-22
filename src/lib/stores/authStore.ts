import { writable } from "svelte/store";
import type { SessionUser } from "$types/api";

function createAuthStore() {
  const { subscribe, set, update } = writable<{
    user: SessionUser | null;
    loading: boolean;
  }>({
    user: null,
    loading: true,
  });

  return {
    subscribe,
    setUser: (user: SessionUser | null) =>
      update((state) => ({ ...state, user })),
    setLoading: (loading: boolean) =>
      update((state) => ({ ...state, loading })),
    logout: () => {
      set({ user: null, loading: false });
      window.location.href = "/auth/logout";
    },
    checkAuth: async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = (await res.json()) as { user: SessionUser | null };
          set({ user: data.user, loading: false });
        } else {
          set({ user: null, loading: false });
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        set({ user: null, loading: false });
      }
    },
  };
}

export const authStore = createAuthStore();
