/**
 * Creates a controller for the on-screen debug overlay HUD.
 * @param {Object} deps
 * @param {Window} deps.windowRef
 * @param {Document} deps.documentRef
 * @param {() => any} deps.getSelectedTileInfo
 * @param {() => { q: number, r: number } | null | undefined} deps.getLastHexCoords
 * @param {() => string} deps.getActiveTab
 * @param {() => string} deps.getSearchQuery
 * @param {() => string | null | undefined} deps.getAnalyticsSummary
 * @param {() => number} deps.getPlacedTileCount
 * @param {() => number} deps.getUndoCount
 * @param {() => number} deps.getRedoCount
 * @param {() => string} deps.getPlacementMode
 * @param {() => number} deps.getCurrentYLevel
 * @returns {{
 *  toggleDebugOverlay: (forceState?: boolean) => void,
 *  updateDebugOverlayContent: () => void,
 *  isDebugOverlayVisible: () => boolean
 * }}
 */
export function createDebugOverlayController(deps) {
  const {
    windowRef,
    documentRef,
    getSelectedTileInfo,
    getLastHexCoords,
    getActiveTab,
    getSearchQuery,
    getAnalyticsSummary,
    getPlacedTileCount,
    getUndoCount,
    getRedoCount,
    getPlacementMode,
    getCurrentYLevel
  } = deps;

  let debugOverlay = null;
  let debugOverlayVisible = false;
  let debugOverlayUpdateTimer = null;

  function ensureDebugOverlay() {
    if (debugOverlay) return debugOverlay;
    if (!documentRef) return null;

    const styleId = 'lorescape-debug-overlay-style';
    if (!documentRef.getElementById(styleId)) {
      const style = documentRef.createElement('style');
      style.id = styleId;
      style.textContent = `
        .debug-overlay {
          position: fixed;
          top: 88px;
          right: 24px;
          min-width: 280px;
          max-width: 340px;
          z-index: 9999;
          background: rgba(17, 24, 39, 0.92);
          color: #f9fafb;
          border-radius: 10px;
          box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(8px);
          font-family: 'Inter', 'Segoe UI', sans-serif;
          font-size: 13px;
          line-height: 1.5;
          display: none;
          flex-direction: column;
          border: 1px solid rgba(148, 163, 184, 0.3);
        }
        .debug-overlay__header {
          padding: 12px 16px 10px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          color: #38bdf8;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .debug-overlay__header .badge {
          background: rgba(56, 189, 248, 0.15);
          color: #e0f2fe;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
        }
        .debug-overlay__content {
          padding: 0 16px 14px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .debug-overlay__row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          padding-bottom: 6px;
        }
        .debug-overlay__row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .debug-overlay__label {
          font-size: 12px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .debug-overlay__value {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          color: #f8fafc;
        }
        .debug-overlay__footer {
          padding: 10px 16px 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 11px;
          color: #cbd5f5;
          letter-spacing: 0.02em;
        }
        .debug-overlay__footer span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .debug-overlay__footer i {
          color: #38bdf8;
        }
      `;
      documentRef.head.appendChild(style);
    }

    const overlay = documentRef.createElement('div');
    overlay.className = 'debug-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="debug-overlay__header">
        <span><i class="fas fa-bug"></i> Debug HUD</span>
        <span class="badge">Ctrl+Alt+D</span>
      </div>
      <div class="debug-overlay__content"></div>
      <div class="debug-overlay__footer">
        <span><i class="fas fa-microchip"></i>Runtime</span>
        <span><i class="fas fa-vector-square"></i>Scene</span>
      </div>
    `;

    overlay.addEventListener('click', () => {
      const text = overlay.innerText;
      const navigatorRef = windowRef?.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
      navigatorRef?.clipboard?.writeText(text).catch(() => {});
    });

    documentRef.body?.appendChild(overlay);
    debugOverlay = overlay;
    return overlay;
  }

  function getDebugOverlayRows() {
    const selectedTileInfo = getSelectedTileInfo?.();
    const selectedName = selectedTileInfo?.name || selectedTileInfo?.biomeId || 'None';
    const selectedTileDetails = selectedTileInfo
      ? `${selectedTileInfo.biomeId || '—'} · #${selectedTileInfo.tileNumber ?? '—'}`
      : '—';

    const coords = getLastHexCoords?.();
    const lastCoordsString = coords && coords.q !== undefined && coords.r !== undefined
      ? `Q${coords.q} · R${coords.r}`
      : '—';

    const activeTabLabel = getActiveTab?.() || 'packs';
    const activeSearchQuery = getSearchQuery?.() ?? '';
    const analyticsSummary = getAnalyticsSummary?.() ?? null;

    return [
      { label: 'Placed tiles', value: getPlacedTileCount?.() ?? 0 },
      { label: 'Undo / Redo', value: `${getUndoCount?.() ?? 0} / ${getRedoCount?.() ?? 0}` },
      { label: 'Placement mode', value: getPlacementMode?.() === 'limited' ? 'Limited' : 'Free' },
      { label: 'Active tab', value: activeTabLabel },
      { label: 'Selected tile', value: selectedName },
      { label: 'Tile details', value: selectedTileDetails },
      { label: 'Last hex focus', value: lastCoordsString },
      { label: 'Y level', value: getCurrentYLevel?.() ?? 0 },
      { label: 'Search query', value: activeSearchQuery ? activeSearchQuery : '—' },
      analyticsSummary ? { label: 'Analytics', value: analyticsSummary } : null
    ].filter(Boolean);
  }

  function updateDebugOverlayContent() {
    if (!debugOverlayVisible) return;
    const overlay = ensureDebugOverlay();
    if (!overlay) return;

    const content = overlay.querySelector('.debug-overlay__content');
    if (!content) return;

    const rows = getDebugOverlayRows();
    content.innerHTML = rows
      .map(({ label, value }) => `
        <div class="debug-overlay__row">
          <div class="debug-overlay__label">${label}</div>
          <div class="debug-overlay__value">${value}</div>
        </div>
      `)
      .join('');
  }

  function toggleDebugOverlay(forceState) {
    const overlay = ensureDebugOverlay();
    if (!overlay) return;

    const nextState = typeof forceState === 'boolean' ? forceState : !debugOverlayVisible;
    debugOverlayVisible = nextState;

    if (debugOverlayVisible) {
      overlay.style.display = 'flex';
      updateDebugOverlayContent();
      if (debugOverlayUpdateTimer) {
        (windowRef ?? window)?.clearInterval?.(debugOverlayUpdateTimer);
      }
      debugOverlayUpdateTimer = (windowRef ?? window)?.setInterval?.(updateDebugOverlayContent, 750) ?? null;
    } else {
      overlay.style.display = 'none';
      if (debugOverlayUpdateTimer) {
        (windowRef ?? window)?.clearInterval?.(debugOverlayUpdateTimer);
        debugOverlayUpdateTimer = null;
      }
    }
  }

  return {
    toggleDebugOverlay,
    updateDebugOverlayContent,
    isDebugOverlayVisible: () => debugOverlayVisible
  };
}

export default createDebugOverlayController;
