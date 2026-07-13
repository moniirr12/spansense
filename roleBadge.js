// ============================================================
// ROLE BADGE
//
// Shows the logged-in user's role by swapping the existing account-link
// icon in the navbar (the one that goes to accounts.html) for a role-
// specific symbol — magnifying glass for inspector, a checked user for
// engineer, a shield for admin. Everything else about that link (href,
// hover behavior, position) is untouched; only the glyph changes, so
// there's no new element, no background, and no spacing to account for.
//
// The account link is targeted by position (first icon in .account-links),
// not by its href — on accounts.html itself that link is a self-referencing
// "#" placeholder rather than a real link to the page you're already on,
// so matching on href would miss it there.
//
// Session role is cached in localStorage so returning to any page shows
// the right icon instantly with no fetch delay. The one moment that still
// needs `/api/check-session` — the very first load on a browser, or the
// role actually having changed — eases the icon in with a fade instead of
// popping straight from the default glyph.
//
// There's no shared header/template in this app — each page has its own
// duplicated .navbar markup — so this is a single script included on
// every page rather than a component.
// ============================================================

(function () {
    // Same local-dev detection as test.js/map.js - without it, a bare
    // relative fetch resolves against whatever origin is serving this file
    // (e.g. Live Server on 127.0.0.1:5500), which has no /api/* routes.
    var API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3000'
        : window.location.origin;

    var ROLE_META = {
        engineer:  { label: 'Engineer',  icon: 'fa-user-check' },
        admin:     { label: 'Admin',     icon: 'fa-user-shield' },
        inspector: { label: 'Inspector', icon: 'fa-magnifying-glass' }
    };
    var CACHE_KEY = 'spansenseRoleCache';
    var FADE_MS = 220;

    function readCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function writeCache(username, role) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ username: username, role: role })); }
        catch (e) { /* localStorage unavailable (private mode etc.) — fine, just no caching */ }
    }

    function morphIcon(icon, meta) {
        icon.style.transition = 'opacity ' + FADE_MS + 'ms ease';
        icon.style.opacity = '0';
        setTimeout(function () {
            icon.className = 'fas ' + meta.icon;
            void icon.offsetWidth; // force reflow so the fade-in isn't skipped
            icon.style.opacity = '1';
        }, FADE_MS);
    }

    async function init() {
        var accountLink = document.querySelector('.navbar .account-links a:first-child');
        if (!accountLink) return;
        var icon = accountLink.querySelector('i');
        if (!icon) return;

        var cached = readCache();
        if (cached && ROLE_META[cached.role]) {
            // Instant, no transition — the common case for every load after
            // the first, with zero perceptible delay.
            icon.className = 'fas ' + ROLE_META[cached.role].icon;
            accountLink.title = 'Account · ' + ROLE_META[cached.role].label;
        }

        try {
            var res = await fetch(API_BASE + '/api/check-session');
            var data = await res.json();
            if (!data.loggedIn || !data.role) return;

            var meta = ROLE_META[data.role];
            if (!meta) return;

            if (!cached || cached.role !== data.role) {
                // First load on this browser, or the role actually changed —
                // ease into the new icon rather than popping straight to it.
                morphIcon(icon, meta);
                accountLink.title = 'Account · ' + meta.label;
            }
            writeCache(data.username, data.role);
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
