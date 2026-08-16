// ============================================
// spanSense - Author Clients
// Simple CRUD over GET/POST/PATCH/DELETE /api/author/clients. A structure
// only ever gets attached to a client via Add Structure's own Client
// picker (navAddStructureBtn below, or the equivalent on Map/Dashboard/
// Planning/Author) - this page is just the client roster itself.
// ============================================
(function () {
    'use strict';

    var API_BASE = window.location.origin.includes('localhost')
        ? 'http://localhost:3000'
        : window.location.origin;

    /* ---------------------------------------------------------
       ADD STRUCTURE - same "go there, come back" trip as author/map.js's
       own addStructureBtn, reusing addStructure.html rather than
       rebuilding it here. authorAddStructure tells that form to show its
       Client picker.
       --------------------------------------------------------- */
    document.getElementById('navAddStructureBtn').addEventListener('click', function (e) {
        e.preventDefault();
        sessionStorage.setItem('addStructureReturnTo', window.location.href);
        sessionStorage.setItem('authorAddStructure', '1');
        window.location.href = 'addStructure.html';
    });

    var toggleBtn = document.getElementById('nightToggle');
    toggleBtn.innerHTML = document.body.classList.contains('night-mode') ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    toggleBtn.addEventListener('click', function () {
        document.body.classList.toggle('night-mode');
        if (document.body.classList.contains('night-mode')) {
            toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
        }
    });

    function escapeHtml(v) {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function initials(name) {
        if (!name) return '??';
        var words = name.trim().split(/\s+/).filter(Boolean);
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return (words[0][0] + words[1][0]).toUpperCase();
    }

    var clients = [];
    var editingId = null;

    function loadClients() {
        return fetch(API_BASE + '/api/author/clients').then(function (r) { return r.json(); }).then(function (d) { clients = d; });
    }

    function renderClients() {
        var el = document.getElementById('clientList');
        if (!clients.length) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i>No clients yet. Add the first council or asset owner you\'re appointed by.</div>';
            return;
        }
        el.innerHTML = clients.map(function (c) {
            var contactBits = [c.contact_name, c.contact_email, c.contact_phone].filter(Boolean);
            return '<div class="client-row" data-id="' + c.id + '">' +
                '<div class="cr-avatar">' + initials(c.name) + '</div>' +
                '<div class="cr-main">' +
                '<div class="cr-name">' + escapeHtml(c.name) + '</div>' +
                '<div class="cr-sub">' + (contactBits.length ? escapeHtml(contactBits.join(' · ')) : 'No contact details yet') + '</div>' +
                '</div>' +
                '<span class="cr-count">' + c.structure_count + ' structure' + (c.structure_count === '1' ? '' : 's') + '</span>' +
                '<div class="cr-actions"><button class="icon-btn edit-client" data-tip="Edit"><i class="fas fa-pen"></i></button></div>' +
                '</div>';
        }).join('');
        Array.prototype.forEach.call(el.querySelectorAll('.edit-client'), function (btn) {
            btn.addEventListener('click', function () {
                var id = Number(btn.closest('.client-row').dataset.id);
                var c = clients.filter(function (x) { return x.id === id; })[0];
                if (c) openClientModal(c);
            });
        });
    }

    var modal = document.getElementById('clientModal');
    var errorEl = document.getElementById('clientModalError');

    function openClientModal(client) {
        editingId = client ? client.id : null;
        document.getElementById('clientModalTitle').textContent = client ? 'Edit client' : 'Add client';
        document.getElementById('deleteClientBtn').style.display = client ? 'inline-flex' : 'none';
        document.getElementById('fName').value = client ? client.name : '';
        document.getElementById('fContactName').value = client ? (client.contact_name || '') : '';
        document.getElementById('fContactEmail').value = client ? (client.contact_email || '') : '';
        document.getElementById('fContactPhone').value = client ? (client.contact_phone || '') : '';
        document.getElementById('fNotes').value = client ? (client.notes || '') : '';
        errorEl.classList.remove('show');
        modal.classList.add('show');
        document.getElementById('fName').focus();
    }
    function closeClientModal() { modal.classList.remove('show'); editingId = null; }

    document.getElementById('addClientBtn').addEventListener('click', function () { openClientModal(null); });
    document.getElementById('clientModalClose').addEventListener('click', closeClientModal);
    document.getElementById('cancelClientBtn').addEventListener('click', closeClientModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeClientModal(); });

    document.getElementById('saveClientBtn').addEventListener('click', function () {
        var name = document.getElementById('fName').value.trim();
        if (!name) {
            errorEl.textContent = 'Name is required.';
            errorEl.classList.add('show');
            document.getElementById('fName').focus();
            return;
        }
        var payload = {
            name: name,
            contact_name: document.getElementById('fContactName').value.trim(),
            contact_email: document.getElementById('fContactEmail').value.trim(),
            contact_phone: document.getElementById('fContactPhone').value.trim(),
            notes: document.getElementById('fNotes').value.trim()
        };
        var url = API_BASE + '/api/author/clients' + (editingId ? '/' + editingId : '');
        var method = editingId ? 'PATCH' : 'POST';
        fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error(res.data.error || 'Could not save this client.');
                closeClientModal();
                return loadClients();
            })
            .then(renderClients)
            .catch(function (err) {
                errorEl.textContent = err.message;
                errorEl.classList.add('show');
            });
    });

    document.getElementById('deleteClientBtn').addEventListener('click', function () {
        if (!editingId) return;
        fetch(API_BASE + '/api/author/clients/' + editingId, { method: 'DELETE' })
            .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error(res.data.error || 'Could not delete this client.');
                closeClientModal();
                return loadClients();
            })
            .then(renderClients)
            .catch(function (err) {
                errorEl.textContent = err.message;
                errorEl.classList.add('show');
            });
    });

    loadClients().then(renderClients).catch(function (err) {
        console.error('Author clients: failed to load /api/author/clients', err);
        document.getElementById('clientList').innerHTML = '<div class="empty-state">Could not load clients.</div>';
    });
})();
