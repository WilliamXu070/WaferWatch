import { Fragment, type ReactNode } from "react";

const NOTE_URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const SIMPLE_TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":"]);
const CLOSING_PAIRS = {
  ")": "(",
  "]": "[",
  "}": "{"
} as const;

function countCharacter(value: string, character: string) {
  return [...value].filter((candidate) => candidate === character).length;
}

function splitTrailingPunctuation(candidate: string) {
  let linkText = candidate;
  let trailingText = "";

  while (linkText) {
    const lastCharacter = linkText.at(-1)!;
    const openingCharacter = CLOSING_PAIRS[lastCharacter as keyof typeof CLOSING_PAIRS];
    const isUnmatchedClosingCharacter = openingCharacter
      ? countCharacter(linkText, lastCharacter) > countCharacter(linkText, openingCharacter)
      : false;

    if (!SIMPLE_TRAILING_PUNCTUATION.has(lastCharacter) && !isUnmatchedClosingCharacter) break;
    trailingText = lastCharacter + trailingText;
    linkText = linkText.slice(0, -1);
  }

  return { linkText, trailingText };
}

function linkHref(linkText: string) {
  return linkText.toLowerCase().startsWith("www.") ? `https://${linkText}` : linkText;
}

export function LinkedNoteText({ children }: { children: string }) {
  const parts: ReactNode[] = [];
  let textIndex = 0;
  let partIndex = 0;

  for (const match of children.matchAll(NOTE_URL_PATTERN)) {
    const matchIndex = match.index;
    const candidate = match[0];
    const { linkText, trailingText } = splitTrailingPunctuation(candidate);

    if (matchIndex > textIndex) parts.push(children.slice(textIndex, matchIndex));
    if (linkText) {
      parts.push(
        <a
          key={`note-link-${partIndex}`}
          href={linkHref(linkText)}
          target="_blank"
          rel="noopener noreferrer"
          className="break-words text-[#2369c9] underline decoration-[#9bbdf7] underline-offset-2 hover:text-[#174f9b] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2369c9]"
        >
          {linkText}
        </a>
      );
      partIndex += 1;
    }
    if (trailingText) parts.push(trailingText);
    textIndex = matchIndex + candidate.length;
  }

  if (textIndex < children.length) parts.push(children.slice(textIndex));

  return <Fragment>{parts.length ? parts : children}</Fragment>;
}
