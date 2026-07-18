// Replace your existing updateBridgeModalData with this:
async function updateBridgeModalData(structureId) {

    // Quick-info grid (location badge + span/length/built/type) - independent
    // of the BCI/last-inspected fetch below, so a failure here doesn't affect that.
    fetch(`/api/bridges/${structureId}`)
        .then(response => response.ok ? response.json() : null)
        .then(bridge => {
            if (!bridge) return;
            const locationElement = document.getElementById('modalLocation');
            const cycleElement = document.getElementById('modalCycle');
            const lengthElement = document.getElementById('modalLength');
            const builtElement = document.getElementById('modalBuilt');
            const typeElement = document.getElementById('modalType');
            if (locationElement) locationElement.textContent = bridge.location || '--';
            if (cycleElement) {
                // Same 2yr/6yr fallback as computeNextDue/planning.html's
                // getGiCycleYears - a bridge without its own override still
                // has a real cycle, just the portfolio default one.
                const gi = (bridge.gi_cycle_years && bridge.gi_cycle_years > 0) ? bridge.gi_cycle_years : 2;
                const pi = (bridge.pi_cycle_years && bridge.pi_cycle_years > 0) ? bridge.pi_cycle_years : 6;
                cycleElement.textContent = `GI ${gi}y · PI ${pi}y`;
            }
            if (lengthElement) lengthElement.textContent = bridge.length ? `${bridge.length}m` : '--';
            if (builtElement) builtElement.textContent = bridge.built_year || '--';
            if (typeElement) typeElement.textContent = bridge.type || '--';
        })
        .catch(error => console.error('Error fetching bridge quick-info:', error));

    try {
        // Use the SAME endpoint that works in the Previous Inspections modal
        const response = await fetch(`/api/previousInspections?structureId=${structureId}`);
        const data = await response.json();
        
        if (data.documents && data.documents.length > 0) {
            // Sort by date - newest first (same as Previous Inspections modal)
            const sortedDocs = [...data.documents].sort((a, b) => {
                return new Date(b.date) - new Date(a.date);
            });
            
            const latestDoc = sortedDocs[0];
            
            // Update Last Inspected Date
            const lastInspectedElement = document.getElementById('lastInspected');
            if (lastInspectedElement && latestDoc.date) {
                let formattedDate = latestDoc.date;
                try {
                    const date = new Date(latestDoc.date);
                    if (!isNaN(date.getTime())) {
                        formattedDate = date.toLocaleDateString('en-GB', { 
                            month: 'short', 
                            year: 'numeric' 
                        });
                    }
                } catch(e) {
                    console.error('Date parsing error:', e);
                }
                lastInspectedElement.textContent = formattedDate;
            }
            
            // Update BCI Score - SAME logic as Previous Inspections modal
            const bciScoreElement = document.getElementById('bciScore');
            if (bciScoreElement && latestDoc.bci_av !== null && latestDoc.bci_av !== undefined) {
                const bciValue = Math.round(parseFloat(latestDoc.bci_av));

                const tier = bciTier(bciValue); // shared with map.js's marker-ring coloring - see condRing there

                bciScoreElement.innerHTML = `${bciValue} - ${tier.label}`;
                bciScoreElement.style.color = tier.color;
            } else if (bciScoreElement) {
                bciScoreElement.innerHTML = 'No data';
                bciScoreElement.style.color = '#8a9ba8';
            }
        } else {
            // No inspections found - show pending state
            const bciScoreElement = document.getElementById('bciScore');
            const lastInspectedElement = document.getElementById('lastInspected');
            
            if (bciScoreElement) {
                bciScoreElement.innerHTML = 'No data';
                bciScoreElement.style.color = '#8a9ba8';
            }
            if (lastInspectedElement) {
                lastInspectedElement.textContent = 'Not inspected';
            }
        }
    } catch (error) {
        console.error('Error fetching bridge data:', error);
        const bciScoreElement = document.getElementById('bciScore');
        const lastInspectedElement = document.getElementById('lastInspected');
        
        if (bciScoreElement) {
            bciScoreElement.innerHTML = 'Error loading data';
            bciScoreElement.style.color = '#dc2626';
        }
        if (lastInspectedElement) {
            lastInspectedElement.textContent = 'Unavailable';
        }
    }
}

// Function to get initials from bridge name
function getBridgeInitials(bridgeName) {
    if (!bridgeName) return '??';
    
    // Split by spaces and get first letters
    const words = bridgeName.trim().split(/\s+/);
    
    if (words.length === 1) {
        // Single word - take first two letters
        return words[0].substring(0, 2).toUpperCase();
    } else {
        // Multiple words - take first letter of first two words
        const firstInitial = words[0].charAt(0);
        const secondInitial = words[1].charAt(0);
        return (firstInitial + secondInitial).toUpperCase();
    }
}

// Update the modal title and avatar
function updateModalTitle() {
    const structureName = sessionStorage.getItem('structureName');
    const structureId = sessionStorage.getItem('structureId');
    const modalTitle = document.getElementById('modalTitle');
    const modalBridgeAvatar = document.getElementById('modalBridgeAvatar');
    const assetIdSpan = document.getElementById('assetId');
    const bridgeIdSpan = document.getElementById('bridgeId'); // For the structure ID in header
    
    // Update title
    if (modalTitle) {
        modalTitle.textContent = structureName || 'Unknown Bridge';
    }
    
    // Update avatar with bridge initials
    if (modalBridgeAvatar && structureName) {
        modalBridgeAvatar.textContent = getBridgeInitials(structureName);
    }
    
    // Update structure ID in bridge modal
    if (assetIdSpan && structureId) {
        assetIdSpan.textContent = structureId;
    }
    
    // Update structure ID in the header (if using the documents modal style header)
    if (bridgeIdSpan && structureId) {
        bridgeIdSpan.textContent = structureId;
    }
    
    // Update subtitle (old style, keep for compatibility)
    const subtitle = document.querySelector('.bridge-subtitle');
    if (subtitle && structureId) {
        subtitle.textContent = `Asset ID: ${structureId}`;
    }
    
    // Also update the bridge name in the documents modal
    const bridgeNameElement = document.getElementById('bridgeName');
    if (bridgeNameElement && structureName) {
        bridgeNameElement.textContent = structureName;
    }
    
    // Update the avatar in documents modal as well
    const docsModalAvatar = document.querySelector('#documentsModal .bridge-avatar');
    if (docsModalAvatar && structureName) {
        docsModalAvatar.textContent = getBridgeInitials(structureName);
    }
    
    // Update the structure ID in documents modal
    const docsBridgeId = document.querySelector('#documentsModal #bridgeId');
    if (docsBridgeId && structureId) {
        docsBridgeId.textContent = structureId;
    }
    
    // Fetch and display latest inspection data
    if (structureId) {
        updateBridgeModalData(structureId);
    }
}

