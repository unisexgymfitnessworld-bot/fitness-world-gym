import { FileSpreadsheet, LogOut, Settings, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, useEffect, useRef } from "react";
import { FwMark } from "./FwMark";
import { Button } from "../ui/Button";
import { initials } from "../../lib/utils";
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
      className="gradient-border-top sticky top-0 z-30 border-b border-white/[0.12] bg-[#080A16]/94 text-brand-white shadow-[0_16px_44px_rgba(0,0,0,0.26)] backdrop-blur-xl"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.1 }}
    >
      <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4 lg:min-h-20 lg:px-8 lg:py-4">
        <div className="sm:hidden shrink-0">
          <FwMark compact />
        </div>
        <div className="hidden sm:block shrink-0">
          <FwMark />
        </div>

        {/* Desktop Quick Search Input */}
        <div ref={containerRef} className="relative flex-1 max-w-[280px] md:max-w-[340px] lg:max-w-[420px] hidden md:block mx-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input
              ref={inputRef}
              type="text"
              placeholder="Quick search... (Press /)"
              value={searchQuery}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(-1);
                setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-white/5 hover:bg-white/[0.08] focus:bg-white/[0.08] border border-white/10 focus:border-brand-primary/50 rounded-xl py-2 pl-10 pr-10 text-[13px] font-semibold text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all duration-200"
            />
            {searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedIndex(-1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X size={14} />
              </button>
            ) : (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center h-5 w-5 rounded border border-white/15 bg-white/5 text-[10px] font-bold text-white/40 select-none">
                /
              </div>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isOpen && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#0e1122]/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1.5 max-h-[360px] overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((member, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={member.id}
                      onClick={() => selectMember(member.id)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition ${
                        isSelected ? "bg-white/10 text-white animate-pulse-subtle" : "text-white/80 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                          {member.avatar ? (
                            <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[11px] font-bold text-white/60">{member.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-brand-primary">{member.regNo}</span>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                              member.status === "Active" ? "bg-emerald-400" : "bg-rose-400"
                            }`} />
                          </div>
                          <div className="font-semibold text-[13px] truncate text-white leading-tight mt-0.5">{member.name}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <div className="text-[10px] font-bold text-white/50">{member.planType}</div>
                        <div className="font-mono text-[10px] text-white/30 mt-0.5">{member.phone}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-4 text-center text-white/40 text-[12px] font-semibold">No members found</div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          {/* Mobile Search Button */}
          {members.length > 0 && (
            <div className="md:hidden">
              <Button
                variant="ghost"
                className="!h-10 !w-10 !p-0 !text-brand-white hover:!bg-white/10"
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

          {onSettings ? (
            <button
              type="button"
              className="focus-ring group flex shrink-0 items-center gap-2 rounded-full px-1 py-1 text-right transition hover:bg-white/10 sm:gap-3 sm:px-2"
              aria-label="Open profile settings"
              title="Open profile settings"
              onClick={onSettings}
            >
              <span className="hidden leading-tight sm:block">
                <span className="block text-[18px] font-black group-hover:text-brand-primary-light">{trainer.name}</span>
                <span className="block text-[14px] font-semibold text-white/70">{trainer.email}</span>
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.14] bg-gradient-to-br from-brand-primary/30 to-white/[0.08] ring-1 ring-white/10 shadow-sm sm:h-12 sm:w-12">
                {trainer.avatar ? (
                  <img src={trainer.avatar} alt={trainer.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[15px] font-extrabold text-brand-white">{initials(trainer.name)}</span>
                )}
              </span>
            </button>
          ) : (
            <>
              <div className="hidden text-right sm:block leading-tight">
                <p className="text-[18px] font-black">{trainer.name}</p>
                <p className="text-[14px] text-white/70 font-semibold">{trainer.email}</p>
              </div>
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/[0.14] bg-gradient-to-br from-brand-primary/30 to-white/[0.08] flex items-center justify-center ring-1 ring-white/10 shadow-sm">
                {trainer.avatar ? (
                  <img src={trainer.avatar} alt={trainer.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[15px] font-extrabold text-brand-white">{initials(trainer.name)}</span>
                )}
              </div>
            </>
          )}
          {onReports && (
            <Button aria-label="Monthly Reports" title="Monthly Reports" variant="ghost" className="!h-10 !w-10 !p-0 !text-brand-white hover:!bg-white/10 hover:!text-brand-white sm:!h-12 sm:!w-12" onClick={onReports}>
              <FileSpreadsheet size={22} />
            </Button>
          )}
          {onSettings && (
            <Button aria-label="Settings" title="Settings" variant="ghost" className="!h-10 !w-10 !p-0 !text-brand-white hover:!bg-white/10 hover:!text-brand-white sm:!h-12 sm:!w-12" onClick={onSettings}>
              <Settings size={22} />
            </Button>
          )}
          <Button aria-label="Logout" title="Logout" variant="ghost" className="!h-10 !w-10 !p-0 !text-brand-white hover:!bg-white/10 hover:!text-brand-white sm:!h-12 sm:!w-12" onClick={onLogout}>
            <LogOut size={22} />
          </Button>
        </div>
      </div>

      {/* Mobile Search Overlay Modal */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-50 bg-[#080a16]/98 p-4 flex flex-col md:hidden">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
              <input
                ref={mobileInputRef}
                type="text"
                placeholder="Search name, phone, or reg no..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-[15px] font-semibold text-white placeholder-white/40 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <button
              onClick={() => {
                setIsMobileSearchOpen(false);
                setSearchQuery("");
              }}
              className="p-2 text-white/60 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto space-y-2 pb-8">
            {searchResults.length > 0 ? (
              searchResults.map((member) => (
                <button
                  key={member.id}
                  onClick={() => selectMember(member.id)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.08] active:bg-white/[0.12] transition text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/10 flex items-center justify-center">
                      {member.avatar ? (
                        <img src={member.avatar} alt={member.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[13px] font-bold text-white/80">{member.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-brand-primary">{member.regNo}</span>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                          member.status === "Active" ? "bg-emerald-400" : "bg-rose-400"
                        }`} />
                      </div>
                      <div className="font-semibold text-white text-[15px] mt-0.5 truncate">{member.name}</div>
                      <div className="text-[12px] text-white/50 mt-0.5">{member.trainingType || "General"} · {member.planType}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      member.status === "Active" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {member.status}
                    </span>
                    <div className="font-mono text-[11px] text-white/40 mt-1">{member.phone}</div>
                  </div>
                </button>
              ))
            ) : searchQuery.trim() ? (
              <div className="text-center py-8 text-white/40 text-[14px]">No matching members found</div>
            ) : (
              <div className="text-center py-8 text-white/30 text-[13px] font-medium leading-relaxed">
                Type name, phone number, or registration ID <br /> to find and view member profile.
              </div>
            )}
          </div>
        </div>
      )}
    </motion.header>
  );
}
