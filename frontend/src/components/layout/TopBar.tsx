import { FileSpreadsheet, LogOut, Settings } from "lucide-react";
import { motion } from "motion/react";
import { FwMark } from "./FwMark";
import { Button } from "../ui/Button";
import { initials } from "../../lib/utils";
import type { Trainer } from "../../types";

interface TopBarProps {
  trainer: Trainer;
  onLogout: () => void;
  onSettings?: () => void;
  onReports?: () => void;
}

export function TopBar({ trainer, onLogout, onSettings, onReports }: TopBarProps) {
  return (
    <motion.header
      className="gradient-border-top sticky top-0 z-30 border-b border-white/[0.12] bg-[#080A16]/94 text-brand-white shadow-[0_16px_44px_rgba(0,0,0,0.26)] backdrop-blur-xl"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.1 }}
    >
      <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:min-h-20 lg:px-8 lg:py-4">
        <FwMark />
        <div className="flex items-center gap-3">
          {onSettings ? (
            <button
              type="button"
              className="focus-ring group flex items-center gap-3 rounded-full px-2 py-1 text-right transition hover:bg-white/10"
              aria-label="Open profile settings"
              title="Open profile settings"
              onClick={onSettings}
            >
              <span className="hidden leading-tight sm:block">
                <span className="block text-[18px] font-black group-hover:text-brand-primary-light">{trainer.name}</span>
                <span className="block text-[14px] font-semibold text-white/70">{trainer.email}</span>
              </span>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.14] bg-gradient-to-br from-brand-primary/30 to-white/[0.08] ring-1 ring-white/10 shadow-sm">
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
            <Button aria-label="Monthly Reports" title="Monthly Reports" variant="ghost" className="!text-brand-white hover:!bg-white/10 hover:!text-brand-white !h-12 !w-12 !p-0" onClick={onReports}>
              <FileSpreadsheet size={22} />
            </Button>
          )}
          {onSettings && (
            <Button aria-label="Settings" title="Settings" variant="ghost" className="!text-brand-white hover:!bg-white/10 hover:!text-brand-white !h-12 !w-12 !p-0" onClick={onSettings}>
              <Settings size={22} />
            </Button>
          )}
          <Button aria-label="Logout" title="Logout" variant="ghost" className="!text-brand-white hover:!bg-white/10 hover:!text-brand-white !h-12 !w-12 !p-0" onClick={onLogout}>
            <LogOut size={22} />
          </Button>
        </div>
      </div>
    </motion.header>
  );
}
