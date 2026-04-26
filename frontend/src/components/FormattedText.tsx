import type { CSSProperties, ReactNode } from 'react';

// Light markdown-ish formatter for LLM agent outputs.
//
// Handles three patterns that show up in raw reasoning text:
//   1. "**bold**" markdown  →  <strong>
//   2. "1. ... 2. ..."      →  unordered list (em-dash markers)
//   3. blank-line paragraph →  separate blocks
//
// Numbered items are detected whether they appear at paragraph start OR
// inline after a colon (e.g. "Alternatives considered: 1. X: ... 2. Y: ...").

export function FormattedText({ text, style }: { text: string; style?: CSSProperties }) {
  const paragraphs = text.split(/\n\s*\n+/).filter((p) => p.trim().length);
  return (
    <div style={style}>
      {paragraphs.map((p, i) => (
        <Paragraph key={i} text={p} first={i === 0} />
      ))}
    </div>
  );
}

function Paragraph({ text, first }: { text: string; first: boolean }) {
  const t = text.replace(/\s+/g, ' ').trim();

  // Detect inline numbered-list pattern: 2+ markers of form " N. " or "N. " at start.
  const markerRe = /(?:^|(?<=[\s:—]))(\d+)\.\s+/g;
  const markers: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(t)) !== null) {
    markers.push(m.index + (m[0].length - m[0].replace(/^[\s:—]?/, '').length));
  }

  if (markers.length >= 2) {
    // Split into lead (before first marker) and items.
    // Re-scan with a simpler regex that captures the offset just BEFORE the digit.
    const itemStarts: number[] = [];
    const scan = /(?:^|[\s:—])(\d+)\.\s+/g;
    let hit: RegExpExecArray | null;
    while ((hit = scan.exec(t)) !== null) {
      // Offset at the digit itself, not the leading whitespace
      const digitOffset = hit.index + hit[0].indexOf(hit[1]);
      itemStarts.push(digitOffset);
    }
    const lead = t.slice(0, itemStarts[0]).trim().replace(/[:\-—]\s*$/, '').trim();
    const items: string[] = [];
    for (let i = 0; i < itemStarts.length; i++) {
      const start = itemStarts[i];
      const end = i + 1 < itemStarts.length ? itemStarts[i + 1] : t.length;
      items.push(
        t
          .slice(start, end)
          .replace(/^\d+\.\s*/, '')
          .trim(),
      );
    }
    return (
      <div style={{ marginTop: first ? 0 : 8 }}>
        {lead && (
          <p style={{ margin: 0, marginBottom: 6 }}>{renderInline(lead)}</p>
        )}
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {items.map((item, idx) => (
            <li
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '14px 1fr',
                columnGap: 6,
                alignItems: 'baseline',
              }}
            >
              <span
                aria-hidden
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '0.82em',
                  color: 'var(--bone-3)',
                  lineHeight: 1.5,
                }}
              >
                —
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p style={{ margin: 0, marginTop: first ? 0 : 8 }}>{renderInline(t)}</p>
  );
}

// Inline: render **bold** as <strong>, everything else as plain text.
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={i}
          style={{ fontWeight: 600, color: 'var(--bone-0)' }}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
