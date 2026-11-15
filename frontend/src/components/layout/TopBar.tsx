import { FileSpreadsheet, LogOut, Settings, Search, X, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, useEffect, useRef } from "react";
import { FwMark } from "./FwMark";
import { Button } from "../ui/Button";
import { ConfirmModal } from "../ui/ConfirmModal";
import { useScrollLock } from "../../hooks/useScrollLock";
import { displayMemberStatus, initials } from "../../lib/utils";
import type { Trainer, Member } from "../../types";

interface TopBarProps {
  trainer: Trainer;
  onLogout: () => void;
  onSettings?: () => void;
  onReports?: () => void;
  members?: Member[];
  onSelectMember?: (memberId: string) => void;
}

export function TopBar({ trainer, onLogout, onSettings, onReports, members = [], onSelectMember }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshApp(): Promise<void> {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (navigator.serviceWorker) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) {
            await r.unregister();
          }
        } catch (e) {
          console.warn("Failed to unregister service worker:", e);
        }
      }
      if (window.caches) {
        try {
          const keys = await caches.keys();
          for (const k of keys) {
            await caches.delete(k);
          }
        } catch (e) {
          console.warn("Failed to delete cache keys:", e);
        }
      }
    } finally {
      window.location.reload();
    }
  }
  useScrollLock(isMobileSearchOpen);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.regNo.toLowerCase().includes(q) ||
        m.phone.includes(q)
    ).slice(0, 6);
  }, [searchQuery, members]);

  const selectMember = (memberId: string) => {
    if (onSelectMember) {
      onSelectMember(memberId);
    }
    setSearchQuery("");
    setIsOpen(false);
    setIsMobileSearchOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        const targetMember = searchResults[selectedIndex];
        if (targetMember) {
          selectMember(targetMember.id);
        }
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.blur();
    }
  };

  // Keyboard shortcut to focus search input: '/' key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;

      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <motion.header
      className="gradient-border-top sticky top-0 z-30 border-b border-border-default bg-brand-white/92 text-text-primary shadow-[0_8px_30px_rgba(26,26,46,0.08)] backdrop-blur-xl print:hidden"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.1 }}
    >
      <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 lg:min-h-[72px] lg:px-8">
        <div className="sm:hidden shrink-0">
          <FwMark compact tone="light" />
        </div>
        <div className="hidden sm:block shrink-0">
          <FwMark tone="light" />
        </div>

        {/* Desktop Quick Search Input */}
        <div ref={containerRef} className="relative flex-1 max-w-[280px] md:max-w-[340px] lg:max-w-[420px] hidden md:block mx-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search member, phone, reg no..."
              aria-label="Search members"
              value={searchQuery}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(-1);
                setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              className="studio-input w-full py-2 pl-10 pr-10 text-[13px] font-semibold placeholder:text-text-muted"
            />
            {searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedIndex(-1);
                }}
                className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            ) : (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 hidden [@media(pointer:fine)]:flex items-center justify-center h-5 w-5 rounded border border-border-default bg-surface-raised text-[10px] font-bold text-text-muted select-none">
                /
              </div>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-brand-white border border-border-default rounded-xl shadow-[0_20px_50px_rgba(26,26,46,0.14)] overflow-hidden p-1.5 max-h-[360px] overflow-y-auto scrollbar-soft">
              {searchResults.length > 0 ? (
                searchResults.map((member, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={member.id}
                      onClick={() => selectMember(member.id)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition ${
                        isSelected ? "bg-brand-primary-light/60 text-text-primary" : "text-text-primary hover:bg-surface-raised"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border-default bg-surface-raised flex items-center justify-center">
                          {member.avatar ? (
                            <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[11px] font-bold text-text-muted">{initials(member.name)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-brand-primary">{member.regNo}</span>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                              member.status === "Active" ? "bg-status-active" : "bg-status-expired"
                            }`} />
                          </div>
                          <div className="font-semibold text-[13px] truncate text-text-primary leading-tight mt-0.5">{member.name}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <div className="text-[10px] font-bold text-text-secondary">{member.planType}</div>
                        <div className="font-mono text-[10px] text-text-muted mt-0.5">{member.phone}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-4 text-center text-text-muted text-[12px] font-semibold">No members found</div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {/* Mobile Search Button */}
          {members.length > 0 && (
            <div className="md:hidden">
              <Button
                variant="ghost"
                className="!h-10 !w-10 !p-0 !text-text-primary hover:!bg-surface-raised"
                onClick={() => {
                  setIsMobileSearchOpen(true);
                  setTimeout(() => mobileInputRef.current?.focus(), 50);
                }}
                aria-label="Search members"
              >
                <Search size={22} />
              </Button>
            </div>
          )}

          <div className="hidden text-right leading-tight md:block">
            <p className="max-w-[180px] truncate text-[15px] font-black text-text-primary">{trainer.name}</p>
            <p className="max-w-[180px] truncate text-[12px] font-semibold text-text-secondary">{trainer.email}</p>
          </div>
          <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border-default bg-brand-primary-light md:flex items-center justify-center">
            {trainer.avatar ? (
              <img src={trainer.avatar} alt={trainer.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[14px] font-extrabold text-brand-primary">{initials(trainer.name)}</span>
            )}
          </div>

          <span className="hidden h-8 w-px bg-border-default md:block" aria-hidden="true" />

          {onReports && (
            <button
              type="button"
              onClick={onReports}
              title="Monthly Reports"
              aria-label="Monthly Reports"
              className="focus-ring flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-border-default bg-brand-white px-2.5 py-1 text-[13px] font-bold text-text-primary transition hover:border-brand-primary/40 hover:text-brand-primary sm:px-3.5"
            >
              <FileSpreadsheet size={17} />
              <span className="hidden md:inline">Reports</span>
            </button>
          )}
          {onSettings && (
            <button
              type="button"
              onClick={onSettings}
              title="Settings"
              aria-label="Settings"
              className="focus-ring flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-border-default bg-brand-white px-2.5 py-1 text-[13px] font-bold text-text-primary transition hover:border-brand-primary/40 hover:text-brand-primary sm:px-3.5"
            >
              <Settings size={17} />
              <span className="hidden md:inline">Settings</span>
            </button>
          )}
          <button
            type="button"
            aria-label={refreshing ? "Refreshing app, please wait" : "Refresh App"}
            title="Refresh App"
            disabled={refreshing}
            className="focus-ring group flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-transparent px-2 text-[13px] font-bold text-text-secondary transition hover:border-border-default hover:bg-surface-raised hover:text-text-primary disabled:opacity-60"
            onClick={() => void handleRefreshApp()}
          >
            <RefreshCw size={19} className={`transition-transform duration-500 ease-out ${refreshing ? "animate-spin" : "group-hover:rotate-180"}`} />
            <span className="hidden lg:inline">{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
          <button
            type="button"
            aria-label="Logout"
            title="Logout"
            onClick={() => setConfirmLogoutOpen(true)}
            className="focus-ring flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-transparent px-2 text-[13px] font-bold text-text-secondary transition hover:border-red-200 hover:bg-red-50 hover:text-status-expired"
          >
            <LogOut size={19} />
            <span className="hidden lg:inline">Logout</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmLogoutOpen}
        title="Log out?"
        message="You will be signed out of GymOS on this device."
        confirmText="Log out"
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          onLogout();
        }}
        onClose={() => setConfirmLogoutOpen(false)}
      />

      {/* Mobile Search Overlay Modal */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-50 bg-surface-raised p-4 flex flex-col md:hidden">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input
                ref={mobileInputRef}
                type="text"
                placeholder="Search name, phone, or reg no..."
                aria-label="Search members"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="studio-input w-full py-2.5 pl-10 pr-4 text-[15px] font-semibold placeholder:text-text-muted"
              />
            </div>
            <button
              onClick={() => {
                setIsMobileSearchOpen(false);
                setSearchQuery("");
              }}
              className="p-2 text-text-secondary hover:text-text-primary"
              aria-label="Close search"
            >
              <X size={24} />
            </button>
          </div>

          <div className="modal-scroll mt-4 flex-1 overflow-y-auto space-y-2 pb-8">
            {searchResults.length > 0 ? (
              searchResults.map((member) => (
                <button
                  key={member.id}
                  onClick={() => selectMember(member.id)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-brand-white transition text-left active:bg-surface-raised"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border-default bg-surface-raised flex items-center justify-center">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[13px] font-bold text-text-muted">{initials(member.name)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-brand-primary">{member.regNo}</span>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                          member.status === "Active" ? "bg-status-active" : "bg-status-expired"
                        }`} />
                      </div>
                      <div className="font-semibold text-text-primary text-[15px] mt-0.5 truncate">{member.name}</div>
                      <div className="text-[12px] text-text-secondary mt-0.5">{member.trainingType || "General"} · {member.planType}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      member.status === "Active" ? "bg-green-50 text-status-active border border-green-200" : "bg-red-50 text-status-expired border border-red-200"
                    }`}>
                      {displayMemberStatus(member.status)}
                    </span>
                    <div className="font-mono text-[11px] text-text-muted mt-1">{member.phone}</div>
                  </div>
                </button>
              ))
            ) : searchQuery.trim() ? (
              <div className="text-center py-8 text-text-secondary text-[14px]">No matching members found</div>
            ) : (
              <div className="text-center py-8 text-text-muted text-[13px] font-medium leading-relaxed">
                Type name, phone number, or registration ID <br /> to find and view member profile.
              </div>
            )}
          </div>
        </div>
      )}
    </motion.header>
  );
}
