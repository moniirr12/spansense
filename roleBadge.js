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
// There's no shared header/template in this app — each page has its own
// duplicated .navbar markup — so this is a single script included on
// every page rather than a component; it just needs the existing
// .navbar .account-links link to accounts.html to exist, which it does
// everywhere.
// ============================================================

(function () {
    var ROLE_META = {
        engineer:  { label: 'Engineer',  icon: 'fa-user-check' },
        admin:     { label: 'Admin',     icon: 'fa-user-shield' },
        inspector: { label: 'Inspector', icon: 'fa-magnifying-glass' }
    };

    async function init() {
        var accountLink = document.querySelector('.navbar .account-links a[href*="accounts"]');
        if (!accountLink) return;

        try {
            var res = await fetch('/api/check-session');
            var data = await res.json();
            if (!data.loggedIn || !data.role) return;

            var meta = ROLE_META[data.role];
            if (!meta) return;

            var icon = accountLink.querySelector('i');
            if (icon) icon.className = 'fas ' + meta.icon;
            accountLink.title = 'Account · ' + meta.label;
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
