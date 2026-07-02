// Makes every fetch() on the page send the session cookie by default.
//
// In local dev the frontend is served from one origin (e.g. Live Server on
// localhost:5500) while the API runs on another (localhost:3000) - that
// makes every API call cross-origin. Browsers only attach cookies to
// cross-origin fetches when the request explicitly opts in with
// `credentials: 'include'`; the default ('same-origin') silently drops
// them. Since almost none of the existing fetch() calls across the app set
// that option, every API request looked logged-out even right after a
// successful login - which is what broke when /api/* routes started
// enforcing requireAuth. Patching fetch here once, instead of editing
// every call site individually, is both smaller and can't be missed.
(function () {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        init = init || {};
        if (init.credentials === undefined) {
            init.credentials = 'include';
        }
        return originalFetch(input, init);
    };
})();
