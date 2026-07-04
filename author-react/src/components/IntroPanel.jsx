export default function IntroPanel() {
  return (
    <div className="intro-panel">
      <div className="intro-eyebrow"><i className="fas fa-feather-pointed"></i> AI-Assisted Report Drafting</div>
      <h1>spanSense Author</h1>
      <p>Upload a previous inspection report once to learn a consultancy's house style — voice, photo-citation format,
         priority banding, how it handles "not applicable" elements and year-on-year deterioration. From then on,
         Author drafts the full narrative report from the inspection's defect data in that same style, with the
         inspector able to edit anything before it's generated as a real Word / PDF document, styled exactly like
         spanSense's existing report output.</p>
      <div className="intro-bullets">
        <div className="intro-bullet"><i className="fas fa-file-import"></i> Learn style once per client</div>
        <div className="intro-bullet"><i className="fas fa-pen-to-square"></i> Every drafted sentence stays editable</div>
        <div className="intro-bullet"><i className="fas fa-arrows-left-right"></i> Toggle defect data ↔ formatted report</div>
      </div>
    </div>
  );
}
