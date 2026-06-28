function openModal(isEditMode = false, preferredState = null) {
    console.log('openModal called', isEditMode, 'preferredState:', preferredState);

    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Modal element not found!');
        return;
    }

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        let mainRow = null;
        if (currentExpandableRow) {
            mainRow = findMainRow(currentExpandableRow);
        } else if (currentRow) {
            mainRow = currentRow.classList.contains('main-row') ? currentRow : findMainRow(currentRow);
        }
        const elementDesc = mainRow ? mainRow.querySelector('.description')?.textContent?.trim() : '';
        if (isEditMode) {
            modalTitle.textContent = elementDesc ? `Edit Defect - ${elementDesc}` : 'Edit Defect';
        } else {
            modalTitle.textContent = elementDesc ? `Add Defect - ${elementDesc}` : 'Add Defect';
        }
    }

    let targetState = preferredState;
    if (!targetState && !isEditMode) {
        targetState = 'defect';
    }

    if (targetState) {
        document.getElementById('of-defect-panel').style.display = 'none';
        document.getElementById('of-no-defects-panel').style.display = 'none';
        document.getElementById('of-not-inspected-panel').style.display = 'none';

        if (targetState === 'defect') {
            document.getElementById('of-defect-panel').style.display = 'block';
        } else if (targetState === 'no-defects') {
            document.getElementById('of-no-defects-panel').style.display = 'block';
        } else if (targetState === 'not-inspected') {
            document.getElementById('of-not-inspected-panel').style.display = 'block';
        }

        document.querySelectorAll('.of-segment').forEach(s => s.classList.remove('of-active'));
        const segBtn = document.querySelector(`.of-segment[data-state="${targetState}"]`);
        if (segBtn) segBtn.classList.add('of-active');

        // Severity guidance only makes sense while picking a defect type/number
        // (mirrors setModalSegment, which handles this same toggle when the
        // user switches segments from inside an already-open modal).
        const guidancePanel = document.getElementById('defectGuidancePanel');
        if (guidancePanel) {
            guidancePanel.style.display = targetState === 'defect' ? 'flex' : 'none';
            if (targetState === 'defect' && typeof updateDefectGuidancePanel === 'function') {
                updateDefectGuidancePanel();
            }
        }

        modal.dataset.modalState = targetState;
        modal.dataset.ofState = targetState;
    } else if (!isEditMode) {
        document.querySelectorAll('.of-segment').forEach(function(seg) {
            seg.classList.remove('of-active');
            if (seg.dataset.state === 'defect') seg.classList.add('of-active');
        });
        document.getElementById('of-defect-panel').style.display = 'block';
        document.getElementById('of-no-defects-panel').style.display = 'none';
        document.getElementById('of-not-inspected-panel').style.display = 'none';
        modal.dataset.modalState = 'defect';

        document.getElementById("defectType").value = "1";
        // FIX #1: Trigger change event to populate defectNumber dropdown
        document.getElementById("defectType").dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById("defectNumber").value = "1";
        document.getElementById("severity").value = "1";
        document.getElementById("extent").value = "A";
        document.getElementById("works").value = "N";
        document.getElementById("priority").value = "";
        document.getElementById("cost").value = "";
        document.getElementById("comment").value = "";
        document.getElementById("remedialWorks").value = "";
        document.getElementById("of-no-defects-comment").value = "";
        document.getElementById("of-not-inspected-comment").value = "";
    }

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.dataset.scrollY = scrollY;
    document.body.classList.add('modal-open');

    modal.style.display = 'flex';
    modal.classList.add('active');

    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.removeEventListener('keydown', escapeHandler);
    document.addEventListener('keydown', escapeHandler);

    console.log('Modal opened successfully, state:', modal.dataset.modalState);
}

// ============================================
// OPTION F — STEPPER CONTROLLER
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    var isAutoCorrecting = false;

    function setSeverityStepper(val, skipValidation) {
        var sel = document.getElementById('severity');
        if (sel) sel.value = String(val);
        var disp = document.getElementById('severityStepperValue');
        if (disp) disp.textContent = val;
        var bar = document.getElementById('severityProgressBar');
        if (bar) bar.setAttribute('data-value', String(val));
        document.querySelectorAll('.severity-stepper .stepper-step').forEach(function(btn) {
            btn.classList.toggle('active', parseInt(btn.dataset.val) === val);
        });
        if (typeof updateDefectGuidancePanel === 'function') updateDefectGuidancePanel();
        if (!skipValidation && !isAutoCorrecting) {
            var currentExtent = document.getElementById('extent');
            var extVal = currentExtent ? currentExtent.value : 'A';
            if (val === 1 && extVal !== 'A') {
                isAutoCorrecting = true;
                setExtentStepper('A', true);
                setTimeout(function() { isAutoCorrecting = false; }, 50);
                return;
            }
            if (val >= 2 && extVal === 'A') {
                isAutoCorrecting = true;
                setExtentStepper('B', true);
                setTimeout(function() { isAutoCorrecting = false; }, 50);
                return;
            }
        }
    }

    function setExtentStepper(val, skipValidation) {
        var sel = document.getElementById('extent');
        if (sel) sel.value = val;
        var disp = document.getElementById('extentStepperValue');
        if (disp) disp.textContent = val;
        var bar = document.getElementById('extentProgressBar');
        if (bar) bar.setAttribute('data-value', val);
        document.querySelectorAll('.extent-stepper .stepper-step').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.val === val);
        });
        if (!skipValidation && !isAutoCorrecting) {
            var currentSeverity = document.getElementById('severity');
            var sevVal = currentSeverity ? parseInt(currentSeverity.value) : 1;
            if (val === 'A' && sevVal !== 1) {
                isAutoCorrecting = true;
                setSeverityStepper(1, true);
                setTimeout(function() { isAutoCorrecting = false; }, 50);
                return;
            }
            if (val !== 'A' && sevVal === 1) {
                isAutoCorrecting = true;
                setSeverityStepper(2, true);
                setTimeout(function() { isAutoCorrecting = false; }, 50);
                return;
            }
        }
    }

    function setWorksStepper(val, skipFieldClear) {
        var sel = document.getElementById('works');
        if (sel) sel.value = val;
        var display = document.getElementById('worksStepperValue');
        if (display) {
            if (val === 'Y') display.textContent = 'Yes';
            else if (val === 'N') display.textContent = 'No';
            else display.textContent = 'Monitor';
        }
        var card = document.getElementById('worksStepperCard');
        if (card) {
            card.classList.remove('works-yes', 'works-no', 'works-monitor');
            if (val === 'Y') card.classList.add('works-yes');
            else if (val === 'N') card.classList.add('works-no');
            else if (val === 'M') card.classList.add('works-monitor');
        }
        var detail = document.getElementById('worksDetailSection');
        var divider = document.getElementById('worksDetailDivider');
        if (val === 'Y') {
            if (detail) detail.style.display = 'block';
            if (divider) divider.style.display = 'block';
        } else {
            if (detail) detail.style.display = 'none';
            if (divider) divider.style.display = 'none';
            if (!skipFieldClear) {
                if (document.getElementById('priority')) document.getElementById('priority').value = '';
                if (document.getElementById('cost')) document.getElementById('cost').value = '';
                if (document.getElementById('remedialWorks')) document.getElementById('remedialWorks').value = '';
            }
        }
        document.querySelectorAll('.works-stepper .stepper-step').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.val === val);
        });
        if (typeof updateConditionalFieldsVisibility === 'function') {
            updateConditionalFieldsVisibility(val);
        }
    }

    function initSteppers() {
      var sev = document.getElementById('severity');
      var ext = document.getElementById('extent');
      var wrk = document.getElementById('works');
      if (sev) setSeverityStepper(parseInt(sev.value) || 1, true);
      if (ext) setExtentStepper(ext.value || 'A', true);
      if (wrk) setWorksStepper(wrk.value || 'Y', true); 
    }

    document.getElementById('severityStepperCard')?.addEventListener('click', function(e) {
        var btn = e.target.closest('.stepper-step');
        if (!btn) return;
        setSeverityStepper(parseInt(btn.dataset.val));
    });

    document.getElementById('extentStepperCard')?.addEventListener('click', function(e) {
        var btn = e.target.closest('.stepper-step');
        if (!btn) return;
        setExtentStepper(btn.dataset.val);
    });

    document.getElementById('worksStepperCard')?.addEventListener('click', function(e) {
        var btn = e.target.closest('.stepper-step');
        if (!btn) return;
        setWorksStepper(btn.dataset.val);
    });

    var originalOpenModal = window.openModal;
    window.openModal = function(isEditMode, preferredState) {
        if (originalOpenModal) originalOpenModal.apply(this, arguments);
        if (!isEditMode || preferredState === 'defect') {
            requestAnimationFrame(function() {
                initSteppers();
            });
        }
    };

    var originalCloseModal = window.closeModal;
    window.closeModal = function() {
        if (originalCloseModal) originalCloseModal.apply(this, arguments);
    };

    window.initSteppers = initSteppers;
    window.setSeverityStepper = setSeverityStepper;
    window.setExtentStepper = setExtentStepper;
    window.setWorksStepper = setWorksStepper;
});

window.getModalState = function() {
    var modal = document.getElementById('modal');
    return (modal && (modal.dataset.modalState || modal.dataset.ofState)) || 'defect';
};

document.getElementById('modalCloseBtn')?.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
});

function closeModal() {
    console.log('closeModal called');
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        modal.removeAttribute('style');
        modal.style.display = 'none';
    }
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    if (document.body.dataset.scrollY) {
        window.scrollTo(0, parseInt(document.body.dataset.scrollY));
        delete document.body.dataset.scrollY;
    }
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => backdrop.remove());
    console.log('Modal closed successfully, display =', modal ? modal.style.display : 'modal not found');
}

function updateConditionalFieldsVisibility(worksValue) {
    const priorityGroup = document.getElementById('priorityGroup');
    const costGroup = document.getElementById('costGroup');
    const remedialWorksGroup = document.getElementById('remedialWorksGroup');
    const shouldShow = worksValue === 'Y';
    if (priorityGroup) priorityGroup.style.display = shouldShow ? 'flex' : 'none';
    if (costGroup) costGroup.style.display = shouldShow ? 'flex' : 'none';
    if (remedialWorksGroup) remedialWorksGroup.style.display = shouldShow ? 'flex' : 'none';
    const modalBody = document.querySelector('.modal-body');
    if (modalBody) {
        const scrollTop = modalBody.scrollTop;
        setTimeout(() => { modalBody.scrollTop = scrollTop; }, 0);
    }
}

function updateMainRow(potentialRow) {
  const mainRow = potentialRow.classList?.contains("main-row") 
    ? potentialRow 
    : findMainRow(potentialRow);
  if (!mainRow) {
    console.error("Could not resolve main row from:", potentialRow);
    return;
  }
  const expandableRows = findAllExpandableRows(mainRow);
  if (expandableRows.length > 0) {
    // The primary defect (see setAsPrimaryDefect) drives what the collapsed
    // row shows. A defect actually in this inspection always wins over a
    // .retrieved-defect row (date-dropdown comparison data, not part of this
    // inspection at all) — only fall back to showing the comparison row if
    // nothing else exists for this element yet.
    const filledPrimary = expandableRows.find(row => row.querySelector('.primary-tag')?.classList.contains('filled'));
    const firstRealDefect = expandableRows.find(row => !row.classList.contains('retrieved-defect'));
    const firstDefect = filledPrimary || firstRealDefect || expandableRows[0];
    const mainCells = mainRow.querySelectorAll("td");

    if (firstDefect.classList.contains('retrieved-defect')) {
      // Comparison data pulled in via the date dropdown isn't part of this
      // inspection's score — show just an indicator, not a score, so it's
      // never mistaken for one.
      mainCells[2].textContent = "";
      mainCells[3].textContent = "";
      mainCells[4].innerHTML = '<i class="fas fa-history retrieved-indicator" title="From a previous inspection — not part of this inspection\'s score"></i>';
    } else {
      const severityValue = firstDefect.querySelector(".addSeverity")?.textContent || "";
      if (severityValue) {
          mainCells[2].innerHTML = `<span class="sev-${severityValue}">${severityValue}</span>`;
      } else {
          mainCells[2].textContent = "";
      }
      mainCells[3].textContent = firstDefect.querySelector(".addExtent")?.textContent || "";
      const defectDisplay = firstDefect.querySelector(".addDefect")?.textContent || "";
      const defectCode = firstDefect.querySelector(".defectId")?.textContent || "";
      if (defectCode.includes('0.0') || defectDisplay.includes('No Defects')) {
        mainCells[4].innerHTML = '<span style="color:#2d7a6e;font-size:0.75rem;"><i class="fas fa-check"></i></span>';
      } else if (defectCode.includes('0.1') || defectDisplay.includes('Not Inspected')) {
        mainCells[4].innerHTML = '<span style="color:#BA7517;font-size:0.75rem;"><i class="fas fa-ban"></i></span>';
      } else {
        mainCells[4].textContent = defectDisplay;
      }
    }
  } else {
    const mainCells = mainRow.querySelectorAll("td");
    mainCells[2].textContent = "";
    mainCells[3].textContent = "";
    mainCells[4].textContent = "";
  }
}

const rowDataMap = new Map();
let currentExpandableRow = null;
let currentRow = null;

function refreshBCIScores() {
    const selectedSpan = sessionStorage.getItem('selectedSpan');
    const allDefects = JSON.parse(sessionStorage.getItem('defects')) || [];
    const spanDefects = allDefects.filter(defect => defect.spanNumber == selectedSpan);
    const bciAvElement = document.getElementById('bciAvResult');
    const bciCritElement = document.getElementById('bciCritResult');
    const inspectionMode = sessionStorage.getItem('inspectionMode');
    const isEditMode = inspectionMode === 'edit';
    let bciAv = 100, bciCrit = 100;
    let inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    const spanIndex = parseInt(selectedSpan) - 1;
    if (!inspectionData.spans) inspectionData.spans = [];
    if (!inspectionData.spans[spanIndex]) {
        inspectionData.spans[spanIndex] = {
            spanNumber: parseInt(selectedSpan),
            elementsInspected: false,
            photographsTaken: false,
            comments: ''
        };
    }
    const spanData = inspectionData.spans[spanIndex];
    if (isEditMode && spanDefects.length === 0 && spanData.bciAv != null && spanData.bciCrit != null) {
        bciAv = parseFloat(spanData.bciAv);
        bciCrit = parseFloat(spanData.bciCrit);
        if (bciAvElement) setBciValue(bciAvElement, bciAv);
        if (bciCritElement) setBciValue(bciCritElement, bciCrit);
        console.log("Edit mode, no defects loaded yet - using stored BCI:", spanData.bciAv, spanData.bciCrit);
        return { bciAv, bciCrit };
    }
    if (spanDefects.length > 0) {
        const validDefects = spanDefects.filter(d => d.defectCombined !== '0.1');
        // An element can carry several defects, but only the primary one
        // (see setAsPrimaryDefect) counts toward BCI scoring. Falls back to
        // whichever came first if none is marked primary yet.
        const primaryByElement = new Map();
        validDefects.forEach(d => {
            const existing = primaryByElement.get(d.elementNumber);
            if (!existing || d.isPrimary === true) primaryByElement.set(d.elementNumber, d);
        });
        const scoredDefects = Array.from(primaryByElement.values());
        const bciDefects = scoredDefects.map(d => {
          if (d.defectCombined === '0.0') {
            return { severity: 1, extent: 'A', elementNumber: d.elementNumber };
          }
          return { severity: parseInt(d.severity, 10), extent: d.extent, elementNumber: d.elementNumber };
        });
        const severityValues = bciDefects.map(d => d.severity);
        const extentValues = bciDefects.map(d => d.extent);
        const itemNumbers = bciDefects.map(d => parseInt(d.elementNumber, 10));
        if (typeof calculateBCI === 'function') {
            try {
                const structureType = sessionStorage.getItem('structureType') || 'Bridge';
                const calculated = calculateBCI(severityValues, extentValues, itemNumbers, structureType);
                bciAv = calculated.bciAv;
                bciCrit = calculated.bciCrit;
                if (bciAvElement) setBciValue(bciAvElement, bciAv);
                if (bciCritElement) setBciValue(bciCritElement, bciCrit);
                console.log(`BCI calculated: Av=${bciAv.toFixed(2)}, Crit=${bciCrit.toFixed(2)}`);
            } catch (error) {
                console.error("Error calculating BCI:", error);
                bciAv = 100;
                bciCrit = 100;
                if (bciAvElement) setBciValue(bciAvElement, 100);
                if (bciCritElement) setBciValue(bciCritElement, 100);
            }
        } else {
            console.warn("calculateBCI function not found");
        }
    } else {
        if (bciAvElement) setBciValue(bciAvElement, 100);
        if (bciCritElement) setBciValue(bciCritElement, 100);
        console.log("No defects - BCI set to 100/100");
    }
    spanData.bciAv = bciAv.toFixed(2);
    spanData.bciCrit = bciCrit.toFixed(2);
    sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
    return { bciAv, bciCrit };
}

window.refreshBCIScores = refreshBCIScores;

// Headless equivalent of opening the modal, selecting the "No Defects" /
// "Not Inspected" segment, and clicking Save — reuses saveChanges() so the
// sessionStorage/BCI/row-update bookkeeping stays in exactly one place.
function quickRecordElement(buttonRow, status, comment, existingRow) {
  const mainRow = findMainRow(buttonRow);
  if (!mainRow) return;
  currentRow = mainRow;
  currentExpandableRow = existingRow || null;
  document.getElementById("severity").value = "1";
  document.getElementById("extent").value = "A";
  document.getElementById("works").value = "N";
  document.getElementById("priority").value = "";
  document.getElementById("cost").value = "";
  document.getElementById("remedialWorks").value = "";
  const commentFieldId = status === 'no-defects' ? 'of-no-defects-comment' : 'of-not-inspected-comment';
  document.getElementById(commentFieldId).value = comment || '';
  const modal = document.getElementById('modal');
  modal.dataset.modalState = status;
  modal.dataset.ofState = status;
  saveChanges();
}

function saveChanges() {
  console.group("===== SAVING DEFECT DATA =====");
  const structureId = sessionStorage.getItem('structureId');
  const inspectionDate = sessionStorage.getItem('inspectionDate');
  const selectedSpan = sessionStorage.getItem('selectedSpan');
  if (!selectedSpan) {
    console.error("No span selected - aborting save");
    showAlertModal("No span selected! Please select a span first.");
    console.groupEnd();
    return;
  }
  const sevVal = document.getElementById('severity')?.value;
  const extVal = document.getElementById('extent')?.value;
  const isValidCombo = (sevVal === '1' && extVal === 'A') || (parseInt(sevVal) >= 2 && extVal !== 'A');
  if (!isValidCombo) {
    showAlertModal('Invalid Severity/Extent combination. Only 1A or 2-5 with B-E are valid.');
    console.groupEnd();
    return;
  }
  let mainRow = null;
  if (currentExpandableRow?.classList?.contains("expandable-row")) {
    mainRow = findMainRow(currentExpandableRow);
  } else if (currentRow) {
    mainRow = findMainRow(currentRow);
    if (!mainRow && currentRow.classList?.contains("main-row")) {
      mainRow = currentRow;
    }
  }
  if (!mainRow?.classList?.contains("main-row")) {
    console.warn("Primary resolution failed. Attempting recovery...");
    const allMainRows = document.querySelectorAll("tr.main-row");
    if (allMainRows.length > 0) {
      mainRow = allMainRows[allMainRows.length - 1];
      console.warn("Using recovered main row:", mainRow.dataset.rowId);
    }
  }
  if (!mainRow?.classList?.contains("main-row")) {
    console.error("CRITICAL: No valid main row found");
    showAlertModal("System error: Could not determine element location. Please refresh the page and try again.");
    console.groupEnd();
    return;
  }
  const elementNumber = mainRow.dataset.rowId;
  console.log("Using main row:", { elementNumber });

  // FIX #2: Get modal state FIRST to determine which comment field to read
  const modalState = window.getModalState ? window.getModalState() : 
    (document.getElementById('modal')?.dataset.modalState || document.getElementById('modal')?.dataset.ofState || 'defect');

  // FIX #2: Read comment from the correct field based on modal state
  let comment = "";
  if (modalState === 'no-defects') {
    comment = document.getElementById("of-no-defects-comment")?.value || "";
  } else if (modalState === 'not-inspected') {
    comment = document.getElementById("of-not-inspected-comment")?.value || "";
  } else {
    comment = document.getElementById("comment")?.value || "";
  }

  const defectTypeElem = document.getElementById("defectType");
  const defectNumberElem = document.getElementById("defectNumber");
  const severityElem = document.getElementById("severity");
  const extentElem = document.getElementById("extent");
  const worksElem = document.getElementById("works");
  const priorityElem = document.getElementById("priority");
  const costElem = document.getElementById("cost");
  const remedialWorksElem = document.getElementById("remedialWorks");

  const defectType = defectTypeElem ? defectTypeElem.value : "1";
  const defectNumber = defectNumberElem ? defectNumberElem.value : "1";
  const severity = severityElem ? severityElem.value : "1";
  const extent = extentElem ? extentElem.value : "A";
  const works = worksElem ? worksElem.value : "N";
  const priority = priorityElem ? priorityElem.value : "";
  const cost = costElem ? costElem.value : "";
  const remedialWorks = remedialWorksElem ? remedialWorksElem.value : "";
  const defectCombined = `${defectType}.${defectNumber}`;

  let finalDefectType, finalDefectNumber, finalDefectCombined, finalSeverity, finalExtent, finalWorks;
  if (modalState === 'no-defects') {
    finalDefectType = '0';
    finalDefectNumber = '0';
    finalDefectCombined = '0.0';
    finalSeverity = '1';
    finalExtent = 'A';
    finalWorks = 'N';
  } else if (modalState === 'not-inspected') {
    finalDefectType = '0';
    finalDefectNumber = '1';
    finalDefectCombined = '0.1';
    // Store 1A internally for DB compatibility, but UI shows blank
    finalSeverity = '1';
    finalExtent = 'A';
    finalWorks = 'N';
  } else {
    finalDefectType = defectType;
    finalDefectNumber = defectNumber;
    finalDefectCombined = defectCombined;
    finalSeverity = severity;
    finalExtent = extent;
    finalWorks = works;
  }

  let defects = JSON.parse(sessionStorage.getItem('defects')) || [];
  const isEditing = !!currentExpandableRow?.dataset.timestamp;

  // First defect entered for an element is primary by default (drives BCI
  // scoring when there are several); later ones default to non-primary
  // until the user explicitly switches via the .primary-tag toggle.
  const isFirstForElement = !isEditing && !defects.some(d =>
    d.elementNumber == elementNumber && d.spanNumber == selectedSpan
  );
  const isPrimary = isEditing
    ? (currentExpandableRow?.querySelector('.primary-tag')?.classList.contains('filled') || false)
    : isFirstForElement;

  const defectData = {
    defectCombined: finalDefectCombined,
    defectType: finalDefectType,
    defectNumber: finalDefectNumber,
    severity: finalSeverity,
    extent: finalExtent,
    works: finalWorks,
    priority: priority,
    cost: cost,
    remedialWorks: remedialWorks,
    comment: comment,
    spanNumber: selectedSpan,
    elementNumber: elementNumber,
    timestamp: currentExpandableRow?.dataset.timestamp || new Date().toISOString(),
    defectId: `${structureId}_${inspectionDate}_${selectedSpan}_${elementNumber}_${defectCombined}`,
    isPrimary: isPrimary
  };

  if (isEditing) {
    const index = defects.findIndex(d => d.timestamp === currentExpandableRow.dataset.timestamp);
    if (index >= 0) {
      defectData.timestamp = defects[index].timestamp;
      defects[index] = defectData;
      console.log("Updated existing defect at index:", index);
    } else {
      console.error("Original defect not found in storage");
      showAlertModal("Error: Could not find original defect data.");
      console.groupEnd();
      return;
    }
  } else {
    defects.push(defectData);
    console.log("Added new defect");
  }

  sessionStorage.setItem('defects', JSON.stringify(defects));

  let inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
  if (!inspectionData.defects) inspectionData.defects = [];

  const inspectionDefect = {
    defectDbId: null,
    spanNumber: parseInt(selectedSpan),
    elementNumber: parseInt(elementNumber),
    elementDescription: null,
    defectId: finalDefectCombined,
    severity: finalSeverity ? parseInt(finalSeverity) : null,
    extent: finalExtent,
    worksRequired: finalWorks,
    remedialWorks: remedialWorks,
    priority: priority,
    cost: parseFloat(cost) || 0,
    comments: comment,
    timestamp: defectData.timestamp,
    photos: []
  };

  if (isEditing) {
    const existingIndex = inspectionData.defects.findIndex(d => d.timestamp === defectData.timestamp);
    if (existingIndex >= 0) {
      // Carry over any 3D location already placed via locate3d.js — this
      // edit only touches severity/extent/etc., not the defect's position.
      const existing = inspectionData.defects[existingIndex];
      if (existing.x != null && existing.y != null && existing.z != null) {
        inspectionDefect.x = existing.x;
        inspectionDefect.y = existing.y;
        inspectionDefect.z = existing.z;
      }
      inspectionData.defects[existingIndex] = inspectionDefect;
    } else {
      inspectionData.defects.push(inspectionDefect);
    }
  } else {
    inspectionData.defects.push(inspectionDefect);
  }

  sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));

  if (isEditing && currentExpandableRow) {
    const updateField = (selector, value) => {
        const el = currentExpandableRow.querySelector(selector);
        if (el) el.textContent = value;
    };
    updateField(".addDefect", finalDefectCombined);
    const addDefectEl = currentExpandableRow.querySelector(".addDefect");
    if (addDefectEl) addDefectEl.dataset.code = finalDefectCombined;
    const sevEl = currentExpandableRow.querySelector(".addSeverity");
    if (sevEl) sevEl.innerHTML = severityBadgeHTML(finalSeverity);
    const extEl = currentExpandableRow.querySelector(".addExtent");
    if (extEl) extEl.innerHTML = extentBadgeHTML(finalExtent);
    updateField(".addWorks", finalWorks);
    updateField(".addPriority", priority);
    updateField(".addCost", cost);
    updateField(".addComment", comment);
    updateField(".defectId", defectData.defectId);
    updateField(".addRemedialWorks", remedialWorks);
    const defectVal = currentExpandableRow.querySelector('.addDefect');
    if (finalDefectCombined === '0.0') {
        if (defectVal) defectVal.innerHTML = '<span style="color:#2d7a6e;font-weight:600;"><i class="fas fa-check-circle"></i> No Defects</span>';
        currentExpandableRow.classList.add('no-defects-row');
        currentExpandableRow.classList.remove('not-inspected-row');
    } else if (finalDefectCombined === '0.1') {
        if (defectVal) defectVal.innerHTML = '<span style="color:#BA7517;font-weight:600;"><i class="fas fa-ban"></i> Not Inspected</span>';
        currentExpandableRow.classList.add('not-inspected-row');
        currentExpandableRow.classList.remove('no-defects-row');
    } else {
        currentExpandableRow.classList.remove('no-defects-row', 'not-inspected-row');
    }
    currentExpandableRow.dataset.timestamp = defectData.timestamp;
    updateConditionalFields(currentExpandableRow, finalWorks);
  } else {
    console.log("Creating new defect row");
    const newRow = addDefectToTable(mainRow, defectData, false, true);
    if (newRow && !mainRow.classList.contains("expanded")) {
      toggleButtonRow(mainRow);
    } else if (newRow && mainRow.classList.contains("expanded")) {
      newRow.style.display = "table-row";
      const buttonRow = findButtonRow(mainRow);
      if (buttonRow) buttonRow.style.display = "table-row";
    }
  }

  const result = refreshBCIScores();
  console.log("BCI refresh result:", result);
  inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
  updateMainRow(mainRow);
  closeModal();
  console.log("===== SAVE COMPLETE =====");
  console.groupEnd();
}

window.closeModal = closeModal;
window.saveChanges = saveChanges;

window.addEventListener('load', async function() {
    await loadInspectionElements();
});

async function loadInspectionElements() {
  try {
    const structureType = sessionStorage.getItem('structureType') || 'Bridge';
    const elementsResponse = await fetch(`/get_elements?type=${encodeURIComponent(structureType)}`);
    const elementsData = await elementsResponse.json();
    const tableBody = document.querySelector("#inspectionElementsTable tbody");
    tableBody.innerHTML = "";
    elementsData.forEach(item => {
      const row = document.createElement("tr");
      row.dataset.rowId = item.no;
      row.classList.add("main-row");
      row.innerHTML = `
        <td class="itemno">${item.no || ''}</td>
        <td class="description">${item.description || ''}</td>
        <td class="severity"></td>
        <td class="extent"></td>
        <td></td>
      `;
      tableBody.appendChild(row);
    });
    const currentSpan = sessionStorage.getItem('selectedSpan');
    if (!currentSpan) {
      console.warn("No span selected - not loading any defects");
      return;
    }
    const inspectionMode = sessionStorage.getItem('inspectionMode');
    const structureId = sessionStorage.getItem('structureId');
    const inspectionDate = sessionStorage.getItem('inspectionDate');
    if (inspectionMode === 'edit' && structureId && inspectionDate) {
      await loadDefectsFromAPI(structureId, inspectionDate, currentSpan);
    } else {
      loadDefectsFromSession(currentSpan);
    }
    updateAllMainRows();
    refreshBCIScores();
  } catch (error) {
    console.error("Error loading inspection elements:", error);
  }
}

async function loadDefectsFromAPI(structureId, inspectionDate, currentSpan) {
    console.log("Loading defects for span:", currentSpan);
    try {
        const url = `/api/inspection/full?structure_id=${structureId}&date=${inspectionDate}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const inspectionData = await response.json();
        const inspectionMode = sessionStorage.getItem('inspectionMode');
        const isEditMode = inspectionMode === 'edit';
        if (inspectionData.conclusions) {
            sessionStorage.setItem('inspectionConclusions', inspectionData.conclusions);
            const storedInspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
            storedInspectionData.conclusions = inspectionData.conclusions;
            sessionStorage.setItem('inspectionData', JSON.stringify(storedInspectionData));
            const conclusionsTextarea = document.getElementById('inspectionConclusionsText');
            if (conclusionsTextarea) conclusionsTextarea.value = inspectionData.conclusions;
            const conclusionsBar = document.getElementById('conclusionsBar');
            const barIcon = document.getElementById('barIcon');
            if (conclusionsBar) {
                if (inspectionData.conclusions.trim().length > 0) {
                    conclusionsBar.classList.add('done');
                    if (barIcon) barIcon.innerHTML = '<i class="fas fa-check"></i>';
                } else {
                    conclusionsBar.classList.remove('done');
                    if (barIcon) barIcon.innerHTML = '<i class="fas fa-pen"></i>';
                }
            }
            console.log('Conclusions loaded from API:', inspectionData.conclusions);
        }
        const currentDefects = JSON.parse(sessionStorage.getItem('defects')) || [];
        const allApiDefects = (inspectionData.defects || []).map(defect => {
            const frontDefectId = defect.photos && defect.photos.length > 0 
                ? defect.photos[0].frontDefectId 
                : null;
            const isNoDefects = defect.defectId === '0.0';
            const isNotInspected = defect.defectId === '0.1';
            return {
                defectDbId: defect.defectDbId,
                defectCombined: defect.defectId,
                defectType: isNoDefects || isNotInspected ? '0' : defect.defectId.split('.')[0],
                defectNumber: isNoDefects ? '0' : (isNotInspected ? '1' : defect.defectId.split('.')[1]),
                severity: defect.severity,
                extent: defect.extent,
                works: defect.worksRequired,
                priority: defect.priority,
                cost: defect.cost,
                comment: defect.comments,
                spanNumber: defect.spanNumber,
                elementNumber: defect.elementNumber,
                timestamp: defect.timestamp,
                remedialWorks: defect.remedialWorks,
                frontDefectId: frontDefectId,
                isFromAPI: !isEditMode,
                isEditable: isEditMode
            };
        });
        const mergedDefects = [
            ...allApiDefects.filter(apiDefect => 
                !currentDefects.some(localDefect => 
                    localDefect.elementNumber === apiDefect.elementNumber && 
                    localDefect.defectCombined === apiDefect.defectCombined
                )
            ),
            ...currentDefects.map(localDefect => {
                if (!localDefect.frontDefectId) {
                    const matchingApiDefect = allApiDefects.find(apiDefect =>
                        apiDefect.elementNumber === localDefect.elementNumber &&
                        apiDefect.defectCombined === localDefect.defectCombined
                    );
                    if (matchingApiDefect) {
                        return { ...localDefect, frontDefectId: matchingApiDefect.frontDefectId };
                    }
                }
                return localDefect;
            })
        ];
        sessionStorage.setItem('defects', JSON.stringify(mergedDefects));
        if (isEditMode && inspectionData.spans) {
            const storedInspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
            if (storedInspectionData.spans) {
                inspectionData.spans.forEach((apiSpan, index) => {
                    if (storedInspectionData.spans[index]) {
                        storedInspectionData.spans[index].bciAv = apiSpan.bciAv || apiSpan.bciAv || null;
                        storedInspectionData.spans[index].bciCrit = apiSpan.bciCrit || apiSpan.bciCrit || null;
                    }
                });
                sessionStorage.setItem('inspectionData', JSON.stringify(storedInspectionData));
                console.log("Edit mode - BCI values carried over from API");
            }
        } else if (!isEditMode) {
            const storedInspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
            if (storedInspectionData.spans) {
                storedInspectionData.spans.forEach(span => {
                    span.bciAv = null;
                    span.bciCrit = null;
                });
                sessionStorage.setItem('inspectionData', JSON.stringify(storedInspectionData));
                console.log("New inspection - BCI values cleared from spans");
            }
        }
        const spanDefects = mergedDefects.filter(defect => defect.spanNumber == currentSpan);
        document.querySelectorAll("tr.expandable-row").forEach(row => row.remove());
        const processedMainRows = new Set();
        spanDefects.forEach(defect => {
            const mainRow = document.querySelector(`tr.main-row[data-row-id="${defect.elementNumber}"]`);
            if (mainRow) {
                addDefectToTable(mainRow, defect, defect.isFromAPI, defect.isEditable);
                processedMainRows.add(mainRow);
            }
        });
        processedMainRows.forEach(mainRow => {
            addButtonRowForMainRow(mainRow);
        });
        refreshBCIScores();
    } catch (error) {
        console.error("Defect loading failed:", error);
        const currentDefects = JSON.parse(sessionStorage.getItem('defects')) || [];
        const spanDefects = currentDefects.filter(defect => defect.spanNumber == currentSpan);
        spanDefects.forEach(defect => {
            const mainRow = document.querySelector(`tr.main-row[data-row-id="${defect.elementNumber}"]`);
            if (mainRow) addDefectToTable(mainRow, defect, defect.isFromAPI, false);
        });
        refreshBCIScores();
    }
}

function loadDefectsFromSession(currentSpan) {
  const defectsData = JSON.parse(sessionStorage.getItem('defects')) || [];
  if (defectsData.length > 0) {
    document.querySelectorAll("tr.expandable-row").forEach(row => row.remove());
    const processedMainRows = new Set();
    defectsData
      .filter(defect => defect.spanNumber === currentSpan)
      .forEach(defect => {
        const mainRow = document.querySelector(`tr.main-row[data-row-id="${defect.elementNumber}"]`);
        if (mainRow) {
          addDefectToTable(mainRow, defect, false, true);
          processedMainRows.add(mainRow);
        }
      });
    processedMainRows.forEach(mainRow => {
      addButtonRowForMainRow(mainRow);
    });
  }
  refreshBCIScores();
}

function updateAllMainRows() {
  document.querySelectorAll("tr.main-row").forEach(mainRow => {
    updateMainRow(mainRow);
  });
}

function findAllExpandableRows(mainRow) {
  const expandableRows = [];
  let sibling = mainRow.nextElementSibling;
  while (sibling && !sibling.classList.contains("main-row")) {
    if (sibling.classList.contains("expandable-row")) {
      expandableRows.push(sibling);
    }
    sibling = sibling.nextElementSibling;
  }
  return expandableRows;
}

function findButtonRow(mainRow) {
  let sibling = mainRow.nextElementSibling;
  while (sibling && !sibling.classList.contains("main-row")) {
    if (sibling.classList.contains("button-row")) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function addButtonRowForMainRow(mainRow) {
  let buttonRow = findButtonRow(mainRow);
  if (!buttonRow) {
    const template = document.getElementById("templateButtonRow");
    if (!template) {
      console.error("Template 'templateButtonRow' not found");
      return null;
    }
    const clone = template.content.cloneNode(true);
    buttonRow = clone.querySelector("tr.button-row");
    if (!buttonRow) {
      console.error("Button row not found in template");
      return null;
    }
    let insertAfter = mainRow;
    let nextRow = mainRow.nextElementSibling;
    while (nextRow && !nextRow.classList.contains("main-row")) {
      insertAfter = nextRow;
      nextRow = nextRow.nextElementSibling;
    }
    insertAfter.parentNode.insertBefore(buttonRow, insertAfter.nextSibling);
    buttonRow.style.display = "none";
    console.log("Button row added for main row:", mainRow.dataset.rowId);
  }
  return buttonRow;
}

// Table rows can't transition height/display directly, so each row's inner
// content (the .aligned-grid card, or the Add Defect button) is what
// actually grows/shrinks. max-height alone isn't enough though: the
// content's own padding/border take up guaranteed space max-height can't
// remove, so without animating those too the row visibly plateaus a few
// px short of 0 right before the cleanup timer snaps it to display:none.
const ROW_ANIM_MS = 320;
const ROW_ANIM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const ROW_ANIM_PROPS = ["max-height", "padding-top", "padding-bottom", "border-top-width", "border-bottom-width", "opacity"];
const ROW_ANIM_TRANSITION = ROW_ANIM_PROPS.map(p => `${p} ${ROW_ANIM_MS}ms ${ROW_ANIM_EASE}`).join(", ");

function showRowAnimated(rowEl) {
  if (!rowEl) return;
  clearTimeout(rowEl._collapseTimer);
  clearTimeout(rowEl._expandTimer);
  rowEl.style.display = "table-row";
  const content = rowEl.querySelector("td")?.firstElementChild;
  if (!content) return;

  // Measure the natural (fully open) box before touching anything.
  content.style.transition = "none";
  content.style.maxHeight = "none";
  content.style.paddingTop = content.style.paddingBottom = "";
  content.style.borderTopWidth = content.style.borderBottomWidth = "";
  const cs = getComputedStyle(content);
  const target = { maxHeight: content.scrollHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth };

  // Snap to the collapsed state instantly, then transition open.
  content.style.overflow = "hidden";
  content.style.minHeight = "0px";
  content.style.maxHeight = "0px";
  content.style.paddingTop = content.style.paddingBottom = "0px";
  content.style.borderTopWidth = content.style.borderBottomWidth = "0px";
  content.style.opacity = "0";
  content.offsetHeight; // force layout to commit the "from" state before transitioning

  content.style.transition = ROW_ANIM_TRANSITION;
  content.style.maxHeight = target.maxHeight;
  content.style.paddingTop = target.paddingTop;
  content.style.paddingBottom = target.paddingBottom;
  content.style.borderTopWidth = target.borderTopWidth;
  content.style.borderBottomWidth = target.borderBottomWidth;
  content.style.opacity = "1";

  // Once settled, drop the inline clamps so later dynamic content (e.g.
  // an edited comment wrapping to more lines) isn't clipped, and so a
  // row-density switch can still apply its own padding via CSS.
  rowEl._expandTimer = setTimeout(() => {
    content.style.maxHeight = "none";
    content.style.overflow = "visible";
    content.style.minHeight = "";
    content.style.paddingTop = content.style.paddingBottom = "";
    content.style.borderTopWidth = content.style.borderBottomWidth = "";
  }, ROW_ANIM_MS);
}
function hideRowAnimated(rowEl) {
  if (!rowEl) return;
  const content = rowEl.querySelector("td")?.firstElementChild;
  if (!content) { rowEl.style.display = "none"; return; }
  clearTimeout(rowEl._expandTimer);

  // Snap max-height/padding/border to their current rendered values first
  // (a no-op visually) since transitions need a concrete starting value.
  const cs = getComputedStyle(content);
  const current = { maxHeight: content.scrollHeight + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth };
  content.style.transition = "none";
  content.style.overflow = "hidden";
  content.style.minHeight = "0px";
  content.style.maxHeight = current.maxHeight;
  content.style.paddingTop = current.paddingTop;
  content.style.paddingBottom = current.paddingBottom;
  content.style.borderTopWidth = current.borderTopWidth;
  content.style.borderBottomWidth = current.borderBottomWidth;
  content.offsetHeight; // force layout to commit the "from" state before transitioning

  content.style.transition = ROW_ANIM_TRANSITION;
  content.style.maxHeight = "0px";
  content.style.paddingTop = content.style.paddingBottom = "0px";
  content.style.borderTopWidth = content.style.borderBottomWidth = "0px";
  content.style.opacity = "0";
  clearTimeout(rowEl._collapseTimer);
  rowEl._collapseTimer = setTimeout(() => {
    rowEl.style.display = "none";
  }, ROW_ANIM_MS);
}

function toggleButtonRow(row) {
  console.log("toggleButtonRow called for row:", row);
  const allRows = document.querySelectorAll("#inspectionElementsTable tbody tr.main-row");
  allRows.forEach((otherRow) => {
    if (otherRow !== row && otherRow.classList.contains("expanded")) {
      otherRow.classList.remove("expanded");
      hideRowAnimated(findButtonRow(otherRow));
      findAllExpandableRows(otherRow).forEach(hideRowAnimated);
    }
  });
  if (row.classList.contains("expanded")) {
    console.log("Row is expanded. Collapsing...");
    row.classList.remove("expanded");
    hideRowAnimated(findButtonRow(row));
    findAllExpandableRows(row).forEach(hideRowAnimated);
  } else {
    console.log("Row is not expanded. Expanding...");
    row.classList.add("expanded");
    let buttonRow = findButtonRow(row);
    if (!buttonRow) buttonRow = addButtonRowForMainRow(row);
    showRowAnimated(buttonRow);
    findAllExpandableRows(row).forEach(showRowAnimated);
  }
}

function findMainRow(startRow) {
  if (startRow.classList.contains("main-row")) return startRow;
  let currentRow = startRow.previousElementSibling;
  while (currentRow) {
    if (currentRow.classList.contains("expandable-row")) {
      currentRow = currentRow.previousElementSibling;
      continue;
    }
    if (currentRow.classList.contains("main-row")) return currentRow;
    currentRow = currentRow.previousElementSibling;
  }
  console.error("No main row found!");
  return null;
}

// Colour-coded severity/extent badges for the expandable defect rows (see
// the matching .sev-*/.ext-* rules in inspection.css).
function severityBadgeHTML(value) {
  return value ? `<span class="sev-${value}">${value}</span>` : '';
}
function extentBadgeHTML(value) {
  return value ? `<span class="ext-${value}">${value}</span>` : '';
}

function addDefectToTable(mainRow, defectData, isRetrieved, isEditable = false) {
  console.group('addDefectToTable Debug');
  console.error('>>> addDefectToTable CALLED', {isRetrieved, isEditable, defect: defectData?.defectCombined});
  const currentSpan = sessionStorage.getItem('selectedSpan');
  if (!currentSpan) {
    console.error("No span selected - cannot add defect");
    console.groupEnd();
    return null;
  }
  if (!defectData || typeof defectData !== 'object') {
    console.error("Invalid defect data");
    console.groupEnd();
    return null;
  }
  const template = document.getElementById("templateRow");
  if (!template) {
    console.error("Template not found");
    console.groupEnd();
    return null;
  }
  const clone = template.content.cloneNode(true);
  const expandableRow = clone.querySelector("tr.expandable-row");
  if (!expandableRow) {
    console.error("Expandable row not found in template");
    console.groupEnd();
    return null;
  }
  if (isRetrieved) {
    const primaryTag = expandableRow.querySelector('.primary-tag');
    if (primaryTag) primaryTag.remove();
  }
  expandableRow.dataset.timestamp = defectData.timestamp || new Date().toISOString();
  expandableRow.dataset.span = currentSpan;
  expandableRow.dataset.element = mainRow.dataset.rowId;
  const fieldMap = {
    '.addDefect': 'defectCombined',
    '.addSeverity': 'severity',
    '.addExtent': 'extent',
    '.addWorks': 'works',
    '.addPriority': 'priority',
    '.addCost': 'cost',
    '.addComment': 'comment',
    '.addRemedialWorks': 'remedialWorks',
    '.defectType': 'defectType',
    '.defectNumber': 'defectNumber'
  };
  Object.entries(fieldMap).forEach(([selector, dataKey]) => {
    const element = expandableRow.querySelector(selector);
    if (element) {
      const value = defectData[dataKey];
      if (selector === '.addSeverity') element.innerHTML = severityBadgeHTML(value);
      else if (selector === '.addExtent') element.innerHTML = extentBadgeHTML(value);
      else element.textContent = value || '';
    }
  });
  const defectCode = defectData.defectCombined || '';
  if (defectCode === '0.0') {
    const defectVal = expandableRow.querySelector('.addDefect');
    if (defectVal) defectVal.innerHTML = '<span style="color:#2d7a6e;font-weight:600;"><i class="fas fa-check-circle"></i> No Defects</span>';
    const sevVal = expandableRow.querySelector('.addSeverity');
    if (sevVal) sevVal.innerHTML = severityBadgeHTML('1');
    const extVal = expandableRow.querySelector('.addExtent');
    if (extVal) extVal.innerHTML = extentBadgeHTML('A');
    const worksVal = expandableRow.querySelector('.addWorks');
    if (worksVal) worksVal.textContent = 'N';
    const priorityRow = expandableRow.querySelector('.priority-row');
    const costRow = expandableRow.querySelector('.cost-row');
    const worksRow = expandableRow.querySelector('.works-row');
    if (priorityRow) priorityRow.classList.remove('visible');
    if (costRow) costRow.classList.remove('visible');
    if (worksRow) worksRow.classList.remove('works-active');
    expandableRow.classList.add('no-defects-row');
  } else if (defectCode === '0.1') {
    const defectVal = expandableRow.querySelector('.addDefect');
    if (defectVal) defectVal.innerHTML = '<span style="color:#BA7517;font-weight:600;"><i class="fas fa-ban"></i> Not Inspected</span>';
    const sevVal = expandableRow.querySelector('.addSeverity');
    if (sevVal) sevVal.textContent = '';
    const extVal = expandableRow.querySelector('.addExtent');
    if (extVal) extVal.textContent = '';
    const worksVal = expandableRow.querySelector('.addWorks');
    if (worksVal) worksVal.textContent = '';
    const priorityRow = expandableRow.querySelector('.priority-row');
    const costRow = expandableRow.querySelector('.cost-row');
    const worksRow = expandableRow.querySelector('.works-row');
    if (priorityRow) priorityRow.classList.remove('visible');
    if (costRow) costRow.classList.remove('visible');
    if (worksRow) worksRow.classList.remove('works-active');
    expandableRow.classList.add('not-inspected-row');
  }
  const worksValue = defectData.works;
  const priorityRow = expandableRow.querySelector('.priority-row');
  const costRow = expandableRow.querySelector('.cost-row');
  if (worksValue === 'Y' || worksValue === 'Yes') {
    if (priorityRow) priorityRow.classList.add('visible');
    if (costRow) costRow.classList.add('visible');
    console.log("Priority and Cost rows shown (Works = Yes)");
  } else {
    if (priorityRow) priorityRow.classList.remove('visible');
    if (costRow) costRow.classList.remove('visible');
    console.log("Priority and Cost rows hidden (Works = No/Monitor)");
  }
  const worksRow = expandableRow.querySelector('.works-row');
  if (worksRow && (worksValue === 'Y' || worksValue === 'Yes')) {
    worksRow.classList.add('works-active');
  } else if (worksRow) {
    worksRow.classList.remove('works-active');
  }
  const defectIdElement = expandableRow.querySelector('.defectId');
  if (defectIdElement) {
    // Real database id (when this defect already exists) is the only thing
    // that reliably matches photos and dedupes against other load paths —
    // prefer it over the temporary front-end key or the legacy field name.
    defectIdElement.textContent = defectData.defectDbId || defectData.frontDefectId || defectData.defectId || '';
  }
  const addDefectEl = expandableRow.querySelector('.addDefect');
  if (addDefectEl) addDefectEl.dataset.code = defectData.defectCombined || '';
  if (isRetrieved) expandableRow.classList.add("retrieved-defect");
  expandableRow.classList.toggle("editable", isEditable);
  // The primary defect always sits right under the main row; later
  // non-primary defects are appended after it (but still before any
  // retrieved-defect row for this span, which stays at the bottom).
  let insertBeforeRow = null;
  let lastOwnRow = mainRow;
  let nextRow = mainRow.nextElementSibling;
  while (nextRow && !nextRow.classList.contains("main-row")) {
    if (nextRow.classList.contains("retrieved-defect") && nextRow.dataset.span === currentSpan) {
      insertBeforeRow = nextRow;
      break;
    }
    if (nextRow.classList.contains("expandable-row")) {
      lastOwnRow = nextRow;
    }
    nextRow = nextRow.nextElementSibling;
  }
  try {
    const insertionPoint = defectData.isPrimary
      ? mainRow.nextSibling
      : (insertBeforeRow || lastOwnRow.nextSibling);
    mainRow.parentNode.insertBefore(expandableRow, insertionPoint);
    expandableRow.style.display = "none";
    console.log("Row inserted successfully");
  } catch (e) {
    console.error("Insertion failed:", e);
    console.groupEnd();
    return null;
  }
  if (!isRetrieved) {
      const ribbon = expandableRow.querySelector('.retrieved-ribbon');
      if (ribbon) ribbon.remove();
  }
  expandableRow.classList.toggle("editable", isEditable);
  addButtonRowForMainRow(mainRow);
  if (typeof updateMainRow === 'function') updateMainRow(mainRow);
  refreshBCIScores();
  console.groupEnd();
  return expandableRow;
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM fully loaded. Initializing event listeners...");
  document.getElementById('inspectionElementsTable').addEventListener('click', function (event) {
    const target = event.target;
    const mainRow = target.closest('tr.main-row');
    if (mainRow) toggleButtonRow(mainRow);
  });
  document.getElementById('inspectionElementsTable').addEventListener('click', function (event) {
    const target = event.target;
    if (target.classList.contains('btn-add-defect')) {
      const buttonRow = target.closest('tr.button-row');
      if (buttonRow) {
        currentRow = findMainRow(buttonRow);
        currentExpandableRow = null;
        document.getElementById("defectType").value = "1";
        // FIX #1: Trigger change event to populate defectNumber dropdown
        document.getElementById("defectType").dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById("defectNumber").value = "1";
        document.getElementById("severity").value = "1";
        document.getElementById("extent").value = "A";
        document.getElementById("works").value = "N";
        document.getElementById("priority").value = "";
        document.getElementById("cost").value = "";
        document.getElementById("comment").value = "";
        document.getElementById("remedialWorks").value = "";
        document.getElementById("of-no-defects-comment").value = "";
        document.getElementById("of-not-inspected-comment").value = "";
        document.getElementById("modalTitle").textContent = "Add Defect";
        openModal();
      }
    }
  });
  // Quick actions: "No Defects" / "Not Inspected" skip the full modal and
  // just ask for an optional comment inline, then save via the same
  // saveChanges() path the modal uses (see quickRecordElement below).
  document.getElementById('inspectionElementsTable').addEventListener('click', function (event) {
    const quickBtn = event.target.closest('.btn-no-defects, .btn-not-inspected');
    if (quickBtn) {
      const buttonRow = quickBtn.closest('tr.button-row');
      const box = buttonRow?.querySelector('.quick-confirm-box');
      if (!box) return;
      const status = quickBtn.classList.contains('btn-no-defects') ? 'no-defects' : 'not-inspected';
      box.dataset.pendingStatus = status;
      delete box.dataset.editingTimestamp;
      const textarea = box.querySelector('.quick-confirm-comment');
      textarea.value = '';
      textarea.style.height = '';
      const confirmBtn = box.querySelector('.quick-confirm-confirm');
      confirmBtn.classList.remove('confirm-green', 'confirm-orange');
      confirmBtn.classList.add(status === 'no-defects' ? 'confirm-green' : 'confirm-orange');
      box.style.display = 'block';
      textarea.focus();
      return;
    }
    const cancelBtn = event.target.closest('.quick-confirm-cancel');
    if (cancelBtn) {
      const box = cancelBtn.closest('.quick-confirm-box');
      if (box) {
        box.style.display = 'none';
        delete box.dataset.editingTimestamp;
      }
      return;
    }
    const confirmBtn = event.target.closest('.quick-confirm-confirm');
    if (confirmBtn) {
      const box = confirmBtn.closest('.quick-confirm-box');
      const buttonRow = confirmBtn.closest('tr.button-row');
      if (!box || !buttonRow) return;
      const comment = box.querySelector('.quick-confirm-comment').value.trim();
      const editingTimestamp = box.dataset.editingTimestamp;
      const existingRow = editingTimestamp
        ? findAllExpandableRows(findMainRow(buttonRow)).find(r => r.dataset.timestamp === editingTimestamp)
        : null;
      quickRecordElement(buttonRow, box.dataset.pendingStatus, comment, existingRow);
      delete box.dataset.editingTimestamp;
      box.style.display = 'none';
    }
  });
  // Auto-grow the quick-confirm textarea: slim by default, taller as needed.
  document.getElementById('inspectionElementsTable').addEventListener('input', function (event) {
    if (!event.target.classList.contains('quick-confirm-comment')) return;
    event.target.style.height = 'auto';
    event.target.style.height = event.target.scrollHeight + 'px';
  });
  document.getElementById('inspectionElementsTable').addEventListener('click', function (event) {
      const target = event.target;
      if (target.closest("button[title='Edit']")) {
          const expandableRow = target.closest("tr.expandable-row");
          if (expandableRow && expandableRow.classList.contains("retrieved-defect")) {
              showAlertModal("Retrieved defects cannot be edited. Please copy the defect to create a new editable version.");
              return;
          }
          if (expandableRow) {
              currentRow = findMainRow(expandableRow);
              currentExpandableRow = expandableRow;
              const addDefectEl = expandableRow.querySelector(".addDefect");
              let defectCombined = '';
              if (addDefectEl) {
                  defectCombined = addDefectEl.dataset.code || '';
                  if (!defectCombined) {
                      const addDefectHTML = addDefectEl.innerHTML || '';
                      if (addDefectHTML.includes('No Defects') || addDefectHTML.includes('fa-check-circle')) {
                          defectCombined = '0.0';
                      } else if (addDefectHTML.includes('Not Inspected') || addDefectHTML.includes('fa-ban')) {
                          defectCombined = '0.1';
                      } else {
                          defectCombined = addDefectEl.textContent.trim();
                      }
                  }
              }
              const parts = defectCombined.split('.');
              const defectType = parts[0] || '1';
              const defectNumber = parts[1] || '1';
              const worksText = expandableRow.querySelector(".addWorks").textContent.trim();
              const worksValue = worksText === 'Yes' || worksText === 'Y' ? 'Y' : worksText === 'Monitor' || worksText === 'M' ? 'M' : 'N';
              const editDefectCode = `${defectType}.${defectNumber}`;
              let editSegmentState = 'defect';
              let editSegmentComment = expandableRow.querySelector(".addComment")?.textContent || '';
              if (editDefectCode === '0.0') editSegmentState = 'no-defects';
              else if (editDefectCode === '0.1') editSegmentState = 'not-inspected';
              if (editSegmentState === 'defect') {
                  document.getElementById("defectType").value = defectType;
                  document.getElementById("defectType").dispatchEvent(new Event('change', { bubbles: true }));
                  document.getElementById("defectNumber").value = defectNumber;
                  // updateDefectNumbers() (run by the change event just above)
                  // rebuilds the number options for the new type and renders
                  // its dropdown against whatever was selected at that point
                  // (the first option) — re-render now that the real number
                  // for this defect has been set directly.
                  if (typeof renderCustomSelect === 'function') {
                      renderCustomSelect('defectNumber', 'defectNumberLabel', 'defectNumberPanel', 'defectNumberDropdown');
                  }
                  document.getElementById("severity").value = expandableRow.querySelector(".addSeverity").textContent;
                  document.getElementById("extent").value = expandableRow.querySelector(".addExtent").textContent;
                  document.getElementById("works").value = worksValue;
                  document.getElementById("priority").value = expandableRow.querySelector(".addPriority").textContent;
                  document.getElementById("cost").value = expandableRow.querySelector(".addCost").textContent;
                  document.getElementById("comment").value = expandableRow.querySelector(".addComment").textContent;
                  document.getElementById("remedialWorks").value = expandableRow.querySelector(".addRemedialWorks")?.textContent || '';
              } else {
                  document.getElementById("severity").value = '1';
                  document.getElementById("extent").value = 'A';
                  document.getElementById("works").value = 'N';
                  document.getElementById("comment").value = editSegmentComment;
                  document.getElementById("priority").value = '';
                  document.getElementById("cost").value = '';
                  document.getElementById("remedialWorks").value = '';
              }
              document.getElementById("modalTitle").textContent = "Edit Defect";
              // No Defects / Not Inspected only ever need a comment, so editing
              // one reuses the same inline quick-confirm box as creating one,
              // instead of opening the full modal just to tweak a comment.
              if (editSegmentState === 'no-defects' || editSegmentState === 'not-inspected') {
                  const buttonRow = addButtonRowForMainRow(currentRow);
                  const box = buttonRow?.querySelector('.quick-confirm-box');
                  if (box) {
                      box.dataset.pendingStatus = editSegmentState;
                      box.dataset.editingTimestamp = expandableRow.dataset.timestamp;
                      const textarea = box.querySelector('.quick-confirm-comment');
                      textarea.value = editSegmentComment;
                      textarea.style.height = '';
                      textarea.style.height = textarea.scrollHeight + 'px';
                      const confirmBtn = box.querySelector('.quick-confirm-confirm');
                      confirmBtn.classList.remove('confirm-green', 'confirm-orange');
                      confirmBtn.classList.add(editSegmentState === 'no-defects' ? 'confirm-green' : 'confirm-orange');
                      box.style.display = 'block';
                      textarea.focus();
                      return;
                  }
              }
              if (editSegmentState === 'no-defects') {
                  document.getElementById("of-no-defects-comment").value = editSegmentComment;
              } else if (editSegmentState === 'not-inspected') {
                  document.getElementById("of-not-inspected-comment").value = editSegmentComment;
              }
              openModal(true, editSegmentState);
          }
      }
  });
  document.getElementById("inspectionElementsTable").addEventListener("click", function (event) {
    if (event.target.closest("button[title='Delete']")) {
      if (!confirm("Are you sure you want to delete this defect?")) return;
      const expandableRow = event.target.closest("tr.expandable-row");
      if (!expandableRow) return;
      const defectTimestamp = expandableRow.dataset.timestamp;
      if (defectTimestamp) {
        let defects = JSON.parse(sessionStorage.getItem('defects')) || [];
        const deleted = defects.find(defect => defect.timestamp === defectTimestamp);
        defects = defects.filter(defect => defect.timestamp !== defectTimestamp);

        // If the primary defect was just deleted, promote whichever
        // remaining defect on this element is worst (highest ECS) so the
        // element always has a primary as long as it still has defects.
        if (deleted?.isPrimary) {
          const siblings = defects.filter(d =>
            d.elementNumber == deleted.elementNumber && d.spanNumber == deleted.spanNumber
          );
          if (siblings.length > 0) {
            const worst = siblings.reduce((worst, d) => {
              const ecs = calculateECS(`${d.severity}${d.extent}`);
              const worstEcs = calculateECS(`${worst.severity}${worst.extent}`);
              return ecs > worstEcs ? d : worst;
            });
            worst.isPrimary = true;
          }
        }
        sessionStorage.setItem('defects', JSON.stringify(defects));

        let inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
        if (inspectionData.defects) {
          inspectionData.defects = inspectionData.defects.filter(d => d.timestamp !== defectTimestamp);
          inspectionData.defects.forEach(d => {
            const match = defects.find(def => def.timestamp === d.timestamp);
            if (match) d.isPrimary = match.isPrimary === true;
          });
          sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
        }
      }
      const mainRow = findMainRow(expandableRow);
      expandableRow.remove();
      if (mainRow) {
        highlightPrimaryDefect(mainRow);
        updateMainRow(mainRow);
        const remainingRows = findAllExpandableRows(mainRow);
        if (remainingRows.length === 0) {
          const buttonRow = findButtonRow(mainRow);
          if (buttonRow) buttonRow.remove();
        }
      }
      refreshBCIScores();
    }
  });
  document.getElementById("inspectionElementsTable").addEventListener("click", function(event) {
    const target = event.target;
    if (target.closest("button[title='Copy']")) {
      const expandableRow = target.closest("tr.expandable-row");
      if (expandableRow && expandableRow.classList.contains("retrieved-defect")) {
        const defectCombined = expandableRow.querySelector(".addDefect").textContent;
        const [defectType, defectNumber] = defectCombined.split('.');
        const severity = expandableRow.querySelector(".addSeverity").textContent;
        const extent = expandableRow.querySelector(".addExtent").textContent;
        const works = expandableRow.querySelector(".addWorks").textContent;
        const priority = expandableRow.querySelector(".addPriority").textContent;
        const cost = expandableRow.querySelector(".addCost").textContent;
        const comment = expandableRow.querySelector(".addComment").textContent;
        const remedialWorks = expandableRow.querySelector(".addRemedialWorks")?.textContent || '';
        const selectedSpan = sessionStorage.getItem('selectedSpan');
        if (!selectedSpan) {
          showAlertModal("No span selected! Please select a span first.");
          return;
        }
        let mainRow = expandableRow;
        while (mainRow && !mainRow.classList.contains("main-row")) {
          mainRow = mainRow.previousElementSibling;
        }
        const elementNumber = mainRow ? mainRow.dataset.rowId : null;
        let defects = JSON.parse(sessionStorage.getItem('defects')) || [];
        // Same rule as a brand-new defect: the first one entered for this
        // element is primary by default (see saveChanges).
        const isFirstForElement = !defects.some(d =>
          d.elementNumber == elementNumber && d.spanNumber == selectedSpan
        );
        const defectData = {
          defectCombined: defectCombined,
          defectType: defectType,
          defectNumber: defectNumber,
          severity: severity,
          extent: extent,
          works: works,
          priority: priority,
          cost: cost,
          comment: comment,
          spanNumber: selectedSpan,
          elementNumber: elementNumber,
          timestamp: new Date().toISOString(),
          remedialWorks: remedialWorks,
          isPrimary: isFirstForElement
        };
        defects.push(defectData);
        sessionStorage.setItem('defects', JSON.stringify(defects));
        const newRow = addDefectToTable(mainRow, defectData, false, true);
        if (newRow && !mainRow.classList.contains("expanded")) {
          toggleButtonRow(mainRow);
        } else if (newRow && mainRow.classList.contains("expanded")) {
          newRow.style.display = "table-row";
        }
        updateMainRow(mainRow);
        refreshBCIScores();
        showAlertModal("Defect copied successfully. You can now edit the new defect.", 'success');
      } else {
        showAlertModal("Copying is only allowed for retrieved defects.");
      }
    }
  });
});

document.getElementById('works').addEventListener('change', function() {
    const showFields = this.value === 'Y';
    const remedialWorksGroup = document.getElementById('remedialWorksGroup');
    const priorityGroup = document.getElementById('priorityGroup');
    const costGroup = document.getElementById('costGroup');
    if (remedialWorksGroup) remedialWorksGroup.style.display = showFields ? 'flex' : 'none';
    if (priorityGroup) priorityGroup.style.display = showFields ? 'flex' : 'none';
    if (costGroup) costGroup.style.display = showFields ? 'flex' : 'none';
    if (!showFields) {
        if (document.getElementById('remedialWorks')) document.getElementById('remedialWorks').value = '';
        if (document.getElementById('priority')) document.getElementById('priority').value = '';
        if (document.getElementById('cost')) document.getElementById('cost').value = '';
    }
});

(function() {
    const toggleBtn = document.getElementById('nightModeToggle');
    if (!toggleBtn) {
        console.log('Dark mode button not found');
        return;
    }
    toggleBtn.onclick = function(e) {
        e.preventDefault();
        document.body.classList.toggle('night-mode');
        if (document.body.classList.contains('night-mode')) {
            this.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('nightMode', 'on');
            console.log('Dark mode ON');
        } else {
            this.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('nightMode', 'off');
            console.log('Dark mode OFF');
        }
    };
    if (localStorage.getItem('nightMode') === 'on') {
        document.body.classList.add('night-mode');
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        console.log('Restored dark mode from storage');
    }
})();

function updateConditionalFields(expandableRow, worksValue) {
    const worksRow = expandableRow.querySelector('.works-row');
    const priorityRow = expandableRow.querySelector('.priority-row');
    const costRow = expandableRow.querySelector('.cost-row');
    if (!worksRow || !priorityRow || !costRow) return;
    const isYes = worksValue === 'Y' || worksValue === 'Yes' || worksValue === true;
    if (isYes) {
        worksRow.classList.add('works-active');
        priorityRow.classList.add('visible');
        costRow.classList.add('visible');
    } else {
        worksRow.classList.remove('works-active');
        priorityRow.classList.remove('visible');
        costRow.classList.remove('visible');
    }
}

function updateConditionalFieldsFromWorksCell(worksCellElement, worksValue) {
    const expandableRow = worksCellElement.closest('.expandable-row');
    if (expandableRow) updateConditionalFields(expandableRow, worksValue);
}

function refreshAllConditionalFields() {
    document.querySelectorAll('.expandable-row').forEach(row => {
        const worksValue = row.querySelector('.addWorks')?.textContent?.trim();
        if (worksValue && worksValue !== 'Add') updateConditionalFields(row, worksValue);
    });
}

const conclusionsModalOverlay = document.getElementById('conclusionsModalOverlay');
const conclusionsTextarea = document.getElementById('inspectionConclusionsText');
const conclusionsBar = document.getElementById('conclusionsBar');
const barIcon = document.getElementById('barIcon');
const charCounter = document.getElementById('charCounter');

function loadSavedConclusions() {
    const savedConclusions = sessionStorage.getItem('inspectionConclusions');
    if (savedConclusions && conclusionsTextarea) {
        conclusionsTextarea.value = savedConclusions;
        if (savedConclusions.trim().length > 0) {
            conclusionsBar.classList.add('done');
            barIcon.innerHTML = '<i class="fas fa-check"></i>';
        }
        updateCharCount();
    }
}

let scrollbarWidth = 0;
function getScrollbarWidth() {
    return window.innerWidth - document.documentElement.clientWidth;
}

function openConclusionsModal() {
    if (conclusionsModalOverlay) {
        scrollbarWidth = getScrollbarWidth();
        document.body.classList.add('modal-open');
        document.body.style.paddingRight = scrollbarWidth + 'px';
        conclusionsModalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            if (conclusionsTextarea) conclusionsTextarea.focus();
        }, 100);
    }
}

function closeConclusionsModal() {
    if (conclusionsModalOverlay) {
        conclusionsModalOverlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
        document.body.style.overflow = '';
    }
}

function updateCharCount() {
    if (conclusionsTextarea && charCounter) {
        const length = conclusionsTextarea.value.length;
        charCounter.textContent = length + ' characters';
        if (length > 0 && length < 50) {
            charCounter.classList.add('warning');
        } else {
            charCounter.classList.remove('warning');
        }
    }
}

function saveConclusions() {
    const text = conclusionsTextarea ? conclusionsTextarea.value : '';
    sessionStorage.setItem('inspectionConclusions', text);
    const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
    inspectionData.conclusions = text;
    sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
    if (text.trim().length > 0) {
        conclusionsBar.classList.add('done');
        barIcon.innerHTML = '<i class="fas fa-check"></i>';
    } else {
        conclusionsBar.classList.remove('done');
        barIcon.innerHTML = '<i class="fas fa-pen"></i>';
    }
    closeConclusionsModal();
    showToast('Conclusions saved successfully!', 'success');
}

if (conclusionsModalOverlay) {
    conclusionsModalOverlay.addEventListener('click', function(e) {
        if (e.target === this) closeConclusionsModal();
    });
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && conclusionsModalOverlay && conclusionsModalOverlay.classList.contains('active')) {
        closeConclusionsModal();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    loadSavedConclusions();
});

window.openConclusionsModal = openConclusionsModal;
window.closeConclusionsModal = closeConclusionsModal;
window.saveConclusions = saveConclusions;
window.updateCharCount = updateCharCount;

function showToast(message, type) {
    let toast = document.getElementById('customToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'customToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #1a2428;
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 0.85rem;
            z-index: 2000;
            display: none;
            animation: fadeInUp 0.3s ease;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    if (type === 'success') {
        toast.style.background = '#22c55e';
        toast.style.color = '#1a2428';
    } else {
        toast.style.background = '#1a2428';
        toast.style.color = 'white';
    }
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
            toast.style.opacity = '';
        }, 300);
    }, 3000);
}

window.setAsPrimaryDefect = function(primaryTagElement) {
    const expandableRow = primaryTagElement.closest('.expandable-row');
    if (!expandableRow) {
        console.error('Could not find expandable row');
        return;
    }
    const mainRow = findMainRow(expandableRow);
    if (!mainRow) {
        console.error('Could not find main row');
        return;
    }
    const elementNumber = mainRow.dataset.rowId;
    const currentSpan = sessionStorage.getItem('selectedSpan');
    let defects = JSON.parse(sessionStorage.getItem('defects')) || [];
    const elementDefects = defects.filter(d => 
        d.elementNumber == elementNumber && 
        d.spanNumber == currentSpan
    );
    if (elementDefects.length === 0) {
        console.warn('No defects found for this element');
        return;
    }
    const defectTimestamp = expandableRow.dataset.timestamp;
    const currentDefect = defects.find(d => d.timestamp === defectTimestamp);
    if (!currentDefect) {
        console.error('Could not find defect data');
        return;
    }
    const isCurrentlyPrimary = currentDefect.isPrimary === true;
    if (isCurrentlyPrimary) {
        console.log('This defect is already primary');
        return;
    }
    defects.forEach(defect => {
        if (defect.elementNumber == elementNumber && defect.spanNumber == currentSpan) {
            defect.isPrimary = false;
        }
    });
    currentDefect.isPrimary = true;
    sessionStorage.setItem('defects', JSON.stringify(defects));
    let inspectionData = JSON.parse(sessionStorage.getItem('inspectionData')) || {};
    if (inspectionData.defects) {
        inspectionData.defects.forEach(defect => {
            if (defect.elementNumber == elementNumber && 
                defect.spanNumber == currentSpan &&
                defect.timestamp === defectTimestamp) {
                defect.isPrimary = true;
            } else if (defect.elementNumber == elementNumber && 
                       defect.spanNumber == currentSpan) {
                defect.isPrimary = false;
            }
        });
        sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
    }
    const allExpandableRows = findAllExpandableRows(mainRow);
    allExpandableRows.forEach(row => {
        const tag = row.querySelector('.primary-tag');
        if (tag) tag.classList.remove('filled');
    });
    primaryTagElement.classList.add('filled');
    // Primary defect always sits right under the main row.
    mainRow.parentNode.insertBefore(expandableRow, mainRow.nextSibling);
    updateMainRow(mainRow);
    console.log(`Primary defect set for element ${elementNumber}: ${currentDefect.defectCombined}`);
    showPrimaryFeedback(primaryTagElement);
};

function showPrimaryFeedback(element) {
    const originalTransition = element.style.transition;
    element.style.transform = 'scale(1.05)';
    setTimeout(() => {
        element.style.transform = 'scale(1)';
    }, 200);
}

function highlightPrimaryDefect(mainRow) {
    const elementNumber = mainRow.dataset.rowId;
    const currentSpan = sessionStorage.getItem('selectedSpan');
    let defects = JSON.parse(sessionStorage.getItem('defects')) || [];
    const primaryDefect = defects.find(d => 
        d.elementNumber == elementNumber && 
        d.spanNumber == currentSpan && 
        d.isPrimary === true
    );
    if (primaryDefect) {
        const expandableRows = findAllExpandableRows(mainRow);
        expandableRows.forEach(row => {
            const tag = row.querySelector('.primary-tag');
            if (tag && row.dataset.timestamp === primaryDefect.timestamp) {
                tag.classList.add('filled');
                // Primary defect always sits right under the main row.
                mainRow.parentNode.insertBefore(row, mainRow.nextSibling);
            }
        });
        updateMainRow(mainRow);
    }
}

const originalAddDefectToTable = window.addDefectToTable || addDefectToTable;
if (typeof addDefectToTable === 'function') {
    window.addDefectToTable = function(mainRow, defectData, isRetrieved, isEditable) {
        const result = originalAddDefectToTable(mainRow, defectData, isRetrieved, isEditable);
        if (defectData.isPrimary && result) {
            const tag = result.querySelector('.primary-tag');
            if (tag) tag.classList.add('filled');
            updateMainRow(mainRow);
        }
        return result;
    };
}

window.getPrimaryDefect = function(elementNumber, spanNumber) {
    const defects = JSON.parse(sessionStorage.getItem('defects')) || [];
    return defects.find(d => 
        d.elementNumber == elementNumber && 
        d.spanNumber == spanNumber && 
        d.isPrimary === true
    );
};

window.getElementDefects = function(elementNumber, spanNumber) {
    const defects = JSON.parse(sessionStorage.getItem('defects')) || [];
    return defects.filter(d => 
        d.elementNumber == elementNumber && 
        d.spanNumber == spanNumber
    );
};

function highlightAllPrimaryDefects() {
    const allMainRows = document.querySelectorAll('tr.main-row');
    allMainRows.forEach(mainRow => {
        highlightPrimaryDefect(mainRow);
    });
}

const originalLoadDefectsFromSession = window.loadDefectsFromSession || loadDefectsFromSession;
if (typeof loadDefectsFromSession === 'function') {
    window.loadDefectsFromSession = function(currentSpan) {
        if (originalLoadDefectsFromSession) {
            originalLoadDefectsFromSession(currentSpan);
        }
        setTimeout(highlightAllPrimaryDefects, 100);
    };
}

const originalLoadDefectsFromAPI = window.loadDefectsFromAPI || loadDefectsFromAPI;
if (typeof loadDefectsFromAPI === 'function') {
    window.loadDefectsFromAPI = function(structureId, inspectionDate, currentSpan) {
        return originalLoadDefectsFromAPI(structureId, inspectionDate, currentSpan).then(result => {
            setTimeout(highlightAllPrimaryDefects, 100);
            return result;
        });
    };
}

if (typeof findAllExpandableRows === 'undefined') {
    window.findAllExpandableRows = function(mainRow) {
        const expandableRows = [];
        let sibling = mainRow.nextElementSibling;
        while (sibling && !sibling.classList.contains('main-row')) {
            if (sibling.classList.contains('expandable-row')) {
                expandableRows.push(sibling);
            }
            sibling = sibling.nextElementSibling;
        }
        return expandableRows;
    };
}

if (typeof findMainRow === 'undefined') {
    window.findMainRow = function(startRow) {
        if (startRow.classList.contains('main-row')) {
            return startRow;
        }
        let currentRow = startRow.previousElementSibling;
        while (currentRow) {
            if (currentRow.classList.contains('main-row')) {
                return currentRow;
            }
            currentRow = currentRow.previousElementSibling;
        }
        return null;
    };
}

document.addEventListener('DOMContentLoaded', function() {
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', function() {
            const inspectionData = JSON.parse(sessionStorage.getItem('inspectionData') || '{}');
            const defects = JSON.parse(sessionStorage.getItem('defects') || '[]');
            sessionStorage.setItem('inspectionData', JSON.stringify(inspectionData));
            sessionStorage.setItem('defects', JSON.stringify(defects));
            showDraftToast('Draft saved successfully');
        });
    }
});

function showDraftToast(message) {
    let toast = document.getElementById('draftToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'draftToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #3d6b69;
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 0.85rem;
            z-index: 10000;
            display: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 2500);
}



// ============================================
// ROW DENSITY TOGGLE — Bulky ↔ Contracted
// ============================================

(function() {
    const ROW_DENSITY_KEY = 'spanSense_rowDensity';
    
    function initRowDensity() {
        const saved = localStorage.getItem(ROW_DENSITY_KEY);
        const btn = document.getElementById('rowDensityToggle');
        const icon = document.getElementById('rowDensityIcon');

        if (saved === 'contracted') {
            document.body.classList.add('contracted-rows');
            if (btn) { btn.classList.add('active'); btn.title = 'Switch to expanded rows'; }
            if (icon) icon.className = 'fas fa-expand-alt';
        } else {
            // Default: bulky mode
            document.body.classList.remove('contracted-rows');
            if (btn) { btn.classList.remove('active'); btn.title = 'Switch to compact rows'; }
            if (icon) icon.className = 'fas fa-compress-alt';
        }
    }

    window.toggleRowDensity = function() {
        const isContracted = document.body.classList.toggle('contracted-rows');
        const btn = document.getElementById('rowDensityToggle');
        const icon = document.getElementById('rowDensityIcon');

        localStorage.setItem(ROW_DENSITY_KEY, isContracted ? 'contracted' : 'bulky');

        if (isContracted) {
            if (btn) { btn.classList.add('active'); btn.title = 'Switch to expanded rows'; }
            if (icon) icon.className = 'fas fa-expand-alt';
        } else {
            if (btn) { btn.classList.remove('active'); btn.title = 'Switch to compact rows'; }
            if (icon) icon.className = 'fas fa-compress-alt';
        }
    };
    
    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRowDensity);
    } else {
        initRowDensity();
    }
})();
