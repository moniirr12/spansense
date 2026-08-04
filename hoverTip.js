/* ============================================================
   SPANSENSE - SHARED HOVER TOOLTIP
   ============================================================
   A dark-card tooltip (matches twinView's .chart-tooltip/.defect-popup
   look) for any element with data-tip="...". Include this one script on
   a page and it works everywhere - no extra CSS/markup needed.

   Use in place of a plain title="..." attribute wherever the hint is
   genuinely informational, since a native title tooltip's appearance
   depends on the visitor's own OS theme rather than the app's - it only
   happens to look like this style when the visitor's system is already
   in dark mode.
   ============================================================ */
(function() {
    var style = document.createElement('style');
    style.textContent =
        '.hover-tip {' +
        '  position: fixed;' +
        '  background: #2c4a48; color: #f2f6f5; font-size: 0.72rem; line-height: 1.4;' +
        '  border-radius: 8px; padding: 6px 10px;' +
        '  box-shadow: 0 6px 18px rgba(0,0,0,0.18);' +
        '  pointer-events: none; opacity: 0; transition: opacity 0.12s;' +
        '  z-index: 3000; white-space: nowrap;' +
        '  transform: translate(-50%, -100%);' +
        '  font-family: "Inter", sans-serif;' +
        '}' +
        '.hover-tip.show { opacity: 1; }' +
        '.night-mode .hover-tip { background: #0f1619; }';
    document.head.appendChild(style);

    var tip = document.createElement('div');
    tip.className = 'hover-tip';
    // Some pages load this alongside fetch-credentials.js/roleBadge.js at
    // the very top of <head>, before <body> exists - guard for that instead
    // of assuming it's only ever loaded at the end of body.
    if (document.body) {
        document.body.appendChild(tip);
    } else {
        document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(tip); });
    }

    function show(target) {
        var text = target.getAttribute('data-tip');
        if (!text) return;
        tip.textContent = text;
        var r = target.getBoundingClientRect();
        tip.style.left = (r.left + r.width / 2) + 'px';
        tip.style.top = (r.top - 8) + 'px';
        tip.classList.add('show');
    }
    function hide() { tip.classList.remove('show'); }

    document.addEventListener('mouseover', function(e) {
        var target = e.target.closest('[data-tip]');
        if (target) show(target);
    });
    document.addEventListener('mouseout', function(e) {
        var target = e.target.closest('[data-tip]');
        if (target) hide();
    });
    document.addEventListener('focusin', function(e) {
        var target = e.target.closest('[data-tip]');
        if (target) show(target);
    });
    document.addEventListener('focusout', function(e) {
        var target = e.target.closest('[data-tip]');
        if (target) hide();
    });
})();
