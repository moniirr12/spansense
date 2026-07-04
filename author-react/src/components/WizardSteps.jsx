const STEPS = [
  { key: 'style', label: 'Style Source' },
  { key: 'draft', label: 'Draft Report' },
  { key: 'author', label: 'Author View' },
  { key: 'export', label: 'Export' },
];

export default function WizardSteps({ current }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="wizard-steps">
      {STEPS.map((s, i) => (
        <div key={s.key} style={{ display: 'contents' }}>
          {i > 0 && <div className={`wizard-connector ${idx >= i ? 'filled' : ''}`}></div>}
          <div className={`wizard-step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>
            <span className="num">{i + 1}</span>{s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
