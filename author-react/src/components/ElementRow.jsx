import { useState } from 'react';
import { buildNarrative, STATUS_INFO } from '../data/narrative';

export default function ElementRow({ el, onChange }) {
  const [editing, setEditing] = useState(false);
  const [cls, label] = STATUS_INFO[el.status];
  const narrative = buildNarrative(el);

  function update(field, value) {
    onChange({ ...el, [field]: field === 'severity' ? (parseInt(value, 10) || 0) : value });
  }

  return (
    <div className="el-row">
      <div className="el-name">{el.name}</div>
      <div className="el-body">
        <span className={`status-pill ${cls}`}>{label}</span>
        <div className="el-narrative">{narrative}</div>
        {el.status === 'defect' && (
          <>
            <button className="el-edit-btn" onClick={() => setEditing(v => !v)}>
              <i className="fas fa-pen"></i> Edit
            </button>
            <div className={`el-editor ${editing ? 'open' : ''}`}>
              <div className="el-editor-row">
                <div>
                  <span className="mini-lbl">Severity</span>
                  <input type="number" min="1" max="5" value={el.severity}
                    onChange={e => update('severity', e.target.value)} style={{ width: 60 }} />
                </div>
                <div>
                  <span className="mini-lbl">Extent</span>
                  <select value={el.extent} onChange={e => update('extent', e.target.value)}>
                    {['A', 'B', 'C', 'D', 'E'].map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div>
                  <span className="mini-lbl">Priority</span>
                  <select value={el.priority} onChange={e => update('priority', e.target.value)}>
                    <option value="H">High</option>
                    <option value="M">Medium</option>
                    <option value="L">Low</option>
                  </select>
                </div>
                <div>
                  <span className="mini-lbl">Cost (£)</span>
                  <input type="number" value={el.cost || ''} onChange={e => update('cost', e.target.value)} style={{ width: 90 }} />
                </div>
              </div>
              <span className="mini-lbl">Inspector note (drives the drafted sentence)</span>
              <textarea value={el.comment} onChange={e => update('comment', e.target.value)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
