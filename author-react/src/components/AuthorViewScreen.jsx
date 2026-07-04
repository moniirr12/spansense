import { useState } from 'react';
import { CATEGORY_ORDER, STATUS_INFO, buildNarrative, buildConclusionsIntro, buildPriorityBands } from '../data/narrative';

const VIEW_MODES = [
  { key: 'data', icon: 'fa-table-list', label: 'Defect Data' },
  { key: 'split', icon: 'fa-arrows-left-right', label: 'Split View' },
  { key: 'report', icon: 'fa-file-lines', label: 'Report Visual' },
];

export default function AuthorViewScreen({ elements, onBack, onContinue }) {
  const [mode, setMode] = useState('split');
  const [highlighted, setHighlighted] = useState(null);
  const bands = buildPriorityBands(elements);

  function handleSelect(id) {
    setHighlighted(id);
    requestAnimationFrame(() => {
      const target = document.querySelector(`.doc-p.linked[data-el="${id}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  return (
    <div className="fade-in">
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="view-toolbar">
          <div className="view-toggle">
            {VIEW_MODES.map(v => (
              <button key={v.key} className={`vt-btn ${mode === v.key ? 'active' : ''}`} onClick={() => setMode(v.key)}>
                <i className={`fas ${v.icon}`}></i> {v.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--text-mute)' }}>
            <i className="fas fa-circle-info"></i> Click a defect to jump to its paragraph
          </span>
        </div>

        <div className={`author-layout mode-${mode}`}>
          {mode !== 'report' && (
            <div className="pane">
              <div className="pane-title"><i className="fas fa-table-list"></i> Defect Data</div>
              <div>
                {elements.map(el => {
                  const [cls, label] = STATUS_INFO[el.status];
                  return (
                    <div key={el.id} className={`data-row ${highlighted === el.id ? 'highlight' : ''}`} onClick={() => handleSelect(el.id)}>
                      <div className="dr-name">{el.name}</div>
                      <div className="dr-meta">
                        <span className={`status-pill ${cls}`} style={{ marginBottom: 2 }}>{label}</span><br />
                        {el.status === 'defect' ? `Sev ${el.severity} · Ext ${el.extent} · Priority ${el.priority}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mode !== 'data' && (
            <div className="pane" id="reportPane">
              <div className="pane-title"><i className="fas fa-file-lines"></i> Report Preview</div>
              <div className="doc-cover">
                <div className="dc-brand">spanSense</div>
                <div className="dc-title">Foxhollow Footbridge — Principal Inspection</div>
                <div className="dc-sub">Structure ID: FX-102 · Span 1 of 1 · Styled to client convention</div>
              </div>
              <div className="doc-h1">3. Description of Defects</div>
              {CATEGORY_ORDER.map((cat, ci) => (
                <div key={cat}>
                  <div className="doc-h2">3.{ci + 1} {cat}</div>
                  {elements.filter(e => e.category === cat).map((el, ei) => (
                    <div key={el.id}>
                      <div className="doc-h3">3.{ci + 1}.{ei + 1} {el.name}</div>
                      <p
                        className={`doc-p linked ${el.status === 'na' ? 'na' : ''} ${highlighted === el.id ? 'highlight' : ''}`}
                        data-el={el.id}
                        onClick={() => handleSelect(el.id)}
                      >
                        {buildNarrative(el)}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
              <div className="doc-h1">4. Conclusions and Recommendations</div>
              <p className="doc-p">{buildConclusionsIntro(elements)}</p>
              {bands.filter(b => b.items.length > 0).map(b => (
                <div className="priority-band" key={b.code}>
                  <h4 className={b.cls}>{b.label}</h4>
                  <ul>{b.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="bottom-nav">
        <button className="btn-ghost" onClick={onBack}><i className="fas fa-arrow-left"></i> Back to Draft</button>
        <button className="btn-primary-lg" onClick={onContinue}><i className="fas fa-arrow-right"></i> Continue to Export</button>
      </div>
    </div>
  );
}
