import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from './types';

interface AppState {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      logout: () => set({ currentUser: null }),
    }),
    {
      name: 'tsp-auth-storage',
    }
  )
);
