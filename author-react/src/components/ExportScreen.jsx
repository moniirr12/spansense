import { useState } from 'react';
import { CATEGORY_ORDER, STYLE_PROFILE, buildNarrative, buildConclusionsIntro, buildPriorityBands } from '../data/narrative';

export default function ExportScreen({ elements, onBack }) {
  const [overlay, setOverlay] = useState(null); // null | 'loading' | 'done'
  const [overlayText, setOverlayText] = useState({ title: '', sub: '' });

  const payload = {
    structure: 'Foxhollow Footbridge', structureId: 'FX-102', span: 1,
    styleSource: STYLE_PROFILE.source,
    sections: CATEGORY_ORDER.map(cat => ({
      category: cat,
      elements: elements.filter(e => e.category === cat).map(el => ({
        name: el.name, status: el.status, narrative: buildNarrative(el),
        severity: el.severity || null, extent: el.extent || null, priority: el.priority || null, cost: el.cost || null,
      })),
    })),
    conclusions: { intro: buildConclusionsIntro(elements), priorityBands: buildPriorityBands(elements) },
  };

  function generate(title, sub) {
    setOverlayText({ title, sub });
    setOverlay('loading');
    setTimeout(() => setOverlay('done'), 1400);
  }

  return (
    <div className="fade-in">
      <div className="card">
        <h2 className="card-title"><i className="fas fa-file-export" style={{ color: 'var(--teal)' }}></i> Generate &amp; Export</h2>
        <p className="card-sub">
          This assembled structure — categories, per-element narrative, and the priority-banded conclusions — feeds the
          same document generator spanSense already uses (<code>reportFull.docx.js</code> / <code>bciProforma.pdfmake.js</code>),
          so the output keeps spanSense's existing styling and layout.
        </p>
        <div className="export-actions">
          <button className="btn-primary-lg" onClick={() => generate('Generating Word report', 'Applying learned style to the full narrative')}>
            <i className="fas fa-file-word"></i> Generate Word Report
          </button>
          <button className="btn-ghost" onClick={() => generate('Generating BCI Proforma', 'Building the per-span defect grid')}>
            <i className="fas fa-file-pdf"></i> Download BCI Proforma (PDF)
          </button>
        </div>
        <details className="json-details">
          <summary><i className="fas fa-code"></i> View assembled report JSON</summary>
          <pre>{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </div>
      <div className="bottom-nav">
        <button className="btn-ghost" onClick={onBack}><i className="fas fa-arrow-left"></i> Back to Author View</button>
      </div>

      {overlay && (
        <div className="save-overlay show">
          <div className={`save-box ${overlay === 'done' ? 'success' : ''}`}>
            {overlay === 'loading' ? (
              <>
                <div className="ic"><i className="fas fa-cog fa-spin"></i></div>
                <h3>{overlayText.title}…</h3>
                <p>{overlayText.sub}</p>
              </>
            ) : (
              <>
                <div className="ic"><i className="fas fa-check"></i></div>
                <h3>Done</h3>
                <p>This preview doesn't write a real file — in production this hands off to spanSense's existing docx/pdf generators.</p>
                <div style={{ marginTop: 18 }}>
                  <button className="btn-mini" onClick={() => setOverlay(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
