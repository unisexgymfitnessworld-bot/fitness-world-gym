import { LogOut } from "lucide-react";
import { motion } from "motion/react";
import { FwMark } from "./FwMark";
import { Button } from "../ui/Button";
import { initials } from "../../lib/utils";
import type { Trainer } from "../../types";

interface TopBarProps {
  trainer: Trainer;
  onLogout: () => void;
}

export function TopBar({ trainer, onLogout }: TopBarProps) {
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
          <div className="hidden text-right sm:block">
            <p className="text-[15px] font-bold">{trainer.name}</p>
            <p className="text-[13px] text-white/60">{trainer.email}</p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.14] bg-gradient-to-br from-brand-primary/30 to-white/[0.08] text-[13px] font-bold ring-1 ring-white/10 lg:h-12 lg:w-12 lg:text-[15px]">{initials(trainer.name)}</div>
          <Button aria-label="Logout" title="Logout" variant="ghost" className="!text-brand-white hover:!bg-white/10 hover:!text-brand-white" onClick={onLogout}>
            <LogOut size={20} />
          </Button>
        </div>
      </div>
    </motion.header>
  );
}
