// ============================================================
// ROLE BADGE
//
// Shows the logged-in user's role (inspector/engineer/admin) as a small
// badge in the navbar, on every page. There's no shared header/template in
// this app — each page has its own duplicated .navbar markup — so this is
// a single script included on every page rather than a component; it just
// needs `.navbar .right` to exist, which it does everywhere with the same
// structure (night-mode toggle + account-links).
// ============================================================

(function () {
    var ROLE_META = {
        engineer: {
            label: 'Engineer', icon: 'fa-user-check',
            bg: '#fff8ee', color: '#BA7517', border: '#e8d4b8',
            nightBg: '#3a3020', nightColor: '#d4b86a', nightBorder: '#5a4a30'
        },
        admin: {
            label: 'Admin', icon: 'fa-user-shield',
            bg: '#f1eef7', color: '#6c4fa1', border: '#d8cbea',
            nightBg: '#2a2038', nightColor: '#b79ee0', nightBorder: '#453262'
        },
        inspector: {
            label: 'Inspector', icon: 'fa-hard-hat',
            bg: '#eef6f5', color: '#2d7a6e', border: '#b8ddd5',
            nightBg: '#1e3a35', nightColor: '#8ab4b0', nightBorder: '#3a6b60'
        }
    };

    function injectStyles() {
        if (document.getElementById('roleBadgeStyles')) return;
        var style = document.createElement('style');
        style.id = 'roleBadgeStyles';
        style.textContent =
            '.role-badge{display:inline-flex;align-items:center;gap:6px;font-size:0.7rem;' +
            'font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:6px 12px;' +
            'border-radius:20px;border:1px solid;white-space:nowrap;transition:background 0.2s,color 0.2s,border-color 0.2s;}';
        document.head.appendChild(style);
    }

    function isNightMode() {
        return document.body.classList.contains('night-mode') ||
            document.documentElement.classList.contains('nm-preload');
    }

    function applyTheme(badge, meta) {
        var night = isNightMode();
        badge.style.background = night ? meta.nightBg : meta.bg;
        badge.style.color = night ? meta.nightColor : meta.color;
        badge.style.borderColor = night ? meta.nightBorder : meta.border;
    }

    async function init() {
        var right = document.querySelector('.navbar .right');
        if (!right) return;

        try {
            var res = await fetch('/api/check-session');
            var data = await res.json();
            if (!data.loggedIn || !data.role) return;

            var meta = ROLE_META[data.role];
            if (!meta) return;

            injectStyles();
            var badge = document.createElement('span');
            badge.className = 'role-badge';
            badge.title = 'Signed in as ' + data.username + ' (' + meta.label + ')';
            badge.innerHTML = '<i class="fas ' + meta.icon + '"></i> ' + meta.label;
            applyTheme(badge, meta);
            right.insertBefore(badge, right.firstChild);

            // No shared toggle script exists to hook into directly (each
            // page's night-mode switch is its own inline handler) — watching
            // for the class flip on <body> keeps the badge's colors in sync
            // regardless of which page's toggle fired it.
            new MutationObserver(function () { applyTheme(badge, meta); })
                .observe(document.body, { attributes: true, attributeFilter: ['class'] });
        } catch (e) {
            console.error('Role badge: failed to load session', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
