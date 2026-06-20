// ============================================
// SpanSense - Bridge Map & Modal Logic
// ============================================

// --- Dynamic API Base URL (works on localhost AND production) ---
var API_BASE = window.location.origin.includes('localhost')
    ? 'http://localhost:3000'
    : window.location.origin;  // e.g. https://spansense.onrender.com

let map;
let bridgeMarkers = L.layerGroup();
let darkMap, openStreetMap, satelliteMap;
let bridgeData = [];
let fuse;
let bridgeModalWasOpen = false;

// Helper: close documents modal and restore bridge modal if it was open
function closeDocumentsModalAndRestore() {
    const docsModal = document.getElementById('documentsModal');
    if (docsModal) docsModal.style.display = 'none';

    if (bridgeModalWasOpen) {
        const bridgeModal = document.getElementById('bridgeModal');
        if (bridgeModal) bridgeModal.style.display = 'block';
        bridgeModalWasOpen = false;
    }
}

// Clear, recognizable icons for each structure type - PERMANENT mapping
const getStructureIcon = (type) => {
    const normalizedType = type?.toLowerCase().replace(/\s+/g, '_') || 'bridge';

    const icons = {
        bridge: L.divIcon({
            html: `<div style="
                background: #2c5f8a;
                width: 36px; height: 36px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                border: 2px solid white;
            ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 20 L22 20" stroke="white" fill="none"/>
                    <path d="M4 14 L20 14" stroke="white" fill="none"/>
                    <path d="M6 8 L18 8" stroke="white" fill="none"/>
                    <path d="M8 14 L8 20" stroke="white" fill="none"/>
                    <path d="M12 14 L12 20" stroke="white" fill="none"/>
                    <path d="M16 14 L16 20" stroke="white" fill="none"/>
                    <path d="M4 20 L4 14" stroke="white" fill="none"/>
                    <path d="M20 20 L20 14" stroke="white" fill="none"/>
                    <rect x="2" y="5" width="20" height="3" rx="1" fill="white" stroke="none"/>
                </svg>
            </div>`,
            iconSize: [36, 36],
            popupAnchor: [0, -18],
            className: 'custom-marker'
        }),
        footbridge: L.divIcon({
            html: `<div style="
                background: #2d7a4b;
                width: 36px; height: 36px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                border: 2px solid white;
            ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5">
                    <path d="M3 18 L21 18" stroke="white" fill="none"/>
                    <path d="M6 12 L18 12" stroke="white" fill="none"/>
                    <path d="M9 6 L15 6" stroke="white" fill="none"/>
                    <path d="M6 18 L6 14" stroke="white" fill="none"/>
                    <path d="M12 18 L12 14" stroke="white" fill="none"/>
                    <path d="M18 18 L18 14" stroke="white" fill="none"/>
                    <circle cx="12" cy="20" r="1.5" fill="white" stroke="none"/>
                    <path d="M10 15 L12 17 L14 15" stroke="white" fill="none"/>
                    <path d="M12 14 L10 11" stroke="white" fill="none"/>
                    <path d="M12 14 L14 11" stroke="white" fill="none"/>
                </svg>
            </div>`,
            iconSize: [36, 36],
            popupAnchor: [0, -18],
            className: 'custom-marker'
        }),
        culvert: L.divIcon({
            html: `<div style="
                background: #d97706;
                width: 36px; height: 36px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                border: 2px solid white;
            ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5">
                    <circle cx="12" cy="12" r="8" fill="none" stroke="white"/>
                    <path d="M12 4 L12 2" stroke="white" fill="none"/>
                    <path d="M12 20 L12 22" stroke="white" fill="none"/>
                    <path d="M4 12 L2 12" stroke="white" fill="none"/>
                    <path d="M20 12 L22 12" stroke="white" fill="none"/>
                    <path d="M8 12 Q10 10 12 12 Q14 14 16 12" stroke="white" fill="none"/>
                    <path d="M10 14 L14 14" stroke="white" fill="none"/>
                </svg>
            </div>`,
            iconSize: [36, 36],
            popupAnchor: [0, -18],
            className: 'custom-marker'
        }),
        retaining_wall: L.divIcon({
            html: `<div style="
                background: #991b1b;
                width: 36px; height: 36px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                border: 2px solid white;
            ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5">
                    <rect x="3" y="6" width="18" height="12" rx="1" fill="none" stroke="white"/>
                    <line x1="3" y1="10" x2="21" y2="10" stroke="white"/>
                    <line x1="3" y1="14" x2="21" y2="14" stroke="white"/>
                    <line x1="7" y1="6" x2="7" y2="18" stroke="white"/>
                    <line x1="11" y1="6" x2="11" y2="18" stroke="white"/>
                    <line x1="15" y1="6" x2="15" y2="18" stroke="white"/>
                    <line x1="19" y1="6" x2="19" y2="18" stroke="white"/>
                </svg>
            </div>`,
            iconSize: [36, 36],
            popupAnchor: [0, -18],
            className: 'custom-marker'
        })
    };

    return icons[normalizedType] || icons.bridge;
};

// Function to create a marker with proper icon
function createStructureMarker(bridge) {
    const structureType = bridge.type;

    const marker = L.marker([bridge.latitude, bridge.longitude], {
        icon: getStructureIcon(structureType),
        structureType: structureType,
        structureId: bridge.id,
        structureName: bridge.name,
        originalType: structureType
    });

    marker.bindPopup(`
        <b>${bridge.name}</b><br>
        Location: ${bridge.location}<br>
        Span: ${bridge.span} meters<br>
        Length: ${bridge.length} meters<br>
        Built: ${bridge.built_year}
    `);

    marker.on('mouseover', function(e) { this.openPopup(); });
    marker.on('mouseout', function(e) { this.closePopup(); });

    marker.on('click', function() {
        sessionStorage.setItem('structureId', bridge.id);
        sessionStorage.setItem('structureName', bridge.name);
        sessionStorage.setItem('structureType', bridge.type);
        const modal = document.getElementById('bridgeModal');
        if (modal) modal.style.display = 'block';
        updateModalTitle();
        fetchBridgePhoto(bridge.id);
    });

    return marker;
}

// Rebuild markers based on selected types
function rebuildMarkersFromFilter() {
    bridgeMarkers.clearLayers();

    const selectedTypes = Array.from(document.querySelectorAll('#typeOptions input[name="structureType"]:checked'))
        .map(checkbox => checkbox.value);

    bridgeData.forEach(bridge => {
        if (selectedTypes.includes(bridge.type)) {
            const marker = createStructureMarker(bridge);
            bridgeMarkers.addLayer(marker);
        }
    });

    localStorage.setItem('selectedStructureTypes', JSON.stringify(selectedTypes));
}

// Restore filter state on page load
function restoreFilterState() {
    const saved = localStorage.getItem('selectedStructureTypes');
    if (saved) {
        try {
            const selectedTypes = JSON.parse(saved);
            document.querySelectorAll('#typeOptions input[name="structureType"]').forEach(checkbox => {
                checkbox.checked = selectedTypes.includes(checkbox.value);
            });
            rebuildMarkersFromFilter();
        } catch(e) {
            console.error('Error restoring filter state:', e);
        }
    }
}

// Load the bridge data from the JSON file
fetch('bridges.json')
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        bridgeData = data;

        // Setup Fuse.js for search
        fuse = new Fuse(bridgeData, {
            keys: ['name', 'location'],
            threshold: 0.3
        });

        // Initialize map
        map = L.map('map').setView([54.0, -2.0], 6);
        map.zoomControl.setPosition('topright');

        // Define base layers
        darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        });

        openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });

        satelliteMap = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Maps'
        });

        // Add default base layer
        openStreetMap.addTo(map);

        // Create all markers
        bridgeData.forEach(bridge => {
            const marker = createStructureMarker(bridge);
            bridgeMarkers.addLayer(marker);
        });

        bridgeMarkers.addTo(map);
        restoreFilterState();

        // Setup layer controls
        const baseMaps = {
            "OpenStreetMap": openStreetMap,
            "Satellite": satelliteMap,
            "Dark Mode": darkMap
        };
        const overlayMaps = { "Structures": bridgeMarkers };
        L.control.layers(baseMaps, overlayMaps).addTo(map);

        // Modal click handler
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('bridgeModal');
            if (event.target === modal) modal.style.display = 'none';
        });
    })
    .catch(error => {
        console.error('Error loading bridge data:', error);
        alert('Failed to load bridge data. Check the console for details.');
    });

// Function to update the modal title and details
function updateModalTitle() {
    const structureName = sessionStorage.getItem('structureName');
    const structureId = sessionStorage.getItem('structureId');
    const modalTitle = document.getElementById('modalTitle');
    const assetIdSpan = document.getElementById('assetId');

    if (modalTitle) modalTitle.textContent = structureName || 'Unknown Structure';
    if (assetIdSpan && structureId) assetIdSpan.textContent = structureId;

    const avatarElement = document.getElementById('modalBridgeAvatar');
    if (avatarElement && structureName) {
        const initials = structureName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        avatarElement.textContent = initials;
    }

    const bciScoreElement = document.getElementById('bciScore');
    const lastInspectedElement = document.getElementById('lastInspected');
    if (bciScoreElement) bciScoreElement.innerHTML = '<span style="color: #8a9ba8">Loading...</span>';
    if (lastInspectedElement) lastInspectedElement.textContent = 'Loading...';

    if (structureId) updateBridgeModalData(structureId);
}

function fetchBridgePhoto(bridgeId) {
    fetch(`${API_BASE}/getBridgePhoto?bridgeId=${bridgeId}`)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            const bridgePhoto = document.getElementById('bridgePhoto');
            if (bridgePhoto && data.photo_url) bridgePhoto.src = data.photo_url;
        })
        .catch(error => console.error('Error fetching bridge photo:', error));
}

// Toggle submenu when "View" is clicked
const viewLink = document.getElementById('viewLink');
if (viewLink) {
    viewLink.addEventListener('click', function (e) {
        e.preventDefault();
        const submenu = document.getElementById('viewOptions');
        if (submenu) submenu.classList.toggle('active');
    });
}

// Toggle submenu when "Type" is clicked
const typeLink = document.getElementById('typeLink');
if (typeLink) {
    typeLink.addEventListener('click', function (e) {
        e.preventDefault();
        const submenu = document.getElementById('typeOptions');
        if (submenu) submenu.classList.toggle('active');
    });
}

// Filter markers by structure type
const typeCheckboxes = document.querySelectorAll('#typeOptions input[name="structureType"]');
if (typeCheckboxes.length) {
    typeCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', rebuildMarkersFromFilter);
    });
}

// Night Mode Toggle with Map Support
(function() {
    const toggleBtn = document.getElementById('nightModeToggle');
    if (!toggleBtn) {
        console.log('Night mode button not found');
        return;
    }

    let mapReady = false;
    let checkInterval = setInterval(function() {
        if (typeof map !== 'undefined' && map && darkMap && openStreetMap) {
            mapReady = true;
            clearInterval(checkInterval);
            if (localStorage.getItem('nightMode') === 'on' && darkMap) {
                if (openStreetMap) map.removeLayer(openStreetMap);
                darkMap.addTo(map);
            }
        }
    }, 100);

    toggleBtn.onclick = function(e) {
        e.preventDefault();
        const isNightMode = document.body.classList.toggle('night-mode');

        if (isNightMode) {
            this.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
            if (mapReady && darkMap && openStreetMap) {
                map.removeLayer(openStreetMap);
                darkMap.addTo(map);
            }
        } else {
            this.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
            if (mapReady && darkMap && openStreetMap) {
                map.removeLayer(darkMap);
                openStreetMap.addTo(map);
            }
        }
    };

    if (localStorage.getItem('nightMode') === 'on') {
        document.body.classList.add('night-mode');
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
})();

// Dashboard navigation
document.addEventListener('DOMContentLoaded', function () {
    const changePageButton = document.getElementById('dashboardLink');
    if (changePageButton) {
        changePageButton.addEventListener('click', function () {
            window.location.href = "../dashboard/dashboard.html";
        });
    }
});

// Planning page navigation
const planningLink = document.getElementById('planningLink');
if (planningLink) {
    planningLink.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = "../planning/planning.html";
    });
}

// Twin page navigation
const twinLink = document.getElementById('twinLink');
if (twinLink) {
    twinLink.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = "../twin/twin.html";
    });
}

// Search functionality
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

if (searchInput && searchResults) {
    searchInput.addEventListener('input', function () {
        const query = searchInput.value.trim();
        if (query.length === 0 || typeof fuse === 'undefined') {
            searchResults.style.display = 'none';
            return;
        }

        const results = fuse.search(query).slice(0, 5);

        searchResults.innerHTML = results.map(result => `
            <div data-lat="${result.item.latitude}" data-lng="${result.item.longitude}">
                ${result.item.name} - ${result.item.location}
            </div>
        `).join('');

        searchResults.style.display = results.length ? 'block' : 'none';
    });

    searchResults.addEventListener('click', function (e) {
        if (e.target.tagName === 'DIV') {
            const lat = parseFloat(e.target.getAttribute('data-lat'));
            const lng = parseFloat(e.target.getAttribute('data-lng'));
            if (map) map.setView([lat, lng], 15);
            searchResults.style.display = 'none';
            if (searchInput) searchInput.value = '';
        }
    });

    document.addEventListener('click', function (e) {
        if (searchResults && searchInput && !searchResults.contains(e.target) && e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
}

// Button handlers
const addInspectionBtn = document.getElementById("addInspection");
if (addInspectionBtn) {
    addInspectionBtn.addEventListener("click", function() {
        sessionStorage.removeItem('inspectionMode');
        sessionStorage.removeItem('inspectionData');
        sessionStorage.removeItem('inspectionDate');
        sessionStorage.removeItem('inspectionStructureNumber');
        window.location.href = "../inspection1/inspection1.html";
    });
}

const databaseLink = document.getElementById("databaseLink");
if (databaseLink) {
    databaseLink.addEventListener("click", function() {
        window.location.href = "../database/database.html";
    });
}

// Chat Toggle
const chatToggle = document.querySelector('.chat-toggle');
const chatBox = document.querySelector('.chat-box');
const chatClose = document.querySelector('.chat-close');

if (chatToggle && chatBox) {
    chatToggle.addEventListener('click', () => chatBox.classList.toggle('active'));
}
if (chatClose && chatBox) {
    chatClose.addEventListener('click', () => chatBox.classList.remove('active'));
}

const chatInput = document.querySelector('.chat-input input');
const chatSend = document.querySelector('.chat-send');

function sendMessage() {
    if (!chatInput) return;
    const message = chatInput.value.trim();
    if (message) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', 'user');
        messageDiv.textContent = message;
        const messagesContainer = document.querySelector('.chat-messages');
        if (messagesContainer) {
            messagesContainer.appendChild(messageDiv);
            chatInput.value = '';
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}

if (chatSend && chatInput) {
    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
}

// Fetch previous documents
function fetchPreviousDocuments(structureId) {
    if (!structureId) {
        console.warn('fetchPreviousDocuments: No structureId provided');
        return Promise.reject(new Error('No structureId provided'));
    }
    return fetch(`${API_BASE}/api/previousInspections?structureId=${structureId}`, {
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => {
                throw new Error(errData.message || `HTTP error! Status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (!data.success) throw new Error(data.message || 'Failed to fetch documents');
        return data.documents;
    })
    .catch(error => {
        console.error('Error fetching documents:', error);
        throw error;
    });
}

// Fix modal close buttons
function fixModalCloseButtons() {
    const bridgeModal = document.getElementById('bridgeModal');
    if (bridgeModal) {
        const closeBtn = bridgeModal.querySelector('.close');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                bridgeModal.style.display = 'none';
            });
        }

        const outsideClickHandler = function(event) {
            if (event.target === bridgeModal) bridgeModal.style.display = 'none';
        };
        bridgeModal.removeEventListener('click', outsideClickHandler);
        bridgeModal.addEventListener('click', outsideClickHandler);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    fixModalCloseButtons();
});

// Populate quick-stats in Documents Modal
function populateDocumentsQuickStats(documents) {
    const statLastDate = document.getElementById('statLastDate');
    const statDaysAgo = document.getElementById('statDaysAgo');
    const statCurrentBci = document.getElementById('statCurrentBci');
    const bciTrend = document.getElementById('bciTrend');

    if (!documents || documents.length === 0) {
        if (statLastDate) statLastDate.textContent = '--';
        if (statDaysAgo) statDaysAgo.textContent = '--';
        if (statCurrentBci) { statCurrentBci.textContent = '--'; statCurrentBci.style.color = ''; }
        if (bciTrend) bciTrend.textContent = '';
        return;
    }

    const sortedDocs = [...documents].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestDoc = sortedDocs[0];
    const previousDoc = sortedDocs[1];

    if (statLastDate) statLastDate.textContent = latestDoc.date || 'Unknown';

    if (statDaysAgo && latestDoc.date) {
        const inspectionDate = new Date(latestDoc.date);
        const today = new Date();
        const diffTime = Math.abs(today - inspectionDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) statDaysAgo.textContent = 'Today';
        else if (diffDays === 1) statDaysAgo.textContent = '1 day ago';
        else statDaysAgo.textContent = diffDays + ' days ago';
    }

    if (statCurrentBci && latestDoc.bci_av !== null && latestDoc.bci_av !== undefined) {
        const bciValue = Math.round(parseFloat(latestDoc.bci_av));
        statCurrentBci.textContent = bciValue;
        let bciColor = '';
        if (bciValue >= 90) bciColor = '#22c55e';
        else if (bciValue >= 80) bciColor = '#8ab4b0';
        else if (bciValue >= 65) bciColor = '#eab308';
        else if (bciValue >= 40) bciColor = '#f97316';
        else bciColor = '#dc2626';
        statCurrentBci.style.color = bciColor;
    } else if (statCurrentBci) {
        statCurrentBci.textContent = 'N/A';
        statCurrentBci.style.color = '#8a9ba8';
    }

    if (bciTrend) {
        if (previousDoc && previousDoc.bci_av !== null && previousDoc.bci_av !== undefined) {
            const current = Math.round(parseFloat(latestDoc.bci_av));
            const previous = Math.round(parseFloat(previousDoc.bci_av));
            const diff = current - previous;
            if (diff > 0) bciTrend.innerHTML = '<span style="color: #22c55e">↑ ' + diff + ' from last</span>';
            else if (diff < 0) bciTrend.innerHTML = '<span style="color: #dc2626">↓ ' + Math.abs(diff) + ' from last</span>';
            else bciTrend.innerHTML = '<span style="color: #8a9ba8">→ No change</span>';
        } else {
            bciTrend.innerHTML = '<span style="color: #8a9ba8">First inspection</span>';
        }
    }
}

// ============================================
// SS PREVIOUS INSPECTIONS MODAL
// ============================================
(function () {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let ssAllDocs = [];
  let ssActiveFilter = 'all';
  let ssSearchQuery = '';

  function ssScoreClass(v) {
    if (v >= 65) return 'ss-sg';
    if (v >= 50) return 'ss-sw';
    return 'ss-sd';
  }
  function ssFillClass(v) {
    if (v >= 65) return 'ss-fg';
    if (v >= 50) return 'ss-fw';
    return 'ss-fd';
  }
  function ssBadgeClass(t) {
    if (t === 'GI') return 'ss-badge-gi';
    if (t === 'PI') return 'ss-badge-pi';
    return 'ss-badge-si';
  }
  function ssBadgeLabel(t) {
    if (t === 'GI') return 'General';
    if (t === 'PI') return 'Principal';
    if (t === 'SI') return 'Superficial';
    return t || 'Unknown';
  }
  function ssFormatDate(dateStr) {
    const d = new Date(dateStr);
    return { year: d.getFullYear(), mday: MONTHS[d.getMonth()] + ' ' + d.getDate() };
  }
  function ssFormatMonthYear(dateStr) {
    const d = new Date(dateStr);
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function ssRenderCards() {
    const list = document.getElementById('ssCardList');
    if (!list) return;

    const filtered = ssAllDocs.filter(doc => {
      const matchFilter = ssActiveFilter === 'all' || (doc.inspection_type || '').toUpperCase() === ssActiveFilter;
      const q = ssSearchQuery.toLowerCase();
      const matchSearch = !q ||
        (doc.date || '').includes(q) ||
        ssBadgeLabel(doc.inspection_type).toLowerCase().includes(q) ||
        String(Math.round(doc.bci_crit)).includes(q) ||
        String(Math.round(doc.bci_av)).includes(q) ||
        (doc.inspector_name || '').toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="ss-empty"><i class="fas fa-search"></i><span>No inspections match your search</span></div>';
      return;
    }

    list.innerHTML = filtered.map(doc => {
      const { year, mday } = ssFormatDate(doc.date);
      const critVal = Math.round(parseFloat(doc.bci_crit) || 0);
      const avVal   = Math.round(parseFloat(doc.bci_av)   || 0);
      const isCritical = critVal < 50;
      const inspector = doc.inspector_name || '';
      return `
        <div class="ss-card${isCritical ? ' ss-critical' : ''}">
          <div class="ss-date-block">
            <div class="ss-year">${year}</div>
            <div class="ss-mday">${mday}</div>
          </div>
          <div class="ss-card-body">
            <div class="ss-card-top">
              <span class="ss-type-badge ${ssBadgeClass(doc.inspection_type)}">${ssBadgeLabel(doc.inspection_type)}</span>
              ${inspector ? `<span class="ss-inspector">${inspector}</span>` : ''}
            </div>
          </div>
          <div class="ss-score-pills">
            <div class="ss-score-pill">
              <div class="ss-score-lbl">Crit</div>
              <div class="ss-score-val ${ssScoreClass(critVal)}">${critVal}</div>
              <div class="ss-sbar"><div class="ss-sbar-fill ${ssFillClass(critVal)}" style="width:${critVal}%"></div></div>
            </div>
            <div class="ss-score-pill">
              <div class="ss-score-lbl">Av</div>
              <div class="ss-score-val ${ssScoreClass(avVal)}">${avVal}</div>
              <div class="ss-sbar"><div class="ss-sbar-fill ${ssFillClass(avVal)}" style="width:${avVal}%"></div></div>
            </div>
          </div>
          <div class="ss-card-acts">
            <button class="ss-act-btn ss-act-primary" title="View Report"
              data-action="report" data-date="${doc.date}"><i class="fas fa-file-pdf"></i></button>
            <button class="ss-act-btn" title="Edit Inspection"
              data-action="edit" data-date="${doc.date}"><i class="fas fa-pen"></i></button>
            <button class="ss-act-btn" title="BCI Proforma"
              data-action="bci" data-date="${doc.date}"><i class="fas fa-file-invoice"></i></button>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.ss-act-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const action      = this.dataset.action;
        const date        = this.dataset.date;
        const structureId = sessionStorage.getItem('structureId');
        const structureName = sessionStorage.getItem('structureName');

        if (!structureId) {
            console.warn('No structure selected for action:', action);
            alert('No structure selected. Please click on a bridge marker first.');
            return;
        }

        if (action === 'report') {
          if (typeof generateSimplePDFReport === 'function') {
            generateSimplePDFReport({
              structure_id:   structureId,
              structure_name: structureName,
              date:           date
            });
          } else {
            console.warn('generateSimplePDFReport not found');
          }

        } else if (action === 'edit') {
          sessionStorage.removeItem('inspectionData');
          sessionStorage.setItem('inspectionMode', 'edit');
          sessionStorage.setItem('inspectionDate', date);
          sessionStorage.setItem('inspectionStructureNumber', structureId);
          window.location.href = '../inspection1/inspection1.html';

        } else if (action === 'bci') {
          generateBCIProformaForDate(structureId, structureName, date);
        }
      });
    });
  }

  function ssPopulateStats(docs) {
    const sorted = [...docs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = sorted[0];
    const prev   = sorted[1];

    const totalEl    = document.getElementById('ssStatTotal');
    const countEl    = document.getElementById('ssTotalCount');
    const lastDateEl = document.getElementById('ssStatLastDate');
    const bciEl      = document.getElementById('ssStatBci');

    if (totalEl)    totalEl.textContent = docs.length;
    if (countEl)    countEl.textContent = docs.length;

    if (latest) {
      if (lastDateEl) lastDateEl.textContent = ssFormatMonthYear(latest.date);
      const bciVal  = Math.round(parseFloat(latest.bci_av) || 0);
      let trendHtml = '';
      if (prev && prev.bci_av != null) {
        const diff = bciVal - Math.round(parseFloat(prev.bci_av) || 0);
        if      (diff > 0) trendHtml = `<span class="ss-trend ss-trend-up">↑ ${diff}</span>`;
        else if (diff < 0) trendHtml = `<span class="ss-trend ss-trend-dn">↓ ${Math.abs(diff)}</span>`;
      }
      if (bciEl) bciEl.innerHTML = bciVal + ' ' + trendHtml;
    }
  }

  function ssOpenModal(structureId, bridgeName) {
    const modal = document.getElementById('ssPrevModal');
    if (!modal) return;

    if (!structureId) {
        console.warn('ssOpenModal: No structureId provided');
        return;
    }

    const nameEl = document.getElementById('ssBridgeName');
    const idEl   = document.getElementById('ssStructureId');
    const avEl   = document.getElementById('ssAvatar');
    if (nameEl) nameEl.textContent = bridgeName || '--';
    if (idEl)   idEl.textContent   = structureId || '--';
    if (avEl) {
      const initials = (bridgeName || '--').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      avEl.textContent = initials;
    }

    ssActiveFilter = 'all';
    ssSearchQuery  = '';
    const searchEl = document.getElementById('ssSearchInput');
    if (searchEl) searchEl.value = '';
    document.querySelectorAll('.ss-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.filter === 'all');
    });

    const list = document.getElementById('ssCardList');
    if (list) list.innerHTML = '<div class="ss-empty"><i class="fas fa-spinner fa-spin"></i><span>Loading inspections...</span></div>';
    modal.style.display = 'flex';

    fetch(`${API_BASE}/api/previousInspections?structureId=${structureId}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then(data => {
        const seen = new Set();
        ssAllDocs = (data.documents || []).filter(doc => {
          if (seen.has(doc.date)) return false;
          seen.add(doc.date);
          return true;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        ssPopulateStats(ssAllDocs);
        ssRenderCards();
      })
      .catch(err => {
        console.error('Error fetching inspections:', err);
        if (list) list.innerHTML = '<div class="ss-empty"><i class="fas fa-exclamation-triangle"></i><span>Failed to load inspections</span></div>';
      });
  }

  function ssCloseModal() {
    const modal = document.getElementById('ssPrevModal');
    if (modal) modal.style.display = 'none';

    if (bridgeModalWasOpen) {
      const bridgeModal = document.getElementById('bridgeModal');
      if (bridgeModal) bridgeModal.style.display = 'block';
      bridgeModalWasOpen = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.ss-chip').forEach(chip => {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.ss-chip').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        ssActiveFilter = this.dataset.filter;
        ssRenderCards();
      });
    });

    const searchEl = document.getElementById('ssSearchInput');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        ssSearchQuery = this.value.trim();
        ssRenderCards();
      });
    }

    const closeBtn    = document.getElementById('ssCloseBtn');
    const closeFooter = document.getElementById('ssCloseFooter');
    if (closeBtn)    closeBtn.addEventListener('click',    ssCloseModal);
    if (closeFooter) closeFooter.addEventListener('click', ssCloseModal);

    const modal = document.getElementById('ssPrevModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) ssCloseModal();
      });
    }

    const newInspBtn = document.getElementById('ssNewInspection');
    if (newInspBtn) {
      newInspBtn.addEventListener('click', function () {
        sessionStorage.removeItem('inspectionMode');
        sessionStorage.removeItem('inspectionData');
        sessionStorage.removeItem('inspectionDate');
        sessionStorage.removeItem('inspectionStructureNumber');
        window.location.href = '../inspection1/inspection1.html';
      });
    }

    const seeDocsBtn = document.getElementById('seeDocuments');
    if (seeDocsBtn) {
      seeDocsBtn.addEventListener('click', function () {
        const structureId = sessionStorage.getItem('structureId');
        const bridgeName  = sessionStorage.getItem('structureName');
        if (!structureId) {
          alert('No structure selected. Please click on a bridge marker first.');
          return;
        }

        const bridgeModal = document.getElementById('bridgeModal');
        bridgeModalWasOpen = !!(bridgeModal && (
          bridgeModal.style.display === 'block' ||
          bridgeModal.offsetParent !== null
        ));
        if (bridgeModal) bridgeModal.style.display = 'none';

        ssOpenModal(structureId, bridgeName);
      });
    }
  });
})();

// ============================================
// BCI Proforma Generation
// ============================================
async function generateBCIProformaForDate(structureId, structureName, date) {
    try {
        if (!structureId) {
            alert('No structure selected. Please click on a bridge marker first.');
            return;
        }
        if (typeof pdfMake === 'undefined' || typeof buildBCIProformaContent !== 'function') {
            alert('PDF libraries not loaded. Please refresh the page and try again.');
            return;
        }

        const bridgeRes = await fetch(`${API_BASE}/api/bridges/${structureId}`);
        if (!bridgeRes.ok) throw new Error('Failed to fetch bridge data');
        const bridge = await bridgeRes.json();
        const totalSpans = bridge.span_number || 1;

        const defectsRes = await fetch(
            `${API_BASE}/api/defectsbci?structureId=${structureId}&date=${date}`
        );
        if (!defectsRes.ok) throw new Error('Failed to fetch defects');
        const spansData = await defectsRes.json();

        const worksRes = await fetch(
            `${API_BASE}/api/worksrequired?structureId=${structureId}&date=${date}`
        );
        if (!worksRes.ok) throw new Error('Failed to fetch works required');
        const worksRequired = await worksRes.json();

        const bciFormData = {
            structureName: structureName,
            structureId: structureId,
            bridgeData: bridge,
            totalSpans: totalSpans,
            spansData: spansData,
            worksRequired: worksRequired
        };

        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [40, 40, 40, 40],
            content: [].concat(
                buildBCIProformaContent(bciFormData),
                buildBCIPage2Content(bciFormData)
            ),
            defaultStyle: { font: 'Roboto' }
        };

        const fileName = `BCI_Proforma_${structureId}_${date}.pdf`;
        pdfMake.createPdf(docDefinition).download(fileName);

    } catch (error) {
        console.error('BCI Proforma generation failed:', error);
        alert(`Failed to generate BCI Proforma: ${error.message}`);
    }
}

// ============================================
// Helper: Update bridge modal data
// ============================================
function updateBridgeModalData(structureId) {
    if (!structureId) {
        console.warn('updateBridgeModalData: No structureId provided');
        return;
    }
    fetch(`${API_BASE}/api/bridges/${structureId}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(bridge => {
            const bciScoreElement = document.getElementById('bciScore');
            const lastInspectedElement = document.getElementById('lastInspected');

            if (bciScoreElement && bridge.bci_av) {
                const bciValue = Math.round(parseFloat(bridge.bci_av));
                bciScoreElement.innerHTML = bciValue;
                if (bciValue >= 80) bciScoreElement.style.color = '#5b8c8a';
                else if (bciValue >= 65) bciScoreElement.style.color = '#eab308';
                else if (bciValue >= 40) bciScoreElement.style.color = '#f97316';
                else bciScoreElement.style.color = '#dc2626';
            }

            if (lastInspectedElement && bridge.last_inspection) {
                lastInspectedElement.textContent = bridge.last_inspection;
            }
        })
        .catch(error => console.error('Error fetching bridge data:', error));
}
