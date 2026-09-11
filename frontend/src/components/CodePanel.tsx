import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronRight, FileCode } from "lucide-react";

const KEYWORDS = /\b(async|await|const|let|function|return|if|new|export|import|from|this|throw|for)\b/g;
const STRINGS = /("[^"]*"|'[^']*')/g;
const COMMENTS = /(\/\/[^\n]*)/g;

function highlight(code: string) {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const withComments = escaped.replace(COMMENTS, (m) => `<span class="text-muted">${m}</span>`);
  const withStrings = withComments.replace(STRINGS, (m) => `<span class="text-final">${m}</span>`);
  const withKeywords = withStrings.replace(KEYWORDS, (m) => `<span class="text-structural">${m}</span>`);
  return withKeywords;
}

export function CodePanel({ file, code }: { file: string; code: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-line rounded-sm mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted hover:text-ink transition-colors"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={13} />
        </motion.span>
        <FileCode size={13} />
        <span>{file}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <pre className="px-3 pb-3 text-[11px] leading-relaxed overflow-x-auto">
              <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
