// 発言 body をタイプライターで描画するコンポーネント (T69 / D18)。
//
// hook を即時表示した後、`startDelayMs` 待ってから body を1文字ずつ送り出す。
// `concepts` に含まれる語（body 中の部分文字列）はハイライト表示する。
// 「今まさに言葉にしている」感を演出し、AI が一緒に考えている印象を与える。
import { useEffect, useMemo, useRef, useState } from "react";

interface TypewriterProps {
  text: string;
  concepts?: string[];
  /** hook 表示後 body を打ち始めるまでの待ち時間 (ms)。 */
  startDelayMs?: number;
  /** 1文字あたりの送出間隔 (ms)。 */
  charIntervalMs?: number;
  className?: string;
}

interface Segment {
  text: string;
  highlight: boolean;
}

// body を concepts の出現位置で [{text, highlight}] に分割する。
// concepts は長い順に走査して、短い語が長い語の一部を誤って割らないようにする。
function splitIntoSegments(text: string, concepts: string[]): Segment[] {
  const targets = concepts
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .sort((a, b) => b.length - a.length);
  if (targets.length === 0) return [{ text, highlight: false }];

  const segments: Segment[] = [];
  let i = 0;
  let plainStart = 0;
  while (i < text.length) {
    const match = targets.find((t) => text.startsWith(t, i));
    if (match) {
      if (plainStart < i) {
        segments.push({ text: text.slice(plainStart, i), highlight: false });
      }
      segments.push({ text: match, highlight: true });
      i += match.length;
      plainStart = i;
    } else {
      i += 1;
    }
  }
  if (plainStart < text.length) {
    segments.push({ text: text.slice(plainStart), highlight: false });
  }
  return segments;
}

export function Typewriter({
  text,
  concepts = [],
  startDelayMs = 450,
  charIntervalMs = 45,
  className,
}: TypewriterProps) {
  // 呼び出し側が text 単位で key を付け替えて再マウントするため、初期 0 から始まる。
  const [revealed, setRevealed] = useState(0);
  const timerRef = useRef<number | null>(null);

  // 各セグメントの開始文字オフセットを先に計算しておく（描画中に再代入しないため）。
  // セグメント数はごく少数なので、各 start を直前までの長さ合計で求める。
  const segments = useMemo<Array<Segment & { start: number }>>(() => {
    const raw = splitIntoSegments(text, concepts);
    return raw.map((seg, i) => ({
      ...seg,
      start: raw.slice(0, i).reduce((sum, s) => sum + s.text.length, 0),
    }));
  }, [text, concepts]);

  useEffect(() => {
    if (text.length === 0) return;

    let current = 0;
    const tick = () => {
      current += 1;
      setRevealed(current);
      if (current < text.length) {
        timerRef.current = window.setTimeout(tick, charIntervalMs);
      }
    };
    timerRef.current = window.setTimeout(tick, startDelayMs);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [text, startDelayMs, charIntervalMs]);

  // segments を revealed 文字数でクリップして描画する。
  return (
    <p data-testid="telop-body" className={className}>
      {segments.map((seg, idx) => {
        const shown = seg.text.slice(0, Math.max(0, revealed - seg.start));
        if (shown.length === 0) return null;
        return seg.highlight ? (
          <span key={idx} className="font-semibold text-amber-300">
            {shown}
          </span>
        ) : (
          <span key={idx}>{shown}</span>
        );
      })}
    </p>
  );
}
