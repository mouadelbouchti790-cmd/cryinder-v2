import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import BadgeLegendItems from './ui/BadgeLegend';

interface FaqItem {
  question: string;
  answer?: string;
  /** Optional custom content rendered in the open panel (e.g. badge legend). */
  content?: React.ReactNode;
}

const FAQS: FaqItem[] = [
  {
    question: 'What is Cryinder?',
    answer:
      'Cryinder shows Solana memecoins as a swipeable card deck with live on-chain data. Swipe right to buy, left to pass.',
  },
  {
    question: 'How do I earn Cryinder Points (CP)?',
    answer:
      'Passes earn 3 CP. Buys earn 25 CP. Daily loot boxes pay bonus CP, and streaks multiply your rewards.',
  },
  {
    question: 'What can I do with CP?',
    answer:
      'You spend CP on daily loot boxes, climb the leaderboard, and rank for future airdrops.',
  },
  {
    question: 'What do the badges mean?',
    content: <BadgeLegendItems />,
  },
  {
    question: 'Is Cryinder safe to use?',
    answer:
      'Cryinder never holds your funds or touches your private keys. Browsing moves no money. Your wallet asks your approval before any buy.',
  },
  {
    question: 'Do I need to pay to use Cryinder?',
    answer:
      'Browsing and swiping cost nothing. Buys carry a 1% fee plus standard Solana network fees.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Connect your Solana wallet and swipe. You explore the deck immediately. Your wallet signs only when you buy.',
  },
];

function FaqItemRow({
  faq,
  isOpen,
  onToggle,
}: {
  faq: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        isOpen ? 'border-white/[0.1] bg-[#0a0a0b]' : 'border-white/[0.06] bg-[#0a0a0b]'
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`faq-panel-${faq.question}`}
        className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 sm:px-6"
      >
        <span className="text-[15px] font-bold text-white">{faq.question}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeInOut' }}
          className="shrink-0 text-white/40"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            id={`faq-panel-${faq.question}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.25, 0.4, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 sm:px-6">
              {faq.content ?? (
                <p className="text-sm leading-relaxed text-white/50">{faq.answer}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {FAQS.map((faq, i) => (
        <FaqItemRow
          key={faq.question}
          faq={faq}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
        />
      ))}
    </div>
  );
}
