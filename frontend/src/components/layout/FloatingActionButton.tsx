import { Plus } from "lucide-react";
import { motion } from "motion/react";

interface FloatingActionButtonProps {
  onClick: () => void;
}

export function FloatingActionButton({ onClick }: FloatingActionButtonProps) {
  return (
    <motion.button
      aria-label="Add member"
      title="Add member"
      className="focus-ring animate-pulse-glow fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-primary to-[#F0447D] text-brand-white shadow-[0_18px_44px_rgba(232,23,93,0.42)] ring-4 ring-white/60 lg:h-16 lg:w-16 lg:ring-8"
      onClick={onClick}
      whileHover={{ scale: 1.12, rotate: 90 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 14 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </motion.button>
  );
}
