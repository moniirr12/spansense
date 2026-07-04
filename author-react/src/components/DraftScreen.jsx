import { CATEGORY_ORDER } from '../data/narrative';
import ElementRow from './ElementRow';

export default function DraftScreen({ elements, onChangeElement, onContinue }) {
  return (
    <div className="card fade-in">
      <h2 className="card-title"><i className="fas fa-sparkles" style={{ color: 'var(--ai)' }}></i> Drafted Narrative — Foxhollow Footbridge</h2>
      <p className="card-sub">Author has written one paragraph per inspected element, in the style learned above, from the defect data below. Edit anything — the report view updates live.</p>
      {CATEGORY_ORDER.map(cat => (
        <div className="cat-group" key={cat}>
          <div className="cat-title">{cat}</div>
          {elements.filter(e => e.category === cat).map(el => (
            <ElementRow key={el.id} el={el} onChange={onChangeElement} />
          ))}
        </div>
      ))}
      <div className="bottom-nav">
        <span style={{ fontSize: '.8rem', color: 'var(--text-mute2)' }}>
          {elements.length} elements drafted across {CATEGORY_ORDER.length} categories
        </span>
        <button className="btn-primary-lg" onClick={onContinue}><i className="fas fa-arrow-right"></i> Continue to Author View</button>
      </div>
    </div>
  );
}
