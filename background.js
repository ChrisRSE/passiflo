// background.js
// QA Comparison Extension — Service Worker
//
// Responsibilities:
//   1. Open the side panel when the extension icon is clicked.
//   2. Capture the visible tab on demand (called by popup.js via message).
//      captureVisibleTab() must be called from the service worker, not the panel page.
//      When called with windowId = null, Chrome/Edge targets the current window's active
//      tab — the page the tester has open, not the side panel itself.
//   3. Execute a script on the active tab to read document.documentElement.outerHTML.
//      Requires the "scripting" permission in manifest.json.

// Open the side panel when the user clicks the extension icon.
// The setting persists across service worker restarts.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(err => console.warn('sidePanel.setPanelBehavior:', err));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'captureTabWithHtml') {
    // message.htmlMode: 'streamlined' (default) | 'full'
    // Capture screenshot and DOM HTML simultaneously. Promise.allSettled ensures a
    // scripting failure (e.g. chrome:// page, PDF viewer) does not block the screenshot.
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      return Promise.allSettled([
        chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }),
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          // func runs in page context and has full DOM access.
          // mode='streamlined': targets <main> (with fallback to [role="main"] then <body>), strips scripts/styles/classes/data-attrs/srcset.
          // mode='full': captures complete document, strips only <script> tags.
          func: (mode, tokenOptimise) => {
            // ── Token Optimise helper — applied after main stripping ───────────
            // Removes decorative SVGs, duplicate screen reader spans, and image
            // format alternatives. Post-processing step, mode-independent.
            function applyTokenOptimise(node) {
              node.querySelectorAll('svg').forEach(el => el.remove());
              node.querySelectorAll('span[aria-hidden="true"]').forEach(el => el.remove());
              node.querySelectorAll('source').forEach(el => el.remove());
            }

            if (mode === 'full') {
              const clone = document.documentElement.cloneNode(true);
              clone.querySelectorAll('script').forEach(el => el.remove());
              if (tokenOptimise) applyTokenOptimise(clone);
              return clone.outerHTML;
            }

            // ── Phase 1: Root selection with annotated fallback chain ─────────
            let rootEl, rootSelector;
            if (document.querySelector('main')) {
              rootEl = document.querySelector('main');
              rootSelector = 'main';
            } else if (document.querySelector('[role="main"]')) {
              rootEl = document.querySelector('[role="main"]');
              rootSelector = '[role="main"]';
            } else {
              rootEl = document.body;
              rootSelector = 'body';
            }

            // ── Phase 2: Stripping helper — applied to every captured region ──
            function stripNode(clone) {
              clone.querySelectorAll('script, style').forEach(el => el.remove());
              clone.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'));
              clone.querySelectorAll('img').forEach(img => {
                const alt = img.getAttribute('alt') || '';
                const src = img.getAttribute('src') || '';
                while (img.attributes.length > 0) img.removeAttribute(img.attributes[0].name);
                if (src) img.setAttribute('src', src);
                if (alt) img.setAttribute('alt', alt);
              });
              clone.querySelectorAll('*').forEach(el => {
                [...el.attributes].forEach(attr => {
                  if (attr.name.startsWith('data-') ||
                      attr.name === 'srcset' ||
                      attr.name === 'sizes') {
                    el.removeAttribute(attr.name);
                  }
                });
              });
              return clone;
            }

            // ── Phase 3: Capture root region ──────────────────────────────────
            const parts = [];
            const capturedEls = [rootEl]; // track originals for dedup

            const fallbackNote = rootSelector !== 'main'
              ? ` (fallback — no <main> found, captured <${rootSelector}>)`
              : '';
            parts.push(`<!-- region: ${rootSelector}${fallbackNote} -->`);
            const rootClone = stripNode(rootEl.cloneNode(true));
            if (tokenOptimise) applyTokenOptimise(rootClone);
            parts.push(rootClone.outerHTML);
            parts.push(`<!-- end region: ${rootSelector} -->`);

            // ── Phase 4: Additional out-of-main regions ────────────────────────
            // Each selector targets a meaningful structural or interactive region.
            // Elements already inside the captured root are skipped via dedup.
            const regionSelectors = [
              { sel: 'header',                    label: 'header' },
              { sel: 'nav',                       label: 'nav' },
              { sel: '[role="banner"]',           label: 'banner' },
              { sel: '[role="navigation"]',       label: 'navigation' },
              { sel: '[role="dialog"]',           label: 'dialog' },
              { sel: '[role="alertdialog"]',      label: 'alertdialog' },
              { sel: 'dialog',                    label: 'dialog (native)' },
              { sel: '[aria-modal="true"]',       label: 'modal' },
              { sel: '[role="alert"]',            label: 'alert' },
              { sel: '[aria-label*="sign in" i]', label: 'sign-in' },
              { sel: '[aria-label*="log in" i]',  label: 'log-in' },
              { sel: '[aria-label*="sign up" i]', label: 'sign-up' },
              { sel: '[aria-label*="cookie" i]',  label: 'cookie-banner' },
            ];

            for (const { sel, label } of regionSelectors) {
              let candidates;
              try {
                candidates = [...document.querySelectorAll(sel)];
              } catch (_) {
                continue; // selector unsupported in this browser — skip silently
              }

              for (const el of candidates) {
                // Skip if this element is the same as or inside an already-captured element.
                if (capturedEls.some(c => c === el || c.contains(el))) continue;

                capturedEls.push(el);
                const regionClone = stripNode(el.cloneNode(true));
                if (tokenOptimise) applyTokenOptimise(regionClone);

                // Include aria-label or id in the comment so Copilot can identify the region.
                const ariaLabel = el.getAttribute('aria-label');
                const id        = el.getAttribute('id');
                const detail    = ariaLabel ? ` "${ariaLabel}"` : (id ? ` #${id}` : '');
                parts.push(`<!-- region: ${label}${detail} -->`);
                parts.push(regionClone.outerHTML);
                parts.push(`<!-- end region: ${label} -->`);
              }
            }

            return parts.join('\n\n');
          },
          args: [message.htmlMode || 'streamlined', !!message.tokenOptimise],
        }),
      ]);
    }).then(([screenshotResult, scriptResult]) => {
      const dataUrl = screenshotResult.status === 'fulfilled' ? screenshotResult.value : null;
      const html    = scriptResult.status === 'fulfilled'
        ? (scriptResult.value?.[0]?.result ?? null)
        : null;

      if (!dataUrl) {
        sendResponse({ success: false, error: screenshotResult.reason?.message ?? 'Capture failed' });
      } else {
        sendResponse({ success: true, dataUrl, html });
      }
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });

    // Return true to keep the message channel open for the async sendResponse.
    return true;
  }

});
