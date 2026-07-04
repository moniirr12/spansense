// ============================================================
// USER GREETING (map.html only)
//
// A small "Hello, [name]" glass pill — Option 3 from the test.html
// mockups (frosted glass chip), minus the avatar-initial circle — that
// floats as its own element just left of the navbar, rather than
// living inside it. It tracks the navbar's fixed position/size so it
// stays put next to it on resize, but is otherwise independent markup.
//
// Uses /api/me rather than /api/check-session because the session only
// carries the login username (e.g. "admin"); /api/me's full_name is the
// person's actual name, which is what a greeting should show.
//
// full_name is cached in localStorage so returning to this page shows
// the greeting instantly with no fetch delay. Only the first load on a
// browser, or a changed name, needs to wait on the request.
// ============================================================

(function () {
    var CACHE_KEY = 'spansenseUserGreetingCache';
    var GAP = 14; // space between the pill and the navbar's left edge

    function readCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function writeCache(displayName) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ displayName: displayName })); }
        catch (e) { /* localStorage unavailable (private mode etc.) - fine, just no caching */ }
    }

    function injectStyle() {
        if (document.getElementById('user-greeting-style')) return;
        var style = document.createElement('style');
        style.id = 'user-greeting-style';
        style.textContent =
            '.user-greeting{position:fixed;display:inline-flex;align-items:center;' +
            'padding:8px 18px;border-radius:30px;background:rgba(255,255,255,0.8);' +
            'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
            'border:1px solid rgba(138,180,176,0.3);color:#5b8c8a;font-size:0.85rem;' +
            'font-weight:600;white-space:nowrap;box-shadow:0 2px 12px rgba(91,140,138,0.1);' +
            'z-index:1100;}' +
            '.night-mode .user-greeting{background:rgba(35,46,52,0.8) !important;' +
            'border-color:rgba(138,180,176,0.3) !important;color:#8ab4b0 !important;}';
        document.head.appendChild(style);
    }

    function getPill() {
        var pill = document.getElementById('user-greeting');
        if (!pill) {
            pill = document.createElement('div');
            pill.id = 'user-greeting';
            pill.className = 'user-greeting';
            document.body.appendChild(pill);
        }
        return pill;
    }

    function reposition() {
        var navbar = document.querySelector('.navbar');
        var pill = document.getElementById('user-greeting');
        if (!navbar || !pill) return;
        var navRect = navbar.getBoundingClientRect();
        var pillWidth = pill.offsetWidth;
        var left = navRect.left - GAP - pillWidth;
        if (left < 8) {
            // no room to the left on narrow viewports - hide rather than overlap
            pill.style.display = 'none';
            return;
        }
        pill.style.display = 'inline-flex';
        pill.style.left = left + 'px';
        pill.style.top = (navRect.top + (navRect.height - pill.offsetHeight) / 2) + 'px';
    }

    function render(displayName) {
        var pill = getPill();
        pill.textContent = 'hello, ' + displayName;
        reposition();
    }

    async function init() {
        var cached = readCache();
        if (cached && cached.displayName) {
            injectStyle();
            render(cached.displayName);
        }

        window.addEventListener('resize', reposition);

        try {
            var res = await fetch('/api/me');
            if (!res.ok) {
                // not logged in (401) or other failure - nothing to greet
                var pill = document.getElementById('user-greeting');
                if (pill) pill.remove();
                return;
            }
            var data = await res.json();
            var fullName = data.full_name || data.username;
            if (!fullName) return;
            var displayName = fullName.trim().split(/\s+/)[0];

            injectStyle();
            render(displayName);
            writeCache(displayName);
        } catch (e) {
            console.error('User greeting: failed to load profile', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
