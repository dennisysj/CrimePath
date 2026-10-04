import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, CreditCard, FileText, Film, HelpCircle, Image as ImageIcon, MapPin, MessageSquareText, Navigation, Paperclip } from "lucide-react";
import type { CaseAnalysis, Evidence, EvidenceType, Subject } from "../types";
import { formatEvidenceTimeLabel } from "../timeUtils";
import { CARD_HEIGHT, CARD_WIDTH, type CardPosition } from "./cardLayout";
import { subjectColorFor } from "./subjectColors";
import { STATUS_COLORS } from "./statusColors";

interface EvidenceCardProps {
  evidence: Evidence;
  subjects: Subject[];
  position: CardPosition;
  analysis: CaseAnalysis;
  isSelected: boolean;
  isDimmed: boolean;
  isNew: boolean;
  /** True for ~900ms after this card was jumped to from the sidebar list. */
  isFlashing: boolean;
  onSelect: () => void; // DELETED line 22: `onOpenDetail: () => void;` — the drawer and its "+" trigger are gone; onSelect alone now shows the card's details (bottom panel)
}

type IconComponent = ComponentType<{ size?: number | string; className?: string }>;

const TYPE_ICON: Record<EvidenceType, IconComponent> = {
  witness: MessageSquareText,
  cctv: Camera,
  image: ImageIcon,
  video: Film,
  document: FileText,
  gps: Navigation,
  transaction: CreditCard,
  other: HelpCircle,
};

const TYPE_LABEL: Record<EvidenceType, string> = {
  witness: "Witness",
  cctv: "CCTV",
  image: "Image",
  video: "Video",
  document: "Document",
  gps: "GPS",
  transaction: "Transaction",
  other: "Other",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatCardTimeSub(e: Evidence): string | undefined {
  if (e.timeCertainty !== "approximate") return undefined;
  const marginMin = Math.round((new Date(e.latestPossibleTime).getTime() - new Date(e.eventTime).getTime()) / 60_000);
  return marginMin > 0 ? `±${marginMin}` : undefined;
}

/**
 * One evidence card. Position comes from cardLayout as x/y; motion
 * animates those as transforms so cards glide when an hour collapses or
 * new evidence shifts the column order, instead of jumping. The whole
 * card is filled with its subject's color; conflict/selection show as
 * outer rings rather than changing the fill.
 */
export function EvidenceCard({ evidence, subjects, position, analysis, isSelected, isDimmed, isNew, isFlashing, onSelect }: EvidenceCardProps) {
  const reduceMotion = useReducedMotion();
  const [pulsing, setPulsing] = useState(isNew);

  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => setPulsing(false), 1000);
    return () => clearTimeout(t);
  }, [isNew]);

  const subject = subjects.find((s) => s.id === evidence.subjectId);
  const Icon = TYPE_ICON[evidence.evidenceType] ?? HelpCircle;
  const typeLabel = TYPE_LABEL[evidence.evidenceType] ?? "Other";
  const timeMain = formatEvidenceTimeLabel(evidence);
  const [rawDate, rawClock] = timeMain.replace(/^~/, "").split(" ");
  const timeDate = timeMain.startsWith("~") ? `~${rawDate}` : rawDate;
  const timeClock = rawClock ?? "";
  const timeSub = formatCardTimeSub(evidence);

  const inConflict = analysis.conflicts.some((c) => c.evidenceIds.includes(evidence.id));
  const inLink = analysis.corroborations.some((c) => c.evidenceIds.includes(evidence.id));
  const inAi = analysis.aiSuggestions.some((s) => s.status === "pending" && s.evidenceIds.includes(evidence.id));
  // At most one status badge: conflict takes priority over linked.
  const statusBadge = inConflict ? "conflict" : inLink ? "linked" : null;
  const showAiBadge = inAi && !inConflict;

  const avatarSubjectIds = Array.from(new Set([evidence.subjectId, ...(evidence.involvedParties ?? []).map((p) => p.subjectId)]));
  const shownAvatars = avatarSubjectIds.slice(0, 3);
  const overflowCount = avatarSubjectIds.length - shownAvatars.length;

  const color = subjectColorFor(subjects, evidence.subjectId);
  const isLightText = color.text === "#FFFFFF";
  const iconSquareBg = isLightText ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)";

  // Conflict ring sits closest to the card; a selected card adds a second black ring stacked outside it.
  const ringShadows = [
    inConflict ? `0 0 0 2.5px ${STATUS_COLORS.conflictRing}` : null,
    isSelected ? `0 0 0 ${inConflict ? "5.5" : "3"}px ${STATUS_COLORS.selectionRing}` : null,
  ].filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ x: position.x, y: position.y, opacity: isDimmed ? 0.25 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      whileHover={{ y: position.y - 2 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="absolute cursor-pointer overflow-hidden rounded-lg p-2 shadow-sm"
      style={{
        left: 0,
        top: 0,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        background: color.bg,
        color: color.text,
        boxShadow: ringShadows.length > 0 ? ringShadows.join(", ") : undefined,
      }}
    >
      {pulsing && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{ boxShadow: `0 0 0 2px ${STATUS_COLORS.selectionRing}` }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 1 }}
        />
      )}
      {isFlashing && (
        <motion.div
          key="flash"
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{ boxShadow: "0 0 0 2px var(--accent)" }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.9 }}
        />
      )}

      <div className="flex items-start justify-between gap-1">
        <span className="min-w-0 font-mono text-[10px] font-medium leading-tight">
          <span className="block truncate">{timeDate}</span>
          <span className="block truncate text-[11px]">{timeClock}</span>
        </span>
        <span title={typeLabel} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded" style={{ background: iconSquareBg }}>
          <Icon size={11} />
        </span>
      </div>
      {timeSub && <span className="-mt-0.5 block font-mono text-[9px] opacity-80">{timeSub}</span>}

      <div className="mt-1 flex items-center gap-1 text-[12px] opacity-90">
        <MapPin size={9} className="flex-shrink-0" />
        <span className="truncate">{evidence.location.name}</span>
      </div>

      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-1">
        <div className="flex items-center -space-x-1">
          {shownAvatars.map((id) => {
            const s = subjects.find((su) => su.id === id);
            const avatarColor = subjectColorFor(subjects, id);
            return (
              <span
                key={id}
                title={s?.name}
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[7px] font-bold"
                style={{ backgroundColor: avatarColor.bg, color: avatarColor.text, border: "1px solid rgba(0,0,0,0.25)" }}
              >
                {s ? initials(s.name) : "?"}
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[7px] font-bold"
              style={{ background: "rgba(255,255,255,0.85)", color: "#111111", border: "1px solid rgba(0,0,0,0.25)" }}
            >
              +{overflowCount}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {evidence.attachments && evidence.attachments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] opacity-90">
              <Paperclip size={9} />
              {evidence.attachments.length}
            </span>
          )}
          {statusBadge === "conflict" && (
            <span className="rounded bg-white px-1 text-[8px] font-semibold" style={{ color: STATUS_COLORS.conflict }}>
              conflict
            </span>
          )}
          {statusBadge === "linked" && (
            <span className="rounded bg-white px-1 text-[8px] font-semibold" style={{ color: STATUS_COLORS.linked }}>
              linked
            </span>
          )}
          {showAiBadge && (
            <span className="rounded bg-white px-1 text-[8px] font-semibold" style={{ color: STATUS_COLORS.ai }}>
              AI
            </span>
          )}
          {/* DELETED lines 208-220: the white "+" button that opened the slide-out drawer — removed per
              "Remove the '+' button from the cards, since clicking the card does the job." */}
        </div>
      </div>
    </motion.div>
  );
}
