// popup.js
// Passiflo — Popup Logic
//
// Manages the three-step workflow (Setup → Capture → Output), all rendered inline
// in the side panel. Screenshots and HTML snapshots are held as plain JS variables
// for the session only. Nothing is written to storage or sent over the network.

// ─── STATE ────────────────────────────────────────────────────────────────────

const state = {
  step:            1,
  checkType:       'acceptance_criteria', // 'acceptance_criteria' | 'regression'
  captureMode:     'comparison',          // 'comparison' | 'single'
  // Acceptance Criteria mode fields
  acItems:         [''],                  // array of AC strings, 1–5 items
  acNotes:         '',                    // optional notes
  // Regression mode field
  checkDescription:'',
  screenshot1:     null,          // data URL | null (FF OFF, or single)
  screenshot2:     null,          // data URL | null (FF ON, comparison only)
  html1:            null,          // outerHTML string for slot 1 (FF OFF or single)
  html2:            null,          // outerHTML string for slot 2 (FF ON, comparison only)
  htmlCaptureMode:  'streamlined', // 'streamlined' | 'full' — current toggle setting
  tokenOptimise:    true,          // post-processing: removes SVGs, aria-hidden spans, source tags
  htmlCaptureMode1: null,          // mode used when slot 1 was captured
  htmlCaptureMode2: null,          // mode used when slot 2 was captured
  capturing:       false,
  capturingSlot:   null,          // 1 | 2 | null — which slot is currently being captured
  date:            new Date().toISOString().split('T')[0]  // YYYY-MM-DD
};

// ─── DOM REFERENCES ───────────────────────────────────────────────────────────

const dom = {
  // Step indicator nodes
  steps: document.querySelectorAll('.step'),

  // Views
  viewSetup:    document.getElementById('view-setup'),
  viewCapture:  document.getElementById('view-capture'),
  viewOutput:   document.getElementById('view-output'),

  // Step 1 — Setup
  checkTypeRadios:      document.querySelectorAll('input[name="checkType"]'),
  // AC mode
  acSection:            document.getElementById('acSection'),
  acList:               document.getElementById('acList'),
  btnAddAc:             document.getElementById('btnAddAc'),
  acNotes:              document.getElementById('acNotes'),
  // Regression mode
  regressionSection:    document.getElementById('regressionSection'),
  setupHint:            document.getElementById('setupHint'),
  checkDescription:     document.getElementById('checkDescription'),
  btnContinue:          document.getElementById('btnContinue'),

  // Step 2 — Comparison slots
  comparisonSlots:  document.getElementById('comparisonSlots'),
  slot1:            document.getElementById('slot1'),
  slot2:            document.getElementById('slot2'),
  slot1Title:       document.getElementById('slot1Title'),
  slot2Title:       document.getElementById('slot2Title'),
  slot1Preview:     document.getElementById('slot1Preview'),
  slot2Preview:     document.getElementById('slot2Preview'),
  slot1Status:      document.getElementById('slot1Status'),
  slot2Status:      document.getElementById('slot2Status'),
  btnCapture1:      document.getElementById('btnCapture1'),
  btnCapture2:      document.getElementById('btnCapture2'),

  // Step 2 — Single slot
  singleSlot:           document.getElementById('singleSlot'),
  slot1singlePreview:   document.getElementById('slot1singlePreview'),
  slot1singleStatus:    document.getElementById('slot1singleStatus'),
  btnCaptureSingle:     document.getElementById('btnCaptureSingle'),

  // Step 2 — Other controls
  singleModeToggle:      document.getElementById('singleModeToggle'),
  singleModeToggleLabel: document.getElementById('singleModeToggleLabel'),
  htmlFullModeToggle:    document.getElementById('htmlFullModeToggle'),
  tokenOptimiseToggle:   document.getElementById('tokenOptimiseToggle'),
  summaryBar:            document.getElementById('summaryBar'),
  captureError:      document.getElementById('captureError'),

  // Footer buttons
  btnBack:     document.getElementById('btnBack'),
  btnGenerate: document.getElementById('btnGenerate'),

  // Step 3 — Output
  outputSummaryType:     document.getElementById('outputSummaryType'),
  outputSummaryHeader:   document.getElementById('outputSummaryHeader'),
  outputSummaryChevron:  document.getElementById('outputSummaryChevron'),
  outputSummaryBody:     document.getElementById('outputSummaryBody'),
  outputPromptHeader:    document.getElementById('outputPromptHeader'),
  outputPromptChevron:   document.getElementById('outputPromptChevron'),
  outputPromptBody:      document.getElementById('outputPromptBody'),
  outputPromptTextarea:  document.getElementById('outputPromptTextarea'),
  btnCopyHtmlOutput:     document.getElementById('btnCopyHtmlOutput'),
  copyHtmlOutputLabel:   document.getElementById('copyHtmlOutputLabel'),
  outputScreenshotsGrid: document.getElementById('outputScreenshotsGrid'),
  btnNewCheck:           document.getElementById('btnNewCheck'),
  btnBackFromOutput:     document.getElementById('btnBackFromOutput'),
  tokenEstimate:         document.getElementById('tokenEstimate'),
  tokenWarning:          document.getElementById('tokenWarning'),

  // Reset buttons
  btnReset1: document.getElementById('btnReset1'),
  btnReset2: document.getElementById('btnReset2'),
};

// ─── SETUP PERSISTENCE ────────────────────────────────────────────────────────
// Step 1 answers are saved to localStorage so they survive the popup closing
// when the tester navigates to a page before capturing. Screenshots are never
// persisted — they are session-only by design.

const SETUP_KEY = 'qa_setup';

function saveSetup() {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify({
      checkType:        state.checkType,
      acItems:          state.acItems,
      acNotes:          state.acNotes,
      checkDescription: state.checkDescription,
      htmlCaptureMode:  state.htmlCaptureMode,
      tokenOptimise:    state.tokenOptimise,
    }));
  } catch (_) {
    // localStorage unavailable (e.g. private mode) — fail silently.
  }
}

function restoreSetup() {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.checkType) return false;

    state.checkType = saved.checkType;
    dom.checkTypeRadios.forEach(r => { r.checked = r.value === saved.checkType; });

    if (saved.acItems && Array.isArray(saved.acItems) && saved.acItems.length > 0) {
      state.acItems = saved.acItems;
    }
    if (saved.acNotes) {
      state.acNotes        = saved.acNotes;
      dom.acNotes.value    = saved.acNotes;
    }
    if (saved.checkDescription) {
      state.checkDescription      = saved.checkDescription;
      dom.checkDescription.value  = saved.checkDescription;
    }

    // Restore capture preferences
    if (saved.htmlCaptureMode) {
      state.htmlCaptureMode = saved.htmlCaptureMode;
      dom.htmlFullModeToggle.checked = saved.htmlCaptureMode === 'streamlined';
    }
    if (typeof saved.tokenOptimise === 'boolean') {
      state.tokenOptimise = saved.tokenOptimise;
      dom.tokenOptimiseToggle.checked = saved.tokenOptimise;
    }

    // Show the correct section and render AC items
    onCheckTypeChange();
    return true;
  } catch (_) {
    return false;
  }
}

// ─── STEP NAVIGATION ──────────────────────────────────────────────────────────

function goToStep(n) {
  state.step = n;

  dom.steps.forEach(el => {
    const stepN = parseInt(el.dataset.step, 10);
    el.classList.remove('active', 'done');
    if (stepN === n)      el.classList.add('active');
    else if (stepN < n)   el.classList.add('done');
  });

  dom.viewSetup.classList.toggle('active',   n === 1);
  dom.viewCapture.classList.toggle('active', n === 2);
  dom.viewOutput.classList.toggle('active',  n === 3);
}

// ─── STEP 1: SETUP ────────────────────────────────────────────────────────────

function onCheckTypeChange() {
  const isAC = state.checkType === 'acceptance_criteria';
  dom.acSection.classList.toggle('hidden', !isAC);
  dom.regressionSection.classList.toggle('hidden', isAC);
  if (isAC) renderAcItems();
  // Content is hardcoded — innerHTML is safe here.
  dom.setupHint.innerHTML = isAC
    ? `<span class="setup-hint-label">How to use</span>
       <ol>
         <li><strong>Set</strong> your acceptance criteria above</li>
         <li><strong>Navigate</strong> to the page you want to test</li>
         <li><strong>Capture</strong> the page — screenshot optional but recommended</li>
         <li><strong>Copy</strong> the prompt and paste into Copilot</li>
       </ol>`
    : `<span class="setup-hint-label">How to use</span>
       <ol>
         <li><strong>Set</strong> your check type and describe what you're testing</li>
         <li><strong>Navigate</strong> to the page in its current state</li>
         <li><strong>Capture</strong> Before and After — apply your change between captures</li>
         <li><strong>Copy</strong> the prompt and paste into Copilot</li>
       </ol>`;
  validateSetup();
}

function renderAcItems() {
  dom.acList.innerHTML = '';
  const count = state.acItems.length;

  state.acItems.forEach((text, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'ac-item';

    {
      const header = document.createElement('div');
      header.className = 'ac-item-header';

      const lbl = document.createElement('span');
      lbl.className = 'ac-item-label';
      lbl.textContent = `AC ${i + 1}`;

      header.appendChild(lbl);

      if (count > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-ac';
        removeBtn.type = 'button';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => {
          state.acItems.splice(i, 1);
          renderAcItems();
          validateSetup();
          saveSetup();
        });
        header.appendChild(removeBtn);
      }
      wrap.appendChild(header);
    }

    const ta = document.createElement('textarea');
    ta.className = 'textarea';
    ta.rows = 2;
    ta.placeholder = `e.g. The save button is visible when the feature flag is ON`;
    ta.value = text;
    ta.addEventListener('input', () => {
      state.acItems[i] = ta.value;
      validateSetup();
      saveSetup();
    });

    wrap.appendChild(ta);
    dom.acList.appendChild(wrap);
  });

  dom.btnAddAc.classList.toggle('hidden', count >= 5);
}

function validateSetup() {
  let ready = false;
  if (state.checkType === 'acceptance_criteria') {
    ready = state.acItems.some(item => item.trim().length > 0);
  } else if (state.checkType === 'regression') {
    ready = state.checkDescription.trim().length > 0;
  }
  dom.btnContinue.disabled = !ready;
}

// ─── CAPTURE LABELS ───────────────────────────────────────────────────────────
// Single source of truth for all contextual slot/button text based on check type.

function captureLabels() {
  return {
    label1:  'BEFORE',
    label2:  'AFTER',
    btn1:    'Before',
    btn2:    'After',
    reCap1:  'Re-capture Before',
    reCap2:  'Re-capture After',
    lock2:   'Capture Before first',
  };
}

function updateSlotLabels() {
  const { label1, label2, lock2 } = captureLabels();
  dom.slot1Title.textContent = label1;
  dom.slot2Title.textContent = label2;
  if (!state.screenshot2) {
    resetSlotPreview(dom.slot2Preview, lock2);
  }
}

function onContinue() {
  if (state.checkType === 'acceptance_criteria') {
    // AC always uses single screenshot
    state.captureMode = 'single';
    dom.singleModeToggle.checked = true;
    dom.comparisonSlots.classList.add('hidden');
    dom.singleSlot.classList.remove('hidden');
    dom.singleModeToggleLabel.classList.add('hidden');
    if (state.screenshot1) showThumbnail(dom.slot1singlePreview, state.screenshot1);
  } else {
    // Regression — comparison mode by default, toggle available
    state.captureMode = 'comparison';
    dom.singleModeToggle.checked = false;
    dom.comparisonSlots.classList.remove('hidden');
    dom.singleSlot.classList.add('hidden');
    dom.singleModeToggleLabel.classList.remove('hidden');
    state.checkDescription = dom.checkDescription.value.trim();
    if (state.screenshot1) showThumbnail(dom.slot1Preview, state.screenshot1);
    if (state.screenshot2) showThumbnail(dom.slot2Preview, state.screenshot2);
    updateSlotLabels();
  }

  renderSummaryBar();
  goToStep(2);
  hideError();
  updateCaptureUI();
}

function buildAcCards(filled) {
  return filled.map((item, i) =>
    `<div class="summary-ac-row"><span class="summary-ac-label">AC ${i + 1}</span><span class="summary-ac-text">${escapeHtml(item.trim())}</span></div>`
  ).join('');
}

function renderSummaryBar() {
  if (state.checkType === 'acceptance_criteria') {
    const filled = state.acItems.filter(i => i.trim());
    dom.summaryBar.innerHTML =
      `<div class="collapse-header">` +
        `<span class="summary-type">ACCEPTANCE CRITERIA</span>` +
        `<span class="collapse-chevron">▾</span>` +
      `</div>` +
      `<div class="summary-ac-list collapse-body collapsed">${buildAcCards(filled)}</div>`;
  } else {
    dom.summaryBar.innerHTML =
      `<div class="collapse-header">` +
        `<span class="summary-type">REGRESSION</span>` +
        `<span class="collapse-chevron">▾</span>` +
      `</div>` +
      `<div class="collapse-body collapsed">` +
        `<span class="summary-desc">${escapeHtml(state.checkDescription)}</span>` +
      `</div>`;
  }
}

// ─── STEP 2: CAPTURE ──────────────────────────────────────────────────────────

function updateCaptureUI() {
  const { capturing, capturingSlot, captureMode, screenshot1, screenshot2 } = state;
  const hasS1 = screenshot1 !== null;
  const hasS2 = screenshot2 !== null;

  if (captureMode === 'comparison') {

    // Slot 1
    dom.slot1Status.className = 'slot-status' + (capturing && capturingSlot === 1 ? ' capturing' : hasS1 ? ' success' : '');
    dom.slot1Status.textContent = capturing && capturingSlot === 1 ? 'Capturing…' : hasS1 ? 'Captured ✓' : 'Not captured';
    dom.slot1.classList.toggle('captured', hasS1);
    const cl = captureLabels();
    dom.btnCapture1.disabled = capturing;
    dom.btnCapture1.textContent = capturing && capturingSlot === 1 ? 'Capturing…' : hasS1 ? cl.reCap1 : `Capture ${cl.btn1}`;
    dom.btnCapture1.classList.toggle('re-capture', hasS1 && !(capturing && capturingSlot === 1));

    // Slot 2 — unlocked only after slot 1
    dom.slot2Status.className = 'slot-status' + (capturing && capturingSlot === 2 ? ' capturing' : hasS2 ? ' success' : '');
    dom.slot2Status.textContent = capturing && capturingSlot === 2 ? 'Capturing…' : hasS2 ? 'Captured ✓' : 'Not captured';
    dom.slot2.classList.toggle('captured', hasS2);
    dom.btnCapture2.disabled = !hasS1 || capturing;
    dom.btnCapture2.textContent = capturing && capturingSlot === 2 ? 'Capturing…' : hasS2 ? cl.reCap2 : `Capture ${cl.btn2}`;
    dom.btnCapture2.classList.toggle('re-capture', hasS2 && !(capturing && capturingSlot === 2));

    // Generate — needs both slots
    dom.btnGenerate.disabled = !hasS1 || !hasS2 || capturing;

  } else {

    // Single mode
    dom.slot1singleStatus.className = 'slot-status' + (capturing ? ' capturing' : hasS1 ? ' success' : '');
    dom.slot1singleStatus.textContent = capturing ? 'Capturing…' : hasS1 ? 'Captured ✓' : 'Not captured';
    dom.btnCaptureSingle.disabled = capturing;
    dom.btnCaptureSingle.textContent = capturing ? 'Capturing…' : hasS1 ? 'Re-capture' : 'Capture Screenshot';
    dom.btnCaptureSingle.classList.toggle('re-capture', hasS1 && !capturing);

    // Generate — needs slot 1
    dom.btnGenerate.disabled = !hasS1 || capturing;

  }
}

function onModeToggle() {
  const isSingle = dom.singleModeToggle.checked;
  state.captureMode = isSingle ? 'single' : 'comparison';

  if (isSingle) {
    // Clear slot 2 — not needed in single mode
    state.screenshot2      = null;
    state.html2            = null;
    state.htmlCaptureMode2 = null;
    resetSlotPreview(dom.slot2Preview, 'No screenshot yet');
    dom.slot2.classList.remove('captured');
    dom.slot2Status.textContent = 'Not captured';
    dom.slot2Status.className = 'slot-status';

    // Sync screenshot1 into the single slot preview
    if (state.screenshot1) showThumbnail(dom.slot1singlePreview, state.screenshot1);

  } else {
    // Sync screenshot1 back into comparison slot 1 preview
    if (state.screenshot1) showThumbnail(dom.slot1Preview, state.screenshot1);
    // Restore contextual slot labels and slot2 placeholder
    updateSlotLabels();
  }

  dom.comparisonSlots.classList.toggle('hidden', isSingle);
  dom.singleSlot.classList.toggle('hidden', !isSingle);

  updateCaptureUI();
}

// ─── SCREENSHOT CAPTURE ───────────────────────────────────────────────────────

async function captureScreenshot(slot) {
  // slot: 1 = FF OFF (comparison) or single screenshot; 2 = FF ON (comparison)
  state.capturing    = true;
  state.capturingSlot = slot;
  updateCaptureUI();
  hideError();

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      action:        'captureTabWithHtml',
      htmlMode:      state.htmlCaptureMode,
      tokenOptimise: state.tokenOptimise,
    });
  } catch (err) {
    showError('Could not reach the extension background. Try closing and reopening the popup.');
    state.capturing    = false;
    state.capturingSlot = null;
    updateCaptureUI();
    return;
  }

  state.capturing    = false;
  state.capturingSlot = null;

  if (!response || !response.success) {
    const msg = (response && response.error) ? response.error : 'Unknown error';
    if (msg.toLowerCase().includes('cannot access') || msg.includes('chrome://')) {
      showError('This page cannot be screenshotted. Navigate to a regular web page and try again.');
    } else {
      showError('Capture failed: ' + msg);
    }
    updateCaptureUI();
    return;
  }

  if (slot === 1) {
    state.screenshot1      = response.dataUrl;
    state.html1            = response.html ?? null;
    state.htmlCaptureMode1 = state.htmlCaptureMode;
    // Update whichever preview is currently visible
    const previewEl = state.captureMode === 'single' ? dom.slot1singlePreview : dom.slot1Preview;
    showThumbnail(previewEl, response.dataUrl);
  } else {
    state.screenshot2      = response.dataUrl;
    state.html2            = response.html ?? null;
    state.htmlCaptureMode2 = state.htmlCaptureMode;
    showThumbnail(dom.slot2Preview, response.dataUrl);
  }

  updateCaptureUI();
}

// ─── PROMPT GENERATION ────────────────────────────────────────────────────────

// ── Shared constant blocks — used by all prompt builders ─────────────────────

const SCOPE_BLOCK =
`ANALYSIS SCOPE:
You are a QA analyst performing static HTML inspection only.
You have access to HTML markup. You do NOT have access to:
- JavaScript execution or runtime behaviour
- CSS computed styles or visual rendering
- Network requests or API responses
- User interaction simulation
- Screen reader or assistive technology behaviour
Criteria or observations requiring any of the above MUST be marked INCONCLUSIVE. INCONCLUSIVE is a correct and expected verdict — it is not a failure of analysis.`;

const ANTI_HALLUCINATION_BLOCK =
`GROUNDING RULES:
- Every verdict must be supported by a specific HTML element, attribute, or text you can quote directly
- If you cannot find the relevant element, state what you searched for and return INCONCLUSIVE — never guess
- Do not infer runtime behaviour from HTML structure alone
- If the element is not found in the HTML, verdict must not be PASS`;

const FORMATTING_BLOCK =
`OUTPUT FORMAT RULES:
- Verdict word comes first, always (PASS / FAIL / INCONCLUSIVE)
- Use active voice. State observations as facts.
- Do not use hedging language: never write "seems", "might", "possibly", "appears to", or "could be"
- Each result MUST follow this exact structure with blank lines between each section:

  [The criterion or area label on its own line]

  [\u2705 PASS / \u274c FAIL / \u26a0\ufe0f INCONCLUSIVE on its own line]

  [For INCONCLUSIVE only — 💡 To resolve: Ask: would a screenshot of the page confirm whether this criterion passed? If yes, write "💡 To resolve: Attach a screenshot showing the current state of the page". If no, write "💡 To resolve: Check this manually in a live browser session". Use the screenshot option for: a setting or option that should be selected, a button or element that should be visible, a confirmation message that should appear, a value or label that should be displayed. Use the manual option for: a file download, navigation away from the page, a background process or API call, anything not visible on the page itself.]

  [2-3 sentence explanation. Write in plain language as if describing what a tester would see on screen — use terms like "button", "field", "section", or "option". Do not cite HTML attributes or element IDs. For FAIL, state expected vs actual. For INCONCLUSIVE, state what would be needed to verify.]

- Put a blank line between every result block
- End the entire output with a SUMMARY section using this exact format:

  SUMMARY

  Verdict         | Count
  ----------------|------
  ✅ PASS          | [n]
  ❌ FAIL          | [n]
  ⚠️ INCONCLUSIVE  | [n]

  Overall: [✅ PASS / ❌ FAIL / ⚠️ INCONCLUSIVE]
  (Overall is FAIL if any criterion FAILed; INCONCLUSIVE if none FAILed but any were INCONCLUSIVE; PASS only if all PASSed)`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayDate() {
  return state.date;
}

function htmlModeDescription(mode) {
  return mode === 'full'
    ? 'Full DOM (complete structure, styles and classes preserved)'
    : 'Streamlined (main content + headers, nav, and visible modals/dialogs; classes and noise stripped)';
}

function buildHTMLSnapshotBlock(captures, labels) {
  return captures
    .filter(c => c.html)
    .map((c, i) => {
      const label = labels[i] || `Snapshot ${i + 1}`;
      return `HTML ${i + 1} \u2014 ${label}\n\n${c.html}`;
    })
    .join('\n\n' + '='.repeat(80) + '\n\n');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function buildPrompt() {
  const { checkType, checkDescription, captureMode } = state;
  const isSingle = captureMode === 'single';

  const captures = isSingle
    ? [{ html: state.html1, mode: state.htmlCaptureMode1 }]
    : [
        { html: state.html1, mode: state.htmlCaptureMode1 },
        { html: state.html2, mode: state.htmlCaptureMode2 },
      ];

  const captureInfo =
    `  Capture mode: ${htmlModeDescription(state.htmlCaptureMode1 || state.htmlCaptureMode)}\n` +
    `  Token Optimise: ${state.tokenOptimise ? 'ON (SVGs, duplicate ARIA spans, and image source tags removed)' : 'OFF'}`;

  if (checkType === 'acceptance_criteria') {
    const criteria = state.acItems.filter(i => i.trim()).map(i => i.trim());
    return buildACPrompt(criteria, state.acNotes.trim(), captures, captureInfo);
  }

  return buildRegressionPrompt(checkDescription, captures, captureInfo, isSingle);
}

// ── Acceptance Criteria builder ───────────────────────────────────────────────

function buildACPrompt(criteria, notes, captures, captureInfo) {
  const criteriaList  = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const noteSection   = notes ? `\nNOTES:\n${notes}\n` : '';
  const isSingle      = captures.length === 1;
  const labels        = isSingle ? ['Current state'] : ['BEFORE', 'AFTER'];
  const htmlSnapshots = buildHTMLSnapshotBlock(captures, labels);

  const htmlHeader = isSingle
    ? `HTML SNAPSHOT (included in this message):\n- HTML 1: Current state`
    : `HTML SNAPSHOTS (included in this message):\n- HTML 1: Before \u2014 baseline\n- HTML 2: After \u2014 new state`;

  return [
    `QA CHECK \u2014 ACCEPTANCE CRITERIA`,
    `Date: ${getTodayDate()}`,
    ``,
    SCOPE_BLOCK,
    ``,
    `YOUR TASK:`,
    `You are verifying whether the provided HTML meets the following acceptance criteria.`,
    `For each criterion, locate the relevant HTML evidence first, then render a verdict.`,
    ``,
    `VERDICT DEFINITIONS:`,
    `\u2705 PASS \u2014 Criterion is met. Evidence found and confirms compliance.`,
    `\u274c FAIL \u2014 Criterion is not met. Evidence found and confirms non-compliance, or a required element is absent.`,
    `\u26a0\ufe0f INCONCLUSIVE \u2014 Cannot be determined from static HTML alone. Requires live browser testing.`,
    ``,
    `VERDICT DERIVATION RULES:`,
    `- Any FAIL \u2192 overall result is FAIL`,
    `- No FAILs but any INCONCLUSIVE \u2192 overall result is INCONCLUSIVE`,
    `- All PASS \u2192 overall result is PASS`,
    ``,
    ANTI_HALLUCINATION_BLOCK,
    ``,
    FORMATTING_BLOCK,
    ``,
    `EVIDENCE PATTERN \u2014 follow this for each criterion:`,
    `1. State what element or content you searched for`,
    `2. Quote the specific tag, attribute value, or text observed (or note its absence)`,
    `3. Explain in one sentence why this supports your verdict`,
    ``,
    `ACCEPTANCE CRITERIA BEING VERIFIED:`,
    criteriaList,
    noteSection,
    `SCREENSHOTS: The tester may attach screenshots separately.`,
    `- If screenshots ARE attached: use them to confirm visual layout alongside your HTML analysis.`,
    `- If no screenshots are attached: base your analysis on the HTML alone.`,
    ``,
    `\u26a0\ufe0f ANALYSIS SCOPE: Static HTML inspection only. Criteria requiring JavaScript execution, CSS rendering, or user interaction are marked INCONCLUSIVE.`,
    captureInfo,
    ``,
    htmlHeader,
    ``,
    `${'='.repeat(80)}`,
    htmlSnapshots,
    `${'='.repeat(80)}`,
  ].join('\n');
}

// ── Regression builder ────────────────────────────────────────────────────────

function buildRegressionPrompt(description, captures, captureInfo, isSingle) {
  const labels        = isSingle ? ['Current state'] : ['BEFORE', 'AFTER'];
  const htmlSnapshots = buildHTMLSnapshotBlock(captures, labels);

  const htmlHeader = isSingle
    ? `HTML SNAPSHOT (included in this message):\n- HTML 1: Current state`
    : `HTML SNAPSHOTS (included in this message):\n- HTML 1: Before \u2014 baseline DOM\n- HTML 2: After \u2014 new state DOM`;

  const taskLine = isSingle
    ? `You are reviewing a single HTML snapshot to verify the described state is correct.`
    : `You are comparing two HTML snapshots \u2014 BEFORE and AFTER a change \u2014 to identify what has changed between them.`;

  const analysisRules = isSingle ? `` :
`REGRESSION ANALYSIS RULES:
- Compare BEFORE and AFTER systematically, region by region
- Report what CHANGED, what is UNCHANGED, and what is ABSENT
- Flag additions, removals, and attribute modifications separately
- Do NOT flag differences in dynamic values (timestamps, session IDs) unless they indicate a structural change
- If the same content appears in both snapshots, it is UNCHANGED \u2014 do not report it as a finding
- Overall verdict is FAIL if any unexpected structural or content change is found
- Overall verdict is INCONCLUSIVE if differences exist but cannot be confirmed from markup alone`;

  const structureRule = isSingle
    ? `STRUCTURE YOUR OUTPUT AS:\n- One result block per captured page region\n- End with SUMMARY and OVERALL VERDICT`
    : `STRUCTURE YOUR OUTPUT AS:\n- One result block per captured page region (e.g. main content, header, nav, dialog)\n- Within each region: state what changed, what BEFORE showed, and what AFTER shows\n- End with a SUMMARY TABLE and OVERALL VERDICT`;

  return [
    `QA CHECK \u2014 REGRESSION TEST`,
    `Date: ${getTodayDate()}`,
    ``,
    SCOPE_BLOCK,
    ``,
    `YOUR TASK:`,
    taskLine,
    ``,
    `WHAT IS BEING CHECKED:`,
    description,
    ``,
    `VERDICT DEFINITIONS:`,
    `\u2705 PASS \u2014 No meaningful differences detected. Structure and content are consistent.`,
    `\u274c FAIL \u2014 A meaningful difference was detected in structure, content, or attributes.`,
    `\u26a0\ufe0f INCONCLUSIVE \u2014 A difference may exist but cannot be confirmed from static HTML.`,
    ``,
    analysisRules,
    ``,
    ANTI_HALLUCINATION_BLOCK,
    ``,
    FORMATTING_BLOCK,
    ``,
    structureRule,
    ``,
    `SCREENSHOTS: The tester may attach screenshots separately.`,
    `- If screenshots ARE attached: use them to confirm visual differences alongside your HTML comparison.`,
    `- If no screenshots are attached: base your analysis on the HTML alone.`,
    ``,
    `\u26a0\ufe0f ANALYSIS SCOPE: Static HTML ${isSingle ? 'inspection' : 'comparison'} only. Visual, behavioural, or JavaScript-driven differences cannot be detected from markup alone.`,
    captureInfo,
    ``,
    htmlHeader,
    ``,
    `${'='.repeat(80)}`,
    htmlSnapshots,
    `${'='.repeat(80)}`,
  ].join('\n');
}

// ─── OUTPUT RENDERING ─────────────────────────────────────────────────────────

function renderOutput() {
  const { checkType, checkDescription, captureMode, screenshot1, screenshot2 } = state;
  const isSingle = captureMode === 'single';

  // Summary
  dom.outputSummaryType.textContent = checkType === 'regression' ? 'REGRESSION' : 'ACCEPTANCE CRITERIA';
  if (checkType === 'acceptance_criteria') {
    const filled = state.acItems.filter(i => i.trim());
    dom.outputSummaryBody.innerHTML = `<div class="summary-ac-list">${buildAcCards(filled)}</div>`;
  } else {
    dom.outputSummaryBody.innerHTML = `<p class="output-summary-desc">${escapeHtml(checkDescription)}</p>`;
  }
  // Output summary — start collapsed
  dom.outputSummaryBody.classList.add('collapse-body');
  dom.outputSummaryBody.classList.add('collapsed');
  dom.outputSummaryChevron.classList.remove('chevron-up');

  // Prompt — start collapsed
  dom.outputPromptBody.classList.add('collapsed');
  dom.outputPromptChevron.classList.remove('chevron-up');
  dom.outputPromptTextarea.value = buildPrompt();

  // Screenshots
  const cl = captureLabels();
  dom.outputScreenshotsGrid.innerHTML = '';
  if (isSingle) {
    dom.outputScreenshotsGrid.appendChild(
      makeOutputShotCard(screenshot1, 'Screenshot', 'single_' + state.date + '.png')
    );
  } else {
    dom.outputScreenshotsGrid.appendChild(
      makeOutputShotCard(screenshot1, `Image 1 &mdash; <em>${cl.label1}</em>`, 'comparison_before_' + state.date + '.png')
    );
    dom.outputScreenshotsGrid.appendChild(
      makeOutputShotCard(screenshot2, `Image 2 &mdash; <em>${cl.label2}</em>`, 'comparison_after_' + state.date + '.png')
    );
  }

  // Token estimate — HTML is now embedded in the prompt, so count prompt chars only
  const promptText = dom.outputPromptTextarea.value;
  const estTokens  = Math.round(promptText.length / 4);
  dom.tokenEstimate.textContent = '~' + estTokens.toLocaleString() + ' estimated tokens (prompt + HTML)';

  const TOKEN_WARNING_THRESHOLD = 32000;
  if (estTokens > TOKEN_WARNING_THRESHOLD) {
    dom.tokenWarning.textContent = '⚠️ This capture is large and may exceed Copilot\'s context window. Try switching to Streamlined mode or navigate to a simpler page.';
    dom.tokenWarning.classList.remove('hidden');
  } else {
    dom.tokenWarning.classList.add('hidden');
  }

  // Reset copy button state
  dom.copyHtmlOutputLabel.textContent = 'Copy Prompt + HTML';
  dom.btnCopyHtmlOutput.classList.remove('done');
}

function makeOutputShotCard(dataUrl, labelHtml, filename) {
  const card = document.createElement('div');
  card.className = 'output-shot-card';

  const header = document.createElement('div');
  header.className = 'output-shot-header';

  const label = document.createElement('span');
  label.className = 'output-shot-label';
  label.innerHTML = labelHtml;

  const dlBtn = document.createElement('button');
  dlBtn.className = 'btn-dl';
  dlBtn.textContent = '\u2193 Download';
  dlBtn.addEventListener('click', () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  header.appendChild(label);
  header.appendChild(dlBtn);

  const thumb = document.createElement('div');
  thumb.className = 'output-shot-thumb';

  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Screenshot';
    thumb.appendChild(img);
  } else {
    thumb.classList.add('empty');
    thumb.textContent = 'Not available';
  }

  card.appendChild(header);
  card.appendChild(thumb);
  return card;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function showThumbnail(container, dataUrl) {
  const img = document.createElement('img');
  img.src  = dataUrl;
  img.alt  = 'Screenshot thumbnail';
  container.innerHTML = '';
  container.appendChild(img);
}

function resetSlotPreview(container, text) {
  container.innerHTML =
    `<div class="slot-placeholder">` +
    `<span class="slot-placeholder-icon">&#9643;</span>` +
    `<span>${escapeHtml(text)}</span>` +
    `</div>`;
}

function showError(msg) {
  dom.captureError.textContent = msg;
  dom.captureError.classList.remove('hidden');
}

function hideError() {
  dom.captureError.classList.add('hidden');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── EVENT WIRING ─────────────────────────────────────────────────────────────

// Step 1 — check type selection
dom.checkTypeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    state.checkType = radio.value;
    onCheckTypeChange();
    saveSetup();
  });
});

// Step 1 — AC: add criterion button
dom.btnAddAc.addEventListener('click', () => {
  if (state.acItems.length >= 5) return;
  state.acItems.push('');
  renderAcItems();
  // Focus the new textarea
  const textareas = dom.acList.querySelectorAll('textarea');
  if (textareas.length) textareas[textareas.length - 1].focus();
});

// Step 1 — AC: notes
dom.acNotes.addEventListener('input', () => {
  state.acNotes = dom.acNotes.value;
  saveSetup();
});

// Step 1 — Regression: description input
dom.checkDescription.addEventListener('input', () => {
  state.checkDescription = dom.checkDescription.value;
  validateSetup();
  saveSetup();
});

// Step 1 — continue
dom.btnContinue.addEventListener('click', onContinue);

// Step 2 — back
dom.btnBack.addEventListener('click', () => goToStep(1));

// Step 2 — capture buttons
dom.btnCapture1.addEventListener('click',      () => captureScreenshot(1));
dom.btnCapture2.addEventListener('click',      () => captureScreenshot(2));
dom.btnCaptureSingle.addEventListener('click', () => captureScreenshot(1));

// Step 2 — single/comparison mode toggle
dom.singleModeToggle.addEventListener('change', onModeToggle);

// Step 2 — HTML capture mode toggle (checked = streamlined, unchecked = full)
dom.htmlFullModeToggle.addEventListener('change', () => {
  state.htmlCaptureMode = dom.htmlFullModeToggle.checked ? 'streamlined' : 'full';
  saveSetup();
});

// Step 2 — Token Optimise toggle
dom.tokenOptimiseToggle.addEventListener('change', () => {
  state.tokenOptimise = dom.tokenOptimiseToggle.checked;
  saveSetup();
});

// Step 2 — generate → render inline output and advance to Step 3
dom.btnGenerate.addEventListener('click', () => {
  renderOutput();
  goToStep(3);
});

// Step 3 — copy prompt (HTML is now embedded in the prompt body)
dom.btnCopyHtmlOutput.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(dom.outputPromptTextarea.value);
    dom.copyHtmlOutputLabel.textContent = 'Copied!';
    dom.btnCopyHtmlOutput.classList.add('done');
  } catch (_) {
    dom.outputPromptTextarea.select();
    dom.copyHtmlOutputLabel.textContent = 'Failed — copy manually';
  }

  setTimeout(() => {
    dom.copyHtmlOutputLabel.textContent = 'Copy Prompt + HTML';
    dom.btnCopyHtmlOutput.classList.remove('done');
  }, 2500);
});

// Step 3 — back to capture
dom.btnBackFromOutput.addEventListener('click', () => goToStep(2));

// ─── RESET ────────────────────────────────────────────────────────────────────

function doFullReset() {
  state.checkType        = 'acceptance_criteria';
  state.acItems          = [''];
  state.acNotes          = '';
  state.checkDescription = '';
  state.screenshot1      = null;
  state.screenshot2      = null;
  state.html1            = null;
  state.html2            = null;
  state.htmlCaptureMode1 = null;
  state.htmlCaptureMode2 = null;
  state.captureMode      = 'comparison';
  state.capturing        = false;
  state.capturingSlot    = null;
  state.date             = new Date().toISOString().split('T')[0];

  try { localStorage.removeItem(SETUP_KEY); } catch (_) {}

  dom.checkTypeRadios.forEach(r => { r.checked = r.value === 'acceptance_criteria'; });
  dom.acNotes.value          = '';
  dom.checkDescription.value = '';
  onCheckTypeChange();

  dom.singleModeToggle.checked   = false;
  dom.htmlFullModeToggle.checked = true;
  state.htmlCaptureMode = 'streamlined';
  dom.tokenOptimiseToggle.checked = true;
  state.tokenOptimise = true;
  dom.comparisonSlots.classList.remove('hidden');
  dom.singleSlot.classList.add('hidden');
  resetSlotPreview(dom.slot1Preview,       'No screenshot yet');
  resetSlotPreview(dom.slot1singlePreview, 'No screenshot yet');
  dom.slot1.classList.remove('captured');
  dom.slot2.classList.remove('captured');
  hideError();
  updateSlotLabels(); // also resets slot2Preview with correct lock message

  goToStep(1);
  validateSetup();
  updateCaptureUI();
}

function confirmReset() {
  if (confirm('Reset all fields and start a new check?')) doFullReset();
}

// Step 1 — reset
dom.btnReset1.addEventListener('click', confirmReset);

// Step 2 — reset
dom.btnReset2.addEventListener('click', confirmReset);

// Step 3 — new check (full reset, no confirmation needed — already on output)
dom.btnNewCheck.addEventListener('click', doFullReset);

// Summary bar — collapse toggle (event delegation, re-rendered on each step transition)
dom.summaryBar.addEventListener('click', e => {
  const header = e.target.closest('.collapse-header');
  if (!header) return;
  const body = header.nextElementSibling;
  if (!body) return;
  const isNowCollapsed = body.classList.toggle('collapsed');
  header.querySelector('.collapse-chevron').classList.toggle('chevron-up', !isNowCollapsed);
});

// Step 3 output summary — collapse toggle
dom.outputSummaryHeader.addEventListener('click', () => {
  const isNowCollapsed = dom.outputSummaryBody.classList.toggle('collapsed');
  dom.outputSummaryChevron.classList.toggle('chevron-up', !isNowCollapsed);
});

// Step 3 prompt — collapse toggle
dom.outputPromptHeader.addEventListener('click', () => {
  const isNowCollapsed = dom.outputPromptBody.classList.toggle('collapsed');
  dom.outputPromptChevron.classList.toggle('chevron-up', !isNowCollapsed);
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  // Always start at Step 1, but pre-fill fields from the last session.
  // restoreSetup() calls onCheckTypeChange() which calls renderAcItems().
  // If nothing was saved, onCheckTypeChange() still renders the default AC section.
  const restored = restoreSetup();
  if (!restored) onCheckTypeChange(); // render default AC section on first run
  goToStep(1);
  validateSetup();
  updateCaptureUI();
}

init();
