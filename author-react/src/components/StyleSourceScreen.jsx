import { useRef, useState } from 'react';

const PROC_STEPS = [
  'Parsing document structure & headings',
  'Extracting narrative tone & sentence patterns',
  'Learning photo-citation & measurement style',
  'Learning priority-banding conventions',
  'Building reusable style profile',
];

export default function StyleSourceScreen({ onContinue }) {
  const [stage, setStage] = useState('upload'); // upload -> analyzing -> profile
  const [fileName, setFileName] = useState(null);
  const [activeStep, setActiveStep] = useState(-1);
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFileName(f.name);
  }

  function analyze() {
    setStage('analyzing');
    let i = 0;
    function next() {
      setActiveStep(i);
      if (i < PROC_STEPS.length) {
        i++;
        setTimeout(next, 550);
      } else {
        setTimeout(() => setStage('profile'), 500);
      }
    }
    setTimeout(next, 300);
  }

  return (
    <div className="fade-in">
      {stage === 'upload' && (
        <div className="card">
          <h2 className="card-title"><i className="fas fa-file-import" style={{ color: 'var(--teal)' }}></i> Learn a Report Style</h2>
          <p className="card-sub">Upload a previous inspection report for this client. Author reads it once and reuses the extracted style for every future report — you don't need to re-upload each time.</p>
          <div className="upload-zone" onClick={() => fileInputRef.current.click()}>
            <i className="fas fa-cloud-arrow-up"></i>
            <div className="u-title">Click to choose a report, or drop it here</div>
            <div className="u-sub">PDF or Word — e.g. last year's Principal Inspection report</div>
          </div>
          <input type="file" ref={fileInputRef} accept=".pdf,.docx,.doc" hidden onChange={handleFile} />
          {fileName && <div className="upload-file-chip"><i className="fas fa-file-pdf"></i> {fileName}</div>}
          {fileName && (
            <div className="export-actions" style={{ marginTop: 20 }}>
              <button className="btn-primary-lg" onClick={analyze}><i className="fas fa-wand-magic-sparkles"></i> Extract Style</button>
            </div>
          )}
        </div>
      )}

      {stage === 'analyzing' && (
        <div className="card">
          <div className="analyzing-wrap">
            <div className="proc-icon"><i className="fas fa-magnifying-glass-chart"></i></div>
            <div className="proc-title">Reading {fileName}…</div>
            <ul className="proc-steps">
              {PROC_STEPS.map((label, i) => (
                <li key={label} className={i < activeStep ? 'done' : i === activeStep ? 'active' : ''}>
                  <span className="chk"></span> {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {stage === 'profile' && (
        <div className="card">
          <h2 className="card-title"><i className="fas fa-swatchbook" style={{ color: 'var(--teal)' }}></i> Extracted Style Profile</h2>
          <p className="card-sub">This is what Author learned. It's reused for every future report for this client — review it once, adjust if needed.</p>
          <div className="profile-source">
            <i className="fas fa-file-lines"></i> Learned from:&nbsp;
            <b>HCC PI Inspection Report FB798 — Millway Footbridge (Stantec, June 2025)</b>
          </div>
          <div className="profile-grid">
            <div className="profile-card"><div className="pc-label">Voice</div><div className="pc-val">Third-person, factual engineering register. Moderate hedging ("appears to", "is likely to have been caused by").</div></div>
            <div className="profile-card"><div className="pc-label">Photo citation</div><div className="pc-val">Inline at sentence end — <i>"(Photo 6, Photo 7)"</i></div></div>
            <div className="profile-card"><div className="pc-label">Measurement style</div><div className="pc-val">Always quantify extent where known — <i>"100mm x 200mm"</i>, <i>"approximately 0.5m depth"</i></div></div>
            <div className="profile-card"><div className="pc-label">Not applicable elements</div><div className="pc-val">Plain <i>"Not applicable"</i> — no elaboration.</div></div>
            <div className="profile-card"><div className="pc-label">Year-on-year continuity</div><div className="pc-val">References prior findings explicitly when a defect has worsened since the last inspection.</div></div>
            <div className="profile-card"><div className="pc-label">Priority banding</div><div className="pc-val">High (0–3 months) · Medium (4–12 months) · Low (13–60 months)</div></div>
          </div>
          <div className="export-actions" style={{ marginTop: 22 }}>
            <button className="btn-primary-lg" onClick={onContinue}><i className="fas fa-arrow-right"></i> Use this style for the current inspection</button>
          </div>
        </div>
      )}
    </div>
  );
}
