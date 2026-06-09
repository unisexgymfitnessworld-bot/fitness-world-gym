import { create } from "zustand";
import type { MemberFilters, ToastMessage, Trainer } from "../types";

interface AppState {
  trainer: Trainer | null;
  filters: MemberFilters;
  selectedMemberId: string | null;
  editingMemberId: string | null;
  smsMemberId: string | null;
  toast: ToastMessage | null;
  setTrainer: (trainer: Trainer | null) => void;
  setFilter: <K extends keyof MemberFilters>(key: K, value: MemberFilters[K]) => void;
  setSelectedMemberId: (memberId: string | null) => void;
  setEditingMemberId: (memberId: string | null) => void;
  setSmsMemberId: (memberId: string | null) => void;
  pushToast: (message: Omit<ToastMessage, "id">) => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  trainer: null,
  filters: {
    query: "",
    status: "All",
    goal: "All Goals",
    payment: "All Payments",
    dueSoon: false,
    month: "All",
  },
  selectedMemberId: null,
  editingMemberId: null,
  smsMemberId: null,
  toast: null,
  setTrainer: (trainer) => set({ trainer }),
  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
      },
    })),
  setSelectedMemberId: (memberId) => set({ selectedMemberId: memberId }),
  setEditingMemberId: (memberId) => set({ editingMemberId: memberId }),
  setSmsMemberId: (memberId) => set({ smsMemberId: memberId }),
  pushToast: (message) =>
    set({
      toast: {
        ...message,
        id: crypto.randomUUID(),
      },
    }),
  clearToast: () => set({ toast: null }),
}));
