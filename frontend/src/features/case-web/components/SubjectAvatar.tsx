import { useEffect, useState } from "react";
import type { Subject } from "../types";
import { subjectColorFor } from "./subjectColors";

interface SubjectAvatarProps {
  subject: Subject;
  subjects: Subject[];
  size: number;
}

/** First letter of the subject's name, shown when there's no profile picture (or it fails to load). */
function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

/** A subject's profile picture, or their initial on their lane color. */
export function SubjectAvatar({ subject, subjects, size }: SubjectAvatarProps) {
  const color = subjectColorFor(subjects, subject.id);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [subject.photoUrl]);
  const showPhoto = Boolean(subject.photoUrl) && !failed;

  return (
    <span
      className="inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: color.bg,
        color: color.text,
        boxShadow: `0 0 0 2px ${color.bg}`,
      }}
      aria-hidden
    >
      {showPhoto ? (
        <img
          src={subject.photoUrl!}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        initialOf(subject.name)
      )}
    </span>
  );
}
