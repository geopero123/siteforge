import type { CSSProperties } from "react";

// The landing hero's illustration: a blueprint of a website with a reviewer's
// redline callouts on it, the way an inspector marks up an engineering drawing.
// The wireframe draws itself in, then each numbered finding is circled in red.
// Purely decorative (aria-hidden); the notes repeat what the marks mean.

const notes: Array<{
  n: number;
  severity: string;
  title: string;
  where: string;
}> = [
  {
    n: 1,
    severity: "critical",
    title: "Stripe live secret key committed",
    where: "src/config/stripe.ts:3",
  },
  {
    n: 2,
    severity: "high",
    title: "Content overflows the viewport",
    where: "/checkout · 390px",
  },
  {
    n: 3,
    severity: "high",
    title: "lodash@4.17.15 has 2 known vulnerabilities",
    where: "package-lock.json",
  },
  {
    n: 4,
    severity: "medium",
    title: "No Content-Security-Policy header",
    where: "shop.example.com",
  },
];

// Redline marks: [cx, cy, r, note number]
const marks: Array<[number, number, number, number]> = [
  [118, 104, 22, 4],
  [262, 214, 30, 1],
  [497, 222, 26, 2],
  [180, 300, 24, 3],
];

const line = (i: number) => ({ "--i": i }) as CSSProperties;

export function InspectionDrawing() {
  return (
    <div className="drawing" aria-hidden>
      <div className="drawing-sheet">
        <svg className="drawing-svg" viewBox="0 0 560 380" fill="none">
          {/* Dimension line across the top: the desktop width being measured */}
          <g className="dim">
            <path d="M24 22 H404" pathLength={1} style={line(0)} />
            <path d="M24 16 V28 M404 16 V28" pathLength={1} style={line(0)} />
            <text x="214" y="14" textAnchor="middle">
              1440
            </text>
          </g>

          {/* Desktop browser */}
          <g className="wire">
            <rect
              x="24"
              y="40"
              width="380"
              height="300"
              rx="4"
              pathLength={1}
              style={line(1)}
            />
            <path d="M24 62 H404" pathLength={1} style={line(2)} />
            <circle cx="38" cy="51" r="3" pathLength={1} style={line(2)} />
            <circle cx="49" cy="51" r="3" pathLength={1} style={line(2)} />
            <rect
              x="72"
              y="46"
              width="200"
              height="10"
              rx="2"
              pathLength={1}
              style={line(2)}
            />
            {/* nav */}
            <rect
              x="44"
              y="78"
              width="40"
              height="10"
              pathLength={1}
              style={line(3)}
            />
            <path
              d="M260 83 H290 M302 83 H332 M344 83 H384"
              pathLength={1}
              style={line(3)}
            />
            {/* hero */}
            <path
              d="M44 126 H250 M44 146 H210"
              className="thick"
              pathLength={1}
              style={line(4)}
            />
            <path
              d="M44 170 H230 M44 182 H200"
              pathLength={1}
              style={line(5)}
            />
            <rect
              x="44"
              y="200"
              width="78"
              height="24"
              rx="3"
              pathLength={1}
              style={line(5)}
            />
            <rect
              x="232"
              y="186"
              width="152"
              height="68"
              rx="3"
              pathLength={1}
              style={line(6)}
            />
            <path
              d="M246 204 H330 M246 216 H300"
              pathLength={1}
              style={line(6)}
            />
            {/* cards */}
            <rect
              x="44"
              y="270"
              width="104"
              height="52"
              rx="3"
              pathLength={1}
              style={line(7)}
            />
            <rect
              x="160"
              y="270"
              width="104"
              height="52"
              rx="3"
              pathLength={1}
              style={line(7)}
            />
            <rect
              x="276"
              y="270"
              width="108"
              height="52"
              rx="3"
              pathLength={1}
              style={line(7)}
            />
          </g>

          {/* Phone, with a block that runs off its right edge */}
          <g className="wire">
            <rect
              x="436"
              y="96"
              width="98"
              height="196"
              rx="12"
              pathLength={1}
              style={line(8)}
            />
            <path d="M472 106 H498" pathLength={1} style={line(8)} />
            <path
              d="M448 132 H520 M448 146 H500"
              pathLength={1}
              style={line(9)}
            />
            <rect
              x="448"
              y="166"
              width="74"
              height="38"
              rx="2"
              pathLength={1}
              style={line(9)}
            />
          </g>
          <g className="overflow">
            <rect x="448" y="210" width="102" height="26" rx="2" />
          </g>
          <g className="dim">
            <path d="M436 306 H534" pathLength={1} style={line(10)} />
            <path
              d="M436 300 V312 M534 300 V312"
              pathLength={1}
              style={line(10)}
            />
            <text x="485" y="324" textAnchor="middle">
              390
            </text>
          </g>

          {/* Redline callouts */}
          {marks.map(([cx, cy, r, n], i) => (
            <g
              className="redline"
              key={n}
              style={{ "--m": i } as CSSProperties}
            >
              <ellipse
                cx={cx}
                cy={cy}
                rx={r}
                ry={r * 0.82}
                transform={`rotate(${i % 2 ? 9 : -7} ${cx} ${cy})`}
                pathLength={1}
              />
              <g
                className="tag"
                transform={`translate(${cx + r * 0.78} ${cy - r * 0.86})`}
              >
                <circle r="9" />
                <text y="3.5" textAnchor="middle">
                  {n}
                </text>
              </g>
            </g>
          ))}
        </svg>

        <ol className="drawing-notes">
          <li className="drawing-notes-head">Notes</li>
          {notes.map(({ n, severity, title, where }) => (
            <li key={n} style={{ "--m": n - 1 } as CSSProperties}>
              <span className="note-n">{n}</span>
              <span className="note-body">
                <strong>{title}</strong>
                <small>
                  <span className={`note-sev ${severity}`}>{severity}</span> ·{" "}
                  {where}
                </small>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <dl className="title-block">
        <div className="tb-wide">
          <dt>Project</dt>
          <dd>shop.example.com + acme/storefront</dd>
        </div>
        <div>
          <dt>Sheet</dt>
          <dd>A-01</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>
            74<span>/100</span>
          </dd>
        </div>
        <div>
          <dt>Viewports</dt>
          <dd>1440 · 768 · 390</dd>
        </div>
        <div className="tb-stamp">
          <dt>Checked by</dt>
          <dd>SiteForge</dd>
        </div>
      </dl>
    </div>
  );
}
