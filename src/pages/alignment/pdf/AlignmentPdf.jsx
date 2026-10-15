import { Document, Page, View, Text, Svg, G, Circle, Line, Image, Font } from '@react-pdf/renderer';
import dm400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url';
import dm500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url';
import { layoutChart, quadrant, PROGRESS_WORDS } from '../chartLayout';

// The Strategic Alignment Health Check as a printed A4 document: a vector PDF
// (selectable text, crisp chart), drawn here rather than copied from the page.
// Two looks: 'light' (white, for printing) and 'dark' (black, like the screen).
// Fonts: Nekst Regular for headings, labels and numbers; DM Sans for body text.

Font.register({ family: 'Nekst', src: '/fonts/Nekst-Regular.ttf' });
Font.register({
  family: 'DM Sans',
  fonts: [{ src: dm400, fontWeight: 400 }, { src: dm500, fontWeight: 500 }],
});
// Words are never hyphenated, except a very long unbroken one, which may split so
// it cannot run out of its column.
Font.registerHyphenationCallback((word) => (word.length > 24 ? word.match(/.{1,22}/g) : [word]));

const THEMES = {
  light: {
    page: '#FFFFFF', text: '#111111', text2: '#5F5F5C', faint: '#8F8B84', line: '#DDD8CE',
    card: '#F4F4F3', coral: '#FF6F5C', coralText: '#C2412E', mint: '#5FEFBB', mintText: '#0B7F58',
    onAccent: '#000000', ringFill: '#FFFFFF', track: '#E3DDD2',
    dotBottom: '#D6D3CC', dotCoral: '#FFB3A8', dotMint: '#8FE6C8', midline: '#9A968E', coralOpacity: 1, mintOpacity: 1,
  },
  dark: {
    page: '#000000', text: '#FFFFFF', text2: '#A3A3A0', faint: '#7F7F7C', line: '#262626',
    card: '#0B0B0B', coral: '#FF6F5C', coralText: '#FF6F5C', mint: '#5FEFBB', mintText: '#5FEFBB',
    onAccent: '#000000', ringFill: '#000000', track: '#262626',
    dotBottom: '#2B2B2B', dotCoral: '#FF6F5C', dotMint: '#5FEFBB', midline: '#4A4A49', coralOpacity: 1, mintOpacity: 0.7,
  },
};

const PAGE = { w: 595.28, h: 841.89, margin: 36 };
const CONTENT_W = PAGE.w - PAGE.margin * 2;
const ROW_H = 21;
const CHART_W = CONTENT_W;
const CHART_H = 290; // points: the chart is the centrepiece (about 27% taller than before)
const MAX_NAMED = 10; // beyond this the chart shows numbered dots only
const COL = { project: 214, importance: 124, progress: 54, resource: 100 };

const pad = (n) => (n < 10 ? `0${n}` : String(n));
const pct = (v) => `${Math.round(v)}%`;

const label = (c) => ({ fontFamily: 'Nekst', fontSize: 6.5, letterSpacing: 1.5, textTransform: 'uppercase', color: c });

function Chart({ t, rows, measure }) {
  const named = rows.length <= MAX_NAMED;
  const scale0 = CHART_W / 780;
  const g = layoutChart(rows, 'd', measure, {
    wrapChars: 22, height: CHART_H / scale0, fontSize: 14, avoidLines: true,
  });
  const { W, H, L, T, pw, ph, mx, my, gap, sp, fs, pts, labs, xs, ys } = g;
  const scale = CHART_W / W;
  const dots = [];
  // Dot field: columns and rows centred between the centre lines, so each line
  // falls exactly halfway between two rows and two columns of dots.
  const startX = mx - Math.ceil((mx - L) / sp) * sp + sp / 2;
  const startY = my - Math.ceil((my - T) / sp) * sp + sp / 2;
  for (let x = startX; x < L + pw; x += sp) {
    for (let y = startY; y < T + ph; y += sp) {
      if (x < L || y < T) continue;
      const top = y < my;
      const left = x < mx;
      const colour = top ? (left ? t.dotCoral : t.dotMint) : t.dotBottom;
      dots.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={1.15} fill={colour} fillOpacity={top ? (left ? t.coralOpacity : t.mintOpacity) : 1} />);
    }
  }
  const FILL = { mi: t.mint, co: t.coral, n: t.text };
  return (
    <Svg width={CHART_W} height={H * scale} viewBox={`0 0 ${W} ${H}`}>
      {dots}
      <Line x1={L} y1={my} x2={mx - gap} y2={my} stroke={t.midline} strokeWidth={1} />
      <Line x1={mx + gap} y1={my} x2={L + pw} y2={my} stroke={t.midline} strokeWidth={1} />
      <Line x1={mx} y1={T} x2={mx} y2={my - gap} stroke={t.midline} strokeWidth={1} />
      <Line x1={mx} y1={my + gap} x2={mx} y2={T + ph} stroke={t.midline} strokeWidth={1} />
      {[[100, '100%'], [50, '50%'], [0, '0%']].map(([v, s]) => (
        <Text key={s} x={L - 10} y={ys(v) + 4} textAnchor="end" style={{ fontFamily: 'Nekst', fontSize: 12 }} fill={t.faint}>{s}</Text>
      ))}
      {[1, 2, 3, 4, 5].map((v) => (
        <Text key={v} x={xs(v)} y={T + ph + 24} textAnchor="middle" style={{ fontFamily: 'DM Sans', fontSize: 14 }} fill={t.faint}>
          {PROGRESS_WORDS[v - 1]}
        </Text>
      ))}
      <Text x={L + pw / 2} y={H - 6} textAnchor="middle" style={{ fontFamily: 'Nekst', fontSize: 11 }} fill={t.text2}>PROGRESS</Text>
      <Text x={14} y={T + ph / 2} textAnchor="middle" transform={`rotate(-90 14 ${T + ph / 2})`} style={{ fontFamily: 'Nekst', fontSize: 11 }} fill={t.text2}>
        STRATEGIC IMPORTANCE
      </Text>
      {pts.map((p) => {
        const solid = p.q !== 'n';
        return (
          <G key={p.n}>
            <Circle cx={p.x} cy={p.y} r={p.r + 6} fill={FILL[p.q]} fillOpacity={solid ? 0.16 : 0.07} />
            <Circle cx={p.x} cy={p.y} r={p.r} fill={solid ? FILL[p.q] : t.ringFill} stroke={FILL[p.q]} strokeWidth={1} />
            <Text x={p.x} y={p.y + 4.2} textAnchor="middle" style={{ fontFamily: 'Nekst', fontSize: 12 }} fill={solid ? t.onAccent : t.text}>
              {p.n}
            </Text>
          </G>
        );
      })}
      {named && labs.map((l) => l.lines.map((line, i) => {
        const lineH = fs + 3;
        const y0 = l.y - ((l.lines.length - 1) * lineH) / 2 + i * lineH + fs * 0.35;
        return (
          <Text key={`${l.p.n}-${i}`} x={l.x} y={y0} textAnchor={l.a} style={{ fontFamily: 'DM Sans', fontSize: fs }} fill={t.text}>
            {line}
          </Text>
        );
      }))}
    </Svg>
  );
}

function TableHead({ t }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
      <Text style={[label(t.faint), { width: 26 }]}>No.</Text>
      <Text style={[label(t.faint), { width: COL.project }]}>Project</Text>
      <Text style={[label(t.faint), { width: COL.importance, letterSpacing: 1 }]}>Strategic importance</Text>
      <Text style={[label(t.faint), { width: COL.progress, textAlign: 'center', letterSpacing: 1 }]}>Progress</Text>
      <Text style={[label(t.faint), { width: COL.resource, textAlign: 'center', letterSpacing: 1 }]}>Resource required</Text>
    </View>
  );
}

function Row({ t, r }) {
  const q = quadrant(r.progress, r.importance);
  const circleFill = q === 'mi' ? t.mint : q === 'co' ? t.coral : 'transparent';
  const circleBorder = q === 'mi' ? t.mint : q === 'co' ? t.coral : t.text;
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', minHeight: ROW_H, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
      <View style={{ width: 26 }}>
        <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 0.7, borderColor: circleBorder, backgroundColor: circleFill, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'Nekst', fontSize: 6.5, color: q === 'n' ? t.text : t.onAccent }}>{r.n}</Text>
        </View>
      </View>
      <Text style={{ width: COL.project, fontFamily: 'DM Sans', fontSize: 9.5, lineHeight: 1.25, color: t.text, paddingRight: 10 }}>{r.text}</Text>
      <View style={{ width: COL.importance, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 76, height: 1.5, backgroundColor: t.track }}>
          <View style={{ width: `${r.importance}%`, height: 1.5, backgroundColor: t.text }} />
        </View>
        <Text style={{ fontFamily: 'Nekst', fontSize: 7, color: t.text, marginLeft: 8 }}>{pct(r.importance)}</Text>
      </View>
      <View style={{ width: COL.progress, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((k) => (
          <View key={k} style={{ width: 9, height: 1.5, marginHorizontal: 1, backgroundColor: r.progress != null && k <= r.progress ? t.text : t.track }} />
        ))}
      </View>
      <View style={{ width: COL.resource, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {[1, 2, 3, 4, 5].map((k) => {
          const on = r.resource != null && k <= r.resource;
          return (
            <View key={k} style={{ width: 5.5, height: 5.5, borderRadius: 3, marginHorizontal: 2, borderWidth: 0.6, borderColor: on ? t.text2 : t.faint, backgroundColor: on ? t.text2 : 'transparent' }} />
          );
        })}
      </View>
    </View>
  );
}

// A black (or white) rectangle the full size of the paper, behind everything on
// every page, so no viewer ever shows a white edge. It is slightly oversize.
function Bleed({ t }) {
  return (
    <View
      fixed
      style={{ position: 'absolute', top: -2, left: -2, width: PAGE.w + 4, height: PAGE.h + 4, backgroundColor: t.page }}
    />
  );
}

function Footer({ t }) {
  return (
    <View fixed style={{ position: 'absolute', left: PAGE.margin, right: PAGE.margin, bottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Image src="/brand/mark_colour-on-dark.png" style={{ width: 16, height: 16 }} />
      <Text style={{ fontFamily: 'DM Sans', fontSize: 7.5, color: t.faint }}>theclarityproject.co.uk</Text>
      <Text style={{ fontFamily: 'DM Sans', fontSize: 7.5, color: t.faint }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

/** How many project rows fit under the chart on the first page. */
export function firstPageRows(objectiveLength, factorCount) {
  const cols = factorCount <= 1 ? 1 : (factorCount % 3 === 0 ? 3 : 2);
  const factorRows = Math.max(1, Math.ceil(factorCount / cols));
  const used = 30 + 34 + 24 + Math.ceil(objectiveLength / 80) * 16 + 14 + factorRows * 30 + 18
    + CHART_H + 8 + 20 + 8 + 30 + 34 + 44;
  return Math.max(3, Math.min(40, Math.floor((PAGE.h - used) / ROW_H)));
}

/**
 * @param {Object} props
 * @param {'light'|'dark'} props.variant
 * @param {string} props.objective
 * @param {{id: string, text: string}[]} props.factors
 * @param {{n: number, text: string, importance: number, progress: number|null, resource: number|null}[]} props.ranked
 * @param {string} props.dateText e.g. "15 October 2026"
 * @param {(text: string, size: number) => number} props.measure text width in points
 */
export default function AlignmentPdf({ variant, objective, factors, ranked, dateText, measure }) {
  const t = THEMES[variant] || THEMES.light;
  const nf = factors.length;
  const cols = nf <= 1 ? 1 : (nf % 3 === 0 ? 3 : 2);
  const gapPx = 6;
  const cardW = (CONTENT_W - gapPx * (cols - 1)) / cols;
  const anyRated = ranked.some((r) => r.progress != null);
  const first = firstPageRows(objective.length, nf);
  const chunks = [ranked.slice(0, first)];
  for (let i = first; i < ranked.length; i += 30) chunks.push(ranked.slice(i, i + 30));

  return (
    <Document title="Strategic Alignment Health Check" author="The Clarity Project">
      <Page size="A4" style={{ backgroundColor: t.page, paddingTop: 30, paddingBottom: 44, paddingHorizontal: PAGE.margin, fontFamily: 'DM Sans' }}>
        <Bleed t={t} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontFamily: 'Nekst', fontSize: 15, letterSpacing: 1.8, textTransform: 'uppercase', color: t.text }}>
              Strategic Alignment Health Check
            </Text>
            <View style={{ width: 42, height: 0.75, backgroundColor: t.coral, marginTop: 9 }} />
          </View>
          <Text style={{ fontFamily: 'DM Sans', fontSize: 8, color: t.faint }}>{dateText}</Text>
        </View>

        <View style={{ marginTop: 11, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: t.line, borderBottomWidth: 0.5, borderBottomColor: t.line }}>
          <Text style={label(t.text2)}>Objective</Text>
          <Text style={{ fontFamily: 'DM Sans', fontSize: 12, lineHeight: 1.35, color: t.text, marginTop: 5 }}>{objective}</Text>
        </View>

        <Text style={[label(t.text2), { marginTop: 11 }]}>Critical Success Factors</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
          {factors.map((f, i) => {
            const span = cols === 2 && nf % 2 === 1 && i === nf - 1;
            return (
              <View key={f.id} wrap={false} style={{ width: span ? CONTENT_W : cardW, marginRight: !span && (i % cols) < cols - 1 ? gapPx : 0, marginBottom: gapPx, flexDirection: 'row', backgroundColor: t.card, borderWidth: 0.5, borderColor: t.line, borderRadius: 5, padding: 5.5 }}>
                <Text style={{ width: 16, fontFamily: 'Nekst', fontSize: 6.5, color: t.coralText, paddingTop: 1.5 }}>{pad(i + 1)}</Text>
                <Text style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 8.5, lineHeight: 1.3, color: t.text }}>{f.text}</Text>
              </View>
            );
          })}
        </View>

        {anyRated && (
          <View wrap={false}>
            <Text style={[label(t.text2), { marginTop: 8 }]}>Strategic importance versus progress</Text>
            <View style={{ marginTop: 4, alignItems: 'center' }}>
              <Chart t={t} rows={ranked} measure={measure} />
            </View>
          </View>
        )}

        <Text style={[label(t.text2), { marginTop: 8, marginBottom: 5 }]}>Your projects</Text>
        <TableHead t={t} />
        {chunks[0].map((r) => <Row key={r.n} t={t} r={r} />)}
        {chunks.length === 1 && (
          <Text style={{ fontFamily: 'DM Sans', fontSize: 7.5, lineHeight: 1.5, color: t.faint, marginTop: 10 }}>
            {`Strategic importance: a project’s contribution scores added together, divided by the highest possible score (${nf} Critical Success Factors × 3 = ${nf * 3}), shown as a percentage. Numbers match the dots on the chart.`}
          </Text>
        )}
        <Footer t={t} />
      </Page>

      {chunks.slice(1).map((rows, ci) => (
        <Page key={ci} size="A4" style={{ backgroundColor: t.page, paddingTop: 30, paddingBottom: 44, paddingHorizontal: PAGE.margin, fontFamily: 'DM Sans' }}>
          <Bleed t={t} />
          <Text style={[label(t.text2), { marginBottom: 7 }]}>Your projects (continued)</Text>
          <TableHead t={t} />
          {rows.map((r) => <Row key={r.n} t={t} r={r} />)}
          {ci === chunks.length - 2 && (
            <Text style={{ fontFamily: 'DM Sans', fontSize: 7.5, lineHeight: 1.5, color: t.faint, marginTop: 10 }}>
              {`Strategic importance: a project’s contribution scores added together, divided by the highest possible score (${nf} Critical Success Factors × 3 = ${nf * 3}), shown as a percentage. Numbers match the dots on the chart.`}
            </Text>
          )}
          <Footer t={t} />
        </Page>
      ))}
    </Document>
  );
}


