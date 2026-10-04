import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Camera, CreditCard, FileText, Film, HelpCircle, Image as ImageIcon, MapPin, MessageSquareText, Navigation, Paperclip } from "lucide-react";
import type { CaseAnalysis, Evidence, EvidenceType, Subject } from "../types";
import { formatClock, formatClockWithSeconds } from "../timeUtils";
import { CARD_HEIGHT, CARD_WIDTH, type CardPosition } from "./cardLayout";

interface EvidenceCardProps {
  evidence: Evidence;
  subjects: Subject[];
  position: CardPosition;
  analysis: CaseAnalysis;
  isSelected: boolean;
  isDimmed: boolean;
  isNew: boolean;
  onClick: () => void;
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

const SUBJECT_COLOR: Record<Subject["kind"], string> = {
  person: "#38bdf8",
  phone: "#a78bfa",
  vehicle: "#fbbf24",
  other: "#94a3b8",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatCardTime(e: Evidence): { main: string; sub?: string } {
  if (e.timeCertainty === "exact") return { main: formatClockWithSeconds(e.eventTime) };
  if (e.timeCertainty === "range") {
    return { main: `${formatClock(e.earliestPossibleTime)}–${formatClock(e.latestPossibleTime)}` };
  }
  const marginMin = Math.round(
    (new Date(e.latestPossibleTime).getTime() - new Date(e.eventTime).getTime()) / 60_000
  );
  return { main: `~${formatClock(e.eventTime)}`, sub: marginMin > 0 ? `±${marginMin}` : undefined };
}

/** One evidence card. Position/size come from cardLayout; a CSS transition on left/top makes later cards slide over when a new one is inserted. */
export function EvidenceCard({ evidence, subjects, position, analysis, isSelected, isDimmed, isNew, onClick }: EvidenceCardProps) {
  const [entered, setEntered] = useState(!isNew);

  useEffect(() => {
    if (!isNew) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [isNew]);

  const Icon = TYPE_ICON[evidence.evidenceType] ?? HelpCircle;
  const time = formatCardTime(evidence);

  const inConflict = analysis.conflicts.some((c) => c.evidenceIds.includes(evidence.id));
  const inLink = analysis.corroborations.some((c) => c.evidenceIds.includes(evidence.id));
  const inAi = analysis.aiSuggestions.some((s) => s.status === "pending" && s.evidenceIds.includes(evidence.id));

  const avatarSubjectIds = Array.from(
    new Set([evidence.subjectId, ...(evidence.involvedParties ?? []).map((p) => p.subjectId)])
  );
  const shownAvatars = avatarSubjectIds.slice(0, 3);
  const overflowCount = avatarSubjectIds.length - shownAvatars.length;

  const borderColor = isSelected ? "#22c55e" : inConflict ? "#ef4444" : "#3f3f46";

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute cursor-pointer overflow-hidden rounded-lg border-2 bg-neutral-900 p-2 shadow-sm transition-[left,top,opacity,transform] duration-300 hover:-translate-y-0.5"
      style={{
        left: position.x,
        top: position.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderColor,
        opacity: entered ? (isDimmed ? 0.25 : 1) : 0,
      }}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium text-neutral-300">
        <Icon size={11} className="flex-shrink-0 text-sky-400" />
        <span className="truncate">{evidence.source}</span>
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-[13px] font-bold text-neutral-100">{time.main}</span>
        {time.sub && <span className="font-mono text-[9px] text-neutral-500">{time.sub}</span>}
      </div>

      <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-500">
        <MapPin size={9} className="flex-shrink-0" />
        <span className="truncate">{evidence.location.name}</span>
      </div>

      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-1">
        <div className="flex items-center -space-x-1">
          {shownAvatars.map((id) => {
            const s = subjects.find((su) => su.id === id);
            return (
              <span
                key={id}
                title={s?.name}
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-neutral-900 text-[7px] font-bold text-neutral-900"
                style={{ backgroundColor: s ? SUBJECT_COLOR[s.kind] : SUBJECT_COLOR.other }}
              >
                {s ? initials(s.name) : "?"}
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-neutral-900 bg-neutral-700 text-[7px] font-bold text-neutral-200">
              +{overflowCount}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {evidence.attachments && evidence.attachments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-neutral-500">
              <Paperclip size={9} />
              {evidence.attachments.length}
            </span>
          )}
          {inConflict && <span className="rounded bg-red-500/20 px-1 text-[8px] font-semibold text-red-400">conflict</span>}
          {inLink && <span className="rounded bg-emerald-500/20 px-1 text-[8px] font-semibold text-emerald-400">linked</span>}
          {!inConflict && inAi && <span className="rounded bg-sky-500/20 px-1 text-[8px] font-semibold text-sky-400">AI</span>}
        </div>
      </div>
    </div>
  );
}
