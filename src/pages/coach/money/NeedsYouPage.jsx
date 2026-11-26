import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loading, useIsPhone } from '../../../components/design';
import { Card, Empty, PageOpening, Row, Rows, dayTitle } from '../../../components/design/Blocks';
import { needsYouLine } from '../../../content/pageLines/coach';
import { EMPTY_LINE } from '../../../lib/agreements/needsYou';
import { useNeedsYouItems } from '../needsYou/NeedsYou';
import { NeedsYouDetail } from '../needsYou/panels';
import { Back, useCoachPortal } from '../parts';
import '../needsYou/needsyou.css';
import './money.css';

// Needs you (Polish 1, Stage C, C2; M28 version 6, "needs": /coach/needs-you). Every drafted next step as one list,
// with the chosen item's detail beside it (on a phone, as M28's columns do, the detail above the list): the same
// drafted email, invoice or question as Today's side panels (needsYou/panels.jsx), its button first, nothing sent until
// it is pressed. The chosen item is kept in the address (?item=), so Back and a reload come back to it. Once an item
// goes (sent, Done or Not now) the next one shows.

export default function NeedsYouPage() {
  const navigate = useNavigate();
  const p = useCoachPortal();
  const isPhone = useIsPhone();
  const [params, setParams] = useSearchParams();
  const partial = Boolean(p.partial);
  const items = useNeedsYouItems(p.todayKey, partial);
  const asked = params.get('item');
  const chosen = items.find((i) => i.key === asked) || items[0] || null;
  const detailRef = useRef(null);
  const [moved, setMoved] = useState(0);
  // On a phone the detail sits above the list: choosing a row shows it (M28's scrollIntoView).
  useEffect(() => {
    if (!moved || !isPhone) return;
    detailRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [moved, isPhone]);
  const choose = (i) => { setParams({ item: i.key }, { replace: true }); setMoved((n) => n + 1); };
  const gone = () => setParams({}, { replace: true });

  return (
    <div className="cc-page">
      <div className="cc-col cc-money-page">
        <Back to="Today" onClick={() => navigate('/coach')} />
        <PageOpening label={dayTitle(p.todayKey)} title="Needs you" line={partial ? null : needsYouLine(items.length)} />
        {partial ? <Loading label="Loading what needs you" /> : items.length === 0 ? (
          <Card label="Needs you"><Empty action={{ children: 'Back to Today', onClick: () => navigate('/coach') }}>{EMPTY_LINE}</Empty></Card>
        ) : (
          <div className="ds-cols ds-cols--needs-first cc-money-needs">
            <div>
              <Card className="cc-money-needs-list" aria-label="Waiting for you">
                <Rows label="Needs you">
                  {items.map((i) => (
                    <Row key={i.key} name={i.title} sub={i.line} value={i.when} onClick={() => choose(i)}
                      className={i.key === chosen?.key ? 'cc-money-chosen' : undefined} label={`${i.title}. ${i.line || ''} ${i.when || ''}. Show it`.replace(/\s+/g, ' ')} />
                  ))}
                </Rows>
              </Card>
            </div>
            <div ref={detailRef} className="cc-money-needs-detail" aria-live="polite">
              <NeedsYouDetail item={chosen} onDone={gone} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
