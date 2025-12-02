import { showNotification } from '../../ui/notifications.js';

const FALLBACK_PRIMARY_BAND = 'rgba(56, 171, 25, 0.14)';
const FALLBACK_SECONDARY_BAND = 'rgba(116, 201, 87, 0.12)';

function parseColorToRgb(colorValue) {
  if (!colorValue || typeof colorValue !== 'string') {
    return null;
  }

  const value = colorValue.trim();
  if (!value) {
    return null;
  }

  const hexMatch = value.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    }
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter((num) => Number.isFinite(num));
    if (parts.length >= 3) {
      return {
        r: Math.round(parts[0]),
        g: Math.round(parts[1]),
        b: Math.round(parts[2]),
      };
    }
  }

  return null;
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lightenRgb(rgb, factor) {
  if (!rgb) return null;
  const amount = Math.max(0, Math.min(1, factor));
  return {
    r: clampColorChannel(rgb.r + (255 - rgb.r) * amount),
    g: clampColorChannel(rgb.g + (255 - rgb.g) * amount),
    b: clampColorChannel(rgb.b + (255 - rgb.b) * amount),
  };
}

function rgbaFromRgb(rgb, alpha, fallback) {
  if (!rgb) {
    return fallback;
  }
  return `rgba(${clampColorChannel(rgb.r)}, ${clampColorChannel(rgb.g)}, ${clampColorChannel(rgb.b)}, ${alpha})`;
}

export function createInstructionsRenderer({ instructionsLog, biomeSets, placedTiles }) {
  async function generateLayerInstructions(analysis) {
    const instructionsWindow = createInstructionsWindow();
    const { container, interactiveRoot, printRoot, triggerPrint, setBeforePrint, setAfterPrint } = instructionsWindow;

    instructionsWindow.setLoadingState?.(
      true,
      'Preparing build instructions...',
      'Large maps may take a few seconds to process.'
    );

    // Header with title, stats and close button
    const header = document.createElement('div');
    header.className = 'instr-header';
    
    const titleRow = document.createElement('div');
    titleRow.className = 'instr-title-row';
    titleRow.innerHTML = `
      <h2 class="instr-title"><i class="fas fa-map"></i> Map Build Instructions</h2>
      <div class="instr-header-actions">
        <button class="btn-icon" id="instr-close" title="Close instructions (ESC)" aria-label="Close instructions">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    
    const statsRow = document.createElement('div');
    statsRow.className = 'instr-stats';
    statsRow.innerHTML = `
      <div class="instr-stat-item">
        <i class="fas fa-border-all"></i>
        <span class="label">Map Size:</span>
        <span class="value">${analysis.mapWidth}×${analysis.mapHeight}</span>
      </div>
      <div class="instr-stat-separator"></div>
      <div class="instr-stat-item">
        <i class="fas fa-layer-group"></i>
        <span class="label">Layers:</span>
        <span class="value">${analysis.layers.length}</span>
      </div>
      <div class="instr-stat-separator"></div>
      <div class="instr-stat-item">
        <i class="fas fa-puzzle-piece"></i>
        <span class="label">Total Tiles:</span>
        <span class="value">${placedTiles.size}</span>
      </div>
    `;
    
    header.appendChild(titleRow);
    header.appendChild(statsRow);
    interactiveRoot.appendChild(header);

    const globalView = { simple: true, showAxes: true, showTextures: true, showLabels: false };
    const printSettings = { includeDetails: false, scale: 'fit' };
    let printLayout;
    const rerenders = [];
    const addRerender = (fn) => { if (typeof fn === 'function') rerenders.push(fn); };
    const rerenderAll = () => rerenders.forEach(fn => fn());

    // Sticky toolbar with view options and export actions
    const viewToolbar = document.createElement('div');
    viewToolbar.className = 'instr-toolbar sticky';
    const ensureContainerState = () => {
      const hideDetails = !printSettings.includeDetails;
      instructionsWindow.container.classList.toggle('hide-details', hideDetails);
      instructionsWindow.container.dataset.printScale = printSettings.scale;
      if (printLayout) {
        printLayout.setDetailsVisibility(!hideDetails);
      }
    };
    const applyPrintOrientation = () => {
      ensureContainerState();
      try {
        let styleEl = document.getElementById('instructions-print-orientation');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'instructions-print-orientation';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = '@media print{@page{size:A4 landscape;}}';
      } catch (error) {
        instructionsLog.warn('Failed to apply print orientation preference', error);
      }
    };

    ensureContainerState();
    applyPrintOrientation();

    printLayout = createPrintLayout(printRoot, analysis, {
      includeDetails: printSettings.includeDetails,
      scale: printSettings.scale,
      totalTiles: placedTiles.size,
      log: instructionsLog
    });

    setBeforePrint(() => {
      ensureContainerState();
      applyPrintOrientation();
      container.classList.add('printing');
      try {
        printLayout?.refreshAll();
        printLayout?.prepareForPrint?.();
      } catch (error) {
        instructionsLog?.warn?.('Failed to refresh print layout before printing', error);
      }
    });

    setAfterPrint(() => {
      container.classList.remove('printing');
      ensureContainerState();
      adjustModalWidthGrowOnly();
    });

    const adjustModalWidthGrowOnly = () => {
      ensureContainerState();
      requestAnimationFrame(() => {
        try {
          const frames = container.querySelectorAll('.axis-frame');
          let maxW = 0;
          frames.forEach(f => { maxW = Math.max(maxW, f.offsetWidth || 0); });
          if (maxW > 0) {
            const padding = 48;
            const cap = window.innerWidth * 0.9;
            const desired = Math.min(cap, maxW + padding);
            const prev = parseFloat(container.style.width) || 0;
            const next = Math.min(cap, Math.max(prev, desired));
            container.style.width = next + 'px';
          }
        } catch (error) {
          instructionsLog.warn('Failed to adjust modal width', error);
        }
      });
    };
    const mkToggle = ({ label, key, hint, icon, initial, getChecked, onChange, rerender = true, adjustWidth = true }) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'view-toggle';
      if (hint) {
        wrapper.title = hint;
      }

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'view-toggle-input';
      const resolveChecked = () => {
        if (typeof getChecked === 'function') {
          return !!getChecked();
        }
        if (typeof initial !== 'undefined') {
          return !!initial;
        }
        if (typeof key === 'string' && key in globalView) {
          return !!globalView[key];
        }
        return false;
      };

      input.checked = resolveChecked();
      input.setAttribute('aria-label', label);

      const toggleVisual = document.createElement('span');
      toggleVisual.className = 'view-toggle-switch';

      const iconEl = document.createElement('i');
      iconEl.className = `view-toggle-icon ${icon}`;

      const labelEl = document.createElement('span');
      labelEl.className = 'view-toggle-label';
      labelEl.textContent = label;

      const sync = () => {
        wrapper.classList.toggle('is-active', input.checked);
      };
      sync();

      input.addEventListener('change', () => {
        if (typeof key === 'string' && typeof getChecked !== 'function' && key) {
          globalView[key] = input.checked;
        }
        sync();
        if (typeof onChange === 'function') {
          onChange(input.checked);
        }
        if (rerender) {
          rerenderAll();
        }
        if (rerender || adjustWidth) {
          adjustModalWidthGrowOnly();
        }
      });

      wrapper.append(input, iconEl, labelEl, toggleVisual);
      return wrapper;
    };
    // View Options Section
    const viewSection = document.createElement('div');
    viewSection.className = 'instr-toolbar-section view-options';
    
    const viewTitle = document.createElement('div');
    viewTitle.className = 'section-title';
    viewTitle.innerHTML = '<i class="fas fa-eye"></i> View Options';
    
    const togglesContainer = document.createElement('div');
    togglesContainer.className = 'view-toggles';
    const toggles = [
      { key: 'simple', label: 'Simple view', icon: 'fas fa-eye-slash', hint: 'Reduce shading overlays for a clean, flat layout.' },
      { key: 'showAxes', label: 'Show axes', icon: 'fas fa-arrows-alt', hint: 'Display Q/R axis guides around the map.' },
      { key: 'showTextures', label: 'Show textures', icon: 'fas fa-image', hint: 'Render tile textures instead of solid fills.' },
      { key: 'showLabels', label: 'Show labels', icon: 'fas fa-tags', hint: 'Display tile identifiers on the layer.' }
    ].map(mkToggle);
    togglesContainer.append(...toggles);
    viewSection.appendChild(viewTitle);
    viewSection.appendChild(togglesContainer);
    
    // Export Actions Section
    const exportSection = document.createElement('div');
    exportSection.className = 'instr-toolbar-section export-actions';
    
    const exportTitle = document.createElement('div');
    exportTitle.className = 'section-title';
    exportTitle.innerHTML = '<i class="fas fa-download"></i> Export';
    
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'export-buttons';

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'btn btn-primary btn-compact';
    printBtn.title = 'Print or save as PDF (Ctrl+P)';
    printBtn.setAttribute('aria-label', 'Print or save as PDF');
    const printIcon = document.createElement('i');
    printIcon.className = 'fas fa-print';
    printIcon.setAttribute('aria-hidden', 'true');
    const printText = document.createElement('span');
    printText.textContent = 'Print / PDF';
    printBtn.append(printIcon, printText);
    printBtn.addEventListener('click', (event) => {
      event.preventDefault();
      triggerPrint();
    });

    const saveAllBtn = document.createElement('button');
    saveAllBtn.type = 'button';
    saveAllBtn.className = 'btn btn-secondary btn-compact';
    saveAllBtn.title = 'Download all layer images as PNG (Ctrl+S)';
    saveAllBtn.setAttribute('aria-label', 'Download all layer images');
    const saveIcon = document.createElement('i');
    saveIcon.className = 'fas fa-images';
    saveIcon.setAttribute('aria-hidden', 'true');
    const saveText = document.createElement('span');
    saveText.textContent = 'Save All PNG';
    saveAllBtn.append(saveIcon, saveText);
    saveAllBtn.addEventListener('click', (event) => {
      event.preventDefault();
      window.downloadAllLayerImages?.();
    });

    actionsContainer.append(printBtn, saveAllBtn);
    exportSection.appendChild(exportTitle);
    exportSection.appendChild(actionsContainer);

    const printSection = document.createElement('div');
    printSection.className = 'instr-toolbar-section print-options';

    const printTitle = document.createElement('div');
    printTitle.className = 'section-title';
    printTitle.innerHTML = '<i class="fas fa-print"></i> Print Prep';

    const printControls = document.createElement('div');
    printControls.className = 'print-controls';

    const scaleLabel = document.createElement('span');
    scaleLabel.className = 'print-scale-heading';
    scaleLabel.innerHTML = '<i class="fas fa-compress-arrows-alt" aria-hidden="true"></i> Scale';

    const scaleOptions = document.createElement('div');
    scaleOptions.className = 'print-scale-options';
    const makeScaleOption = (value, label, description) => {
      const optionEl = document.createElement('label');
      optionEl.className = 'print-scale-option';
      optionEl.title = description;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'print-scale';
      input.value = value;
      input.checked = printSettings.scale === value;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        printSettings.scale = value;
        ensureContainerState();
        if (printLayout) {
          printLayout.setScale(value);
          printLayout.refreshAll();
        }
        adjustModalWidthGrowOnly();
      });

      const text = document.createElement('span');
      text.className = 'print-scale-label';
      text.textContent = label;

      optionEl.append(input, text);
      return optionEl;
    };

    const fitOption = makeScaleOption('fit', 'Fit to Page', 'Automatically scale each layer to fill the printable area.');
    const originalOption = makeScaleOption('original', 'Original Tile Size', 'Keep each tile at native size, splitting large layers across multiple pages.');
    scaleOptions.append(fitOption, originalOption);

    const includeDetailsToggle = mkToggle({
      label: 'Include tile list',
      icon: 'fas fa-list',
      hint: 'Show per-layer coordinate list (affects print).',
      initial: printSettings.includeDetails,
      rerender: false,
      adjustWidth: false,
      onChange: (checked) => {
        printSettings.includeDetails = checked;
        ensureContainerState();
        if (!checked) {
          instructionsWindow.container.querySelectorAll('.tiles-accordion, .biome-accordion').forEach((detailsEl) => {
            detailsEl.open = false;
          });
        } else {
          instructionsWindow.container.querySelectorAll('.tiles-accordion').forEach((detailsEl) => {
            detailsEl.open = true;
          });
        }
        printLayout?.refreshAll?.();
        adjustModalWidthGrowOnly();
      }
    });

    printControls.append(scaleLabel, scaleOptions, includeDetailsToggle);
    printSection.append(printTitle, printControls);
    
    viewToolbar.appendChild(viewSection);
    viewToolbar.appendChild(printSection);
    viewToolbar.appendChild(exportSection);

    interactiveRoot.appendChild(viewToolbar);
    
    // Layers container
    try {
      const layersContainer = document.createElement('div');
      layersContainer.className = 'instr-layers-container';

      for (let i = 0; i < analysis.layers.length; i++) {
        const yLevel = analysis.layers[i];
        const layerTiles = analysis.layerData.get(yLevel);
        instructionsLog.log(`🎨 Rendering layer ${yLevel} with ${layerTiles.length} tiles...`);
        instructionsWindow.updateLoadingMessage?.(
          `Rendering layer ${i + 1} of ${analysis.layers.length}...`
        );
        const layerElement = await createLayerVisualization(yLevel, layerTiles, analysis, i + 1, globalView, addRerender, printLayout);
        layersContainer.appendChild(layerElement);
      }

      instructionsWindow.updateLoadingMessage?.('Finalizing layout...');
      interactiveRoot.appendChild(layersContainer);

      requestAnimationFrame(() => {
        try {
          const frames = container.querySelectorAll('.axis-frame');
          let maxW = 0;
          frames.forEach(f => { maxW = Math.max(maxW, f.offsetWidth || 0); });
          if (maxW > 0) {
            const padding = 48;
            const cap = window.innerWidth * 0.9;
            const desired = Math.min(cap, maxW + padding);
            const prev = parseFloat(container.style.width) || 0;
            const next = Math.min(cap, Math.max(prev, desired));
            container.style.width = next + 'px';
          }
        } catch (error) {
          instructionsLog.warn('Instructions modal resize failed', error);
        } finally {
          instructionsWindow.setLoadingState?.(false);
        }
      });
    } catch (error) {
      instructionsLog.error('Failed to generate build instructions', error);
      instructionsWindow.updateLoadingMessage?.('Unable to generate instructions.', 'Please try again.');
      instructionsWindow.setLoadingState?.(false);
      showNotification({
        type: 'error',
        title: 'Instructions generation failed',
        message: 'Something went wrong while generating the build instructions. Please try again.',
        duration: 6000
      });
      return;
    }

    // Setup keyboard shortcuts
    instructionsWindow.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(instructionsWindow.overlay);
      } else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        triggerPrint();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        window.downloadAllLayerImages?.();
      } else if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        const allDetails = container.querySelectorAll('details');
        const anyOpen = Array.from(allDetails).some(d => d.open);
        allDetails.forEach(d => { d.open = !anyOpen; });
      }
    });
    
    // Close button functionality
    const closeBtn = header.querySelector('#instr-close');
    closeBtn?.addEventListener('click', () => {
      if (window.closeInstructions) {
        window.closeInstructions();
      }
    });

    instructionsLog.log('✅ Build instructions generated!');
  }

  async function createLayerVisualization(yLevel, tiles, analysis, layerNumber, globalView, registerRerender, printLayout) {
    const layerDiv = document.createElement('div');
    layerDiv.className = 'instr-layer';
    layerDiv.dataset.layerNumber = String(layerNumber);

    const layerHeader = document.createElement('div');
    layerHeader.className = 'instr-layer-header';
    
    const headerLeft = document.createElement('div');
    headerLeft.className = 'layer-title-group';
    headerLeft.innerHTML = `
      <h3 class="layer-title">
        <i class="fas fa-layer-group"></i>
        <span class="layer-name">Layer ${layerNumber}</span>
        <span class="layer-level">${yLevel === 0 ? '(Ground Level)' : `(+${yLevel})`}</span>
      </h3>
      <div class="layer-info">
        <span class="tile-count"><i class="fas fa-puzzle-piece"></i> ${tiles.length} tiles</span>
      </div>
    `;
    
    const headerActions = document.createElement('div');
    headerActions.className = 'layer-actions';
    headerActions.innerHTML = `
      <button type="button" class="btn btn-icon layer-save" data-layer="${layerNumber}" title="Save this layer as PNG">
        <i class="fas fa-download"></i>
      </button>
    `;
    
    layerHeader.appendChild(headerLeft);
    layerHeader.appendChild(headerActions);
    layerDiv.appendChild(layerHeader);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'instr-canvas-wrap';

    const canvas = document.createElement('canvas');
    canvas.className = 'layer-canvas';

    const hexSize = 30;
    const hexWidth = hexSize * 2;
    const hexHeight = hexSize * Math.sqrt(3);
    const margin = hexSize * 0.25;
    const paddingHexes = 2;

    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;

    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });

    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexHeight;

    const canvasWidth = (maxPixelX - minPixelX) + hexWidth + (hexPaddingX * 2) + (margin * 2);
    const canvasHeight = (maxPixelY - minPixelY) + hexHeight + (hexPaddingY * 2) + (margin * 2);

    canvas.width = Math.ceil(canvasWidth);
    canvas.height = Math.ceil(canvasHeight);
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    try {
      const root = getComputedStyle(document.body);
      const borderColor = (root.getPropertyValue('--border-color') || '#333').trim() || '#333';
      canvas.style.border = `2px solid ${borderColor}`;
      canvas.style.backgroundColor = '#f8f8f8';
    } catch {
      canvas.style.border = '2px solid #333';
      canvas.style.backgroundColor = '#f8f8f8';
    }

    instructionsLog.log(`Canvas dimensions: ${canvas.width}x${canvas.height} for GLOBAL bounds Q:${analysis.bounds.minQ}-${analysis.bounds.maxQ}, R:${analysis.bounds.minR}-${analysis.bounds.maxR} (Layer ${yLevel}: ${tiles.length} tiles)`);
    instructionsLog.log(`🎯 Using GLOBAL positioning: minPixelX=${minPixelX.toFixed(1)}, minPixelY=${minPixelY.toFixed(1)} - ALL LAYERS CENTERED TO SAME POINT`);

    const ctx = canvas.getContext('2d');

    canvasWrap.style.width = `${canvas.width}px`;
    canvasWrap.style.height = `${canvas.height}px`;
    canvasWrap.appendChild(canvas);

    const axisFrame = document.createElement('div');
    axisFrame.className = 'axis-frame';
    const leftAxis = document.createElement('div');
    leftAxis.className = 'axis-left';
    const bottomAxis = document.createElement('div');
    bottomAxis.className = 'axis-bottom';
    axisFrame.appendChild(leftAxis);
    axisFrame.appendChild(canvasWrap);
    axisFrame.appendChild(bottomAxis);

    const saveImgBtn = layerHeader.querySelector('.layer-save');
    saveImgBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const nameEl = document.getElementById('map-name-input-toolbar');
        const mapName = (nameEl?.value || 'map').trim().replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
        const fileName = `${mapName || 'map'}_layer-${layerNumber}.png`;
        if (canvas.toBlob) {
          canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          }, 'image/png');
        } else {
          const dataUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
        }
      } catch (err) {
        console.error('Failed to save layer image:', err);
        showNotification({
          type: 'error',
          title: 'Failed to save image',
          message: 'Could not save the layer image. Please try again.',
          duration: 5000
        });
      }
    });

    const adjustContainerWidth = () => {
      const container = layerDiv.closest('.instructions-container');
      if (!container) return;
      requestAnimationFrame(() => {
        const frames = container.querySelectorAll('.axis-frame');
        let maxW = 0;
        frames.forEach(f => { maxW = Math.max(maxW, f.offsetWidth || 0); });
        if (maxW > 0) {
          const padding = 48;
          const cap = window.innerWidth * 0.9;
          const desired = Math.min(cap, maxW + padding);
          const prev = parseFloat(container.style.width) || 0;
          const next = Math.min(cap, Math.max(prev, desired));
          container.style.width = next + 'px';
        }
      });
    };

    if (printLayout) {
      printLayout.registerLayer({
        layerNumber,
        elevation: yLevel,
        tileCount: tiles.length,
        tiles,
        canvas
      });
    }

    async function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.__drawBands = !globalView.simple;
      ctx.__showRef = false;
      ctx.__showLabels = !!globalView.showLabels;
      await drawHexagonalGrid(ctx, analysis, hexSize, margin);

      if (yLevel !== 0) {
        await drawLowerLayerShadows(ctx, analysis, yLevel, hexSize, margin);
      }

      if (globalView.showTextures) {
        await drawHexLayerTiles(ctx, tiles, analysis, hexSize, margin);
      } else {
        await drawSimpleLayerTiles(ctx, tiles, analysis, hexSize, margin);
      }

      leftAxis.innerHTML = '';
      bottomAxis.innerHTML = '';
      if (globalView.showAxes) {
        const b = analysis.bounds || computeBoundsFromTiles(tiles);
        const rMin = document.createElement('div'); rMin.className = 'axis-label r'; rMin.textContent = `R:${b.minR}`;
        const rMax = document.createElement('div'); rMax.className = 'axis-label r'; rMax.textContent = `R:${b.maxR}`;
        leftAxis.append(rMin, rMax);
        const qMin = document.createElement('div'); qMin.className = 'axis-label q'; qMin.textContent = `Q:${b.minQ}`;
        const qMax = document.createElement('div'); qMax.className = 'axis-label q'; qMax.textContent = `Q:${b.maxQ}`;
        bottomAxis.append(qMin, qMax);
        drawAxisArrows(ctx, analysis, hexSize, margin);
      }

      adjustContainerWidth();
      if (printLayout) {
        printLayout.refreshLayer(layerNumber);
      }
    }

    await render();
    registerRerender && registerRerender(render);

    // Tiles list (direct integration without outer wrapper)
    const figureWrapper = document.createElement('div');
    figureWrapper.className = 'instr-layer-figure';
    figureWrapper.appendChild(axisFrame);
    layerDiv.appendChild(figureWrapper);

    const tilesList = createTilesListForLayer(tiles, yLevel);
    const detailsWrapper = document.createElement('div');
    detailsWrapper.className = 'instr-layer-details';
    detailsWrapper.appendChild(tilesList);
    layerDiv.appendChild(detailsWrapper);

    return layerDiv;
  }

  function computeBoundsFromTiles(tiles) {
    if (!Array.isArray(tiles) || tiles.length === 0) {
      return {
        minQ: 0,
        maxQ: 0,
        minR: 0,
        maxR: 0
      };
    }

    let minQ = Number.POSITIVE_INFINITY;
    let maxQ = Number.NEGATIVE_INFINITY;
    let minR = Number.POSITIVE_INFINITY;
    let maxR = Number.NEGATIVE_INFINITY;

    tiles.forEach((tile) => {
      if (!tile) return;
      const { q = 0, r = 0 } = tile;
      minQ = Math.min(minQ, q);
      maxQ = Math.max(maxQ, q);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    });

    return { minQ, maxQ, minR, maxR };
  }

  function drawAxisArrows(ctx, analysis, hexSize, margin) {
    const cW = ctx.canvas.width;
    const cH = ctx.canvas.height;
    const inset = Math.max(12, Math.min(28, (margin || 0) + 10));
    const startX = Math.max(inset, 14);
    const startY = cH - Math.max(inset + 2, 20);

    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const baseLen = Math.max(26, Math.min(44, Math.min(cW, cH) * 0.085));
    const roomRight = (cW - inset) - startX;
    const roomUp = startY - inset;
    const roomDown = (cH - inset) - startY;
    const maxLenQ = Math.min(roomRight / cos, roomUp / sin);
    const maxLenR = Math.min(roomRight / cos, roomDown / sin);
    const pad = 6;
    const lenQ = Math.max(18, Math.min(baseLen, maxLenQ - pad));
    const lenR = Math.max(18, Math.min(baseLen, maxLenR - pad));
    const vQ = { x: cos * lenQ, y: -sin * lenQ };
    const vR = { x: cos * lenR, y:  sin * lenR };

    const drawArrow = (x1, y1, x2, y2, color, label) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
      ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const ah = 4.5;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah * Math.cos(angle - Math.PI / 6), y2 - ah * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - ah * Math.cos(angle + Math.PI / 6), y2 - ah * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x2 + 3, y2);
      ctx.restore();
    };

  drawArrow(startX, startY, startX + vQ.x, startY + vQ.y, '#38AB19', 'Q+');
  drawArrow(startX, startY, startX + vR.x, startY + vR.y, '#272727', 'R+');
  }

  async function drawHexagonalGrid(ctx, analysis, hexSize, margin) {
    instructionsLog.log('🔲 drawHexagonalGrid called - START');

    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;

    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });

    instructionsLog.log(`🎯 GRID: Using GLOBAL positioning: minPixelX=${minPixelX.toFixed(1)}, minPixelY=${minPixelY.toFixed(1)} - ALL LAYERS CENTERED TO SAME POINT`);

    let minQ = Infinity, maxQ = -Infinity;
    let minR = Infinity, maxR = -Infinity;

    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        minQ = Math.min(minQ, tile.q);
        maxQ = Math.max(maxQ, tile.q);
        minR = Math.min(minR, tile.r);
        maxR = Math.max(maxR, tile.r);
      });
    });

    instructionsLog.log(`📐 Content hex bounds: Q(${minQ} to ${maxQ}), R(${minR} to ${maxR})`);

    const hexBuffer = 4;
    const qRange = Math.max(Math.abs(minQ), Math.abs(maxQ)) + hexBuffer;
    const rRange = Math.max(Math.abs(minR), Math.abs(maxR)) + hexBuffer;

    instructionsLog.log(`🔲 Grid with buffer: q range ±${qRange}, r range ±${rRange} (buffer: ${hexBuffer} hexes)`);

    function drawHexagonOutline(context, centerX, centerY, size, strokeStyle = '#ddd', lineWidth = 1) {
      centerX = Math.round(centerX) + 0.5;
      centerY = Math.round(centerY) + 0.5;

      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = centerX + size * Math.cos(angle);
        const y = centerY + size * Math.sin(angle);
        if (i === 0) {
          context.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
        } else {
          context.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
        }
      }
      context.closePath();
      context.strokeStyle = strokeStyle;
      context.lineWidth = lineWidth;
      context.stroke();
    }

  const rootStyles = getComputedStyle(document.documentElement);
  const primarySource = rootStyles.getPropertyValue('--primary-color') || '#38ab19';
  const baseGreen = parseColorToRgb(primarySource) || { r: 56, g: 171, b: 25 };
  const softerGreen = lightenRgb(baseGreen, 0.35) || baseGreen;

  const bandQColor = rgbaFromRgb(baseGreen, 0.18, FALLBACK_PRIMARY_BAND);
  const bandRColor = rgbaFromRgb(softerGreen, 0.16, FALLBACK_SECONDARY_BAND);

    const drawHexSize = hexSize * 0.98;
    const paddingHexes = 2;
    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexSize * Math.sqrt(3);

    let gridHexCount = 0;
    const drawnPositions = new Set();

    for (let q = -qRange; q <= qRange; q++) {
      for (let r = -rRange; r <= rRange; r++) {
        if (Math.abs(q + r) > Math.max(qRange, rRange)) {
          continue;
        }

        const tilePixelX = hexSize * (3/2 * q);
        const tilePixelY = hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);

        const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
        const y = (tilePixelY - minPixelY) + hexPaddingY + margin;

        const centerX = x + hexSize;
        const centerY = y + hexSize;

        if (centerX > -hexSize && centerX < ctx.canvas.width + hexSize &&
            centerY > -hexSize && centerY < ctx.canvas.height + hexSize) {
          const positionKey = `${Math.round(centerX)},${Math.round(centerY)}`;
          if (drawnPositions.has(positionKey)) {
            console.warn(`🔄 DUPLICATE hex position detected: ${positionKey} (q:${q}, r:${r})`);
          } else {
            drawnPositions.add(positionKey);
          }

          if (ctx.__drawBands && Math.abs(q) % 2 === 0) {
            ctx.fillStyle = bandQColor;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i;
              const px = centerX + drawHexSize * Math.cos(angle);
              const py = centerY + drawHexSize * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }
          if (ctx.__drawBands && Math.abs(r) % 2 === 0) {
            ctx.fillStyle = bandRColor;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i;
              const px = centerX + drawHexSize * Math.cos(angle);
              const py = centerY + drawHexSize * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }

          drawHexagonOutline(ctx, centerX, centerY, drawHexSize, '#ddd', 0.8);
          gridHexCount++;

          if (ctx.__showRef && q % 5 === 0 && r % 5 === 0) {
            ctx.fillStyle = '#999';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${q},${r}`, centerX, centerY + 3);
          }
        }
      }
    }

    instructionsLog.log(`Grid drawing completed - drew ${gridHexCount} hexagons, unique positions: ${drawnPositions.size}`);
  }

  async function drawLowerLayerShadows(ctx, analysis, currentYLevel, hexSize, margin) {
    instructionsLog.log(`👤 Drawing shadows from layers below ${currentYLevel}`);

    if (currentYLevel === 0) {
      instructionsLog.log('👤 Ground level - no shadows to draw');
      return;
    }

    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;

    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });

    const paddingHexes = 2;
    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexSize * Math.sqrt(3);

    let shadowCount = 0;

    for (let layerY = 0; layerY < currentYLevel; layerY++) {
      const layerTiles = analysis.layerData.get(layerY);
      if (!layerTiles || layerTiles.length === 0) continue;

      const layerDistance = currentYLevel - layerY;
      const opacity = Math.max(0.1, 0.4 / layerDistance);

      instructionsLog.log(`👤 Drawing ${layerTiles.length} shadows from layer ${layerY} with opacity ${opacity.toFixed(2)}`);

      for (const tile of layerTiles) {
        const tilePixelX = hexSize * (3/2 * tile.q);
        const tilePixelY = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);

        const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
        const y = (tilePixelY - minPixelY) + hexPaddingY + margin;

        const centerX = x + hexSize;
        const centerY = y + hexSize;

        ctx.save();
        ctx.globalAlpha = opacity;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = centerX + (hexSize * 0.9) * Math.cos(angle);
          const py = centerY + (hexSize * 0.9) * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        ctx.fillStyle = '#E6E6E6';
        ctx.fill();

        ctx.strokeStyle = '#9a9a9a';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([3, 3]);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = '#5b5b5b';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 1;
        try {
          let displayNum = 1;
          if (Array.isArray(analysis.layers)) {
            const idx = analysis.layers.indexOf(layerY);
            displayNum = idx >= 0 ? (idx + 1) : (layerY + 1);
          } else {
            displayNum = layerY + 1;
          }
          ctx.fillText(`L${displayNum}`, centerX, centerY + 3);
        } catch {
          ctx.fillText(`L${layerY + 1}`, centerX, centerY + 3);
        }
        ctx.shadowBlur = 0;

        ctx.restore();
        shadowCount++;
      }
    }

    instructionsLog.log(`👤 Drew ${shadowCount} shadow hexagons from lower layers`);
  }

  async function drawHexLayerTiles(ctx, tiles, analysis, hexSize, margin) {
    const hexHeight = hexSize * Math.sqrt(3);

    instructionsLog.log(`Drawing ${tiles.length} tiles in hexagonal layout`);

    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;

    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);

        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });

    instructionsLog.log(`🎯 TILES: Using GLOBAL positioning: minPixelX=${minPixelX.toFixed(1)}, minPixelY=${minPixelY.toFixed(1)} - ALL LAYERS CENTERED TO SAME POINT`);

    const textureImages = new Map();

    async function getTextureImage(biomeId, tileNumber) {
      const cacheKey = `${biomeId}_${tileNumber}`;
      if (textureImages.has(cacheKey)) {
        return textureImages.get(cacheKey);
      }

      const gridConfig = getGridTexturePath(biomeId);
      if (!gridConfig) {
        instructionsLog.log(`No grid texture config found for biome: ${biomeId}`);
        return null;
      }

      const extractedImg = await extractTileFromGrid(gridConfig.gridTexture, tileNumber, gridConfig);
      if (extractedImg) {
        textureImages.set(cacheKey, extractedImg);
        instructionsLog.log(`✅ Extracted texture for ${biomeId} tile ${tileNumber}`);
      } else {
        instructionsLog.log(`❌ Failed to extract texture for ${biomeId} tile ${tileNumber}`);
      }

      return extractedImg;
    }

    function drawHexagon(context, centerX, centerY, size, fillStyle = null, strokeStyle = '#333') {
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = centerX + size * Math.cos(angle);
        const y = centerY + size * Math.sin(angle);
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();

      if (fillStyle) {
        context.fillStyle = fillStyle;
        context.fill();
      }

      if (fillStyle && strokeStyle) {
        context.strokeStyle = strokeStyle;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    for (const tile of tiles) {
      try {
        if ((!tile.q && tile.q !== 0) || (!tile.r && tile.r !== 0)) {
          console.error('❌ ERROR: Invalid tile coordinates:', tile);
          continue;
        }

        const biomeId = tile.biomeId;
        if (!biomeId) {
          console.error('❌ ERROR: No biomeId found in tile:', tile);
          continue;
        }

        const tilePixelX = hexSize * (3/2 * tile.q);
        const tilePixelY = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);

        const paddingHexes = 2;
        const hexPaddingX = paddingHexes * hexSize * 1.5;
        const hexPaddingY = paddingHexes * hexHeight;

        const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
        const y = (tilePixelY - minPixelY) + hexPaddingY + margin;

        const centerX = x + hexSize;
        const centerY = y + hexSize;
        const textureImg = await getTextureImage(biomeId, tile.tileNumber);

        if (textureImg) {
          ctx.save();
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = centerX + hexSize * Math.cos(angle);
            const py = centerY + hexSize * Math.sin(angle);
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.closePath();
          ctx.clip();

          ctx.translate(centerX, centerY);
          const baseRotation = Math.PI / 3;
          const userRotation = tile.rotationDegrees ? (tile.rotationDegrees * Math.PI) / 180 : 0;
          const totalRotation = baseRotation + userRotation;
          ctx.rotate(totalRotation);
          ctx.translate(-centerX, -centerY);

          const imgSize = hexSize * 1.8;
          ctx.drawImage(textureImg, centerX - imgSize / 2, centerY - imgSize / 2, imgSize, imgSize);

          ctx.restore();

          drawHexagon(ctx, centerX, centerY, hexSize, null, '#333');
        } else {
          const color = getBiomeDisplayColor(biomeId);
          drawHexagon(ctx, centerX, centerY, hexSize, color, '#333');
        }

        if (ctx.__showLabels) {
          ctx.fillStyle = '#000';
          ctx.font = '600 9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const biomeName = biomeId ? biomeId.split('_')[0].toUpperCase() : 'UNK';
          const tileNum = tile.tileNumber || '?';
          const rotationInfo = (tile.rotationDegrees && tile.rotationDegrees !== 0) ? ` (${tile.rotationDegrees}°)` : '';
          const text = `${biomeName}-${tileNum}${rotationInfo}`;
          const textMetrics = ctx.measureText(text);
          const textWidth = textMetrics.width;
          const textHeight = 12;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillRect(centerX - textWidth / 2 - 2, centerY - textHeight / 2 - 1, textWidth + 4, textHeight + 2);
          ctx.fillStyle = '#000';
          ctx.fillText(text, centerX, centerY);
        }
      } catch (error) {
        console.error('Error drawing tile:', tile, error);
      }
    }
  }

  async function drawSimpleLayerTiles(ctx, tiles, analysis, hexSize, margin) {
    const hexHeight = hexSize * Math.sqrt(3);
    let minPixelX = Infinity, minPixelY = Infinity;
    analysis.layerData.forEach(layerTiles => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        minPixelX = Math.min(minPixelX, x);
        minPixelY = Math.min(minPixelY, y);
      });
    });

    const paddingHexes = 2;
    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexHeight;

    const drawHex = (cx, cy, size, fill, stroke) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i;
        const px = cx + size * Math.cos(ang);
        const py = cy + size * Math.sin(ang);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    };

    for (const tile of tiles) {
      const tilePixelX = hexSize * (3/2 * tile.q);
      const tilePixelY = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
      const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
      const y = (tilePixelY - minPixelY) + hexPaddingY + margin;
      const cx = x + hexSize;
      const cy = y + hexSize;
      const color = getBiomeDisplayColor(tile.biomeId);
      drawHex(cx, cy, hexSize, color, '#333');
      if (ctx.__showLabels) {
        const short = (tile.biomeId || '').split('_')[0]?.toUpperCase() || 'UNK';
        const num = tile.tileNumber || '?';
        ctx.fillStyle = '#000'; ctx.font = '600 9px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${short}-${num}`, cx, cy);
      }
    }
  }

  function getBiomeDisplayColor(biomeId) {
    if (!biomeId || typeof biomeId !== 'string') {
      console.warn('⚠️ getBiomeColor: Invalid biomeId:', biomeId);
      return '#999999';
    }

    const colorMap = {
      'gs': '#4CAF50',
      'ar': '#87CEEB',
      'ds': '#DEB887',
      'bl': '#8B4513',
      'cb': '#708090',
      'cv': '#696969',
      'dg': '#2F4F4F',
      'bk': '#8B7355'
    };

    const prefix = biomeId.split('_')[0];
    return colorMap[prefix] || '#999999';
  }

  function getGridTexturePath(biomeId) {
    const textureConfigs = {
      // Grassland sets
      'gs_grass': { gridTexture: 'textures/grid-Grassland---plain-grass.png', gridSize: { cols: 5, rows: 10 } },
      'gs_tracks_streams': { gridTexture: 'textures/grid-Grassland---Tracks-and-Streams.png', gridSize: { cols: 5, rows: 10 } },
      'gs_forest_flora': { gridTexture: 'textures/grid-Grassland-Forest-and-Flora.png', gridSize: { cols: 5, rows: 10 } },
      // Barrenland sets
      'bl_earth': { gridTexture: 'textures/grid-Barrenland-set---dirt.png', gridSize: { cols: 5, rows: 10 } },
      'bl_tracks_streams': { gridTexture: 'textures/grid-Barrenland-tracks-and-streams.png', gridSize: { cols: 5, rows: 10 } },
      'bl_wasteland_forest': { gridTexture: 'textures/grid-Barrenland-Forest-and-Rocks.png', gridSize: { cols: 5, rows: 10 } },
      // Mountain sets
      'mt_stone': { gridTexture: 'textures/grid-Mountains---Stone.png', gridSize: { cols: 5, rows: 10 } },
      'mt_streams_forest': { gridTexture: 'textures/grid-Mountains---Streams-and-Forests.png', gridSize: { cols: 5, rows: 10 } },
      // Oceanic sets
      'oc_water': { gridTexture: 'textures/grid-Oceanic---Water.png', gridSize: { cols: 5, rows: 10 } },
      'oc_coastal': { gridTexture: 'textures/grid-Oceanic---Coastal.png', gridSize: { cols: 5, rows: 10 } },
      'oc_tropical_island': { gridTexture: 'textures/grid-Oceanic---Tropical-Island-and-Shallows.png', gridSize: { cols: 5, rows: 10 } },
      // Desert sets
      'ds_sand': { gridTexture: 'textures/grid-Desert-set---Sand.png', gridSize: { cols: 5, rows: 10 } },
      'ds_tracks_ridgelines': { gridTexture: 'textures/grid-Desert-Tracks-and-Ridgelines.png', gridSize: { cols: 5, rows: 10 } },
      'ds_ruins_oases': { gridTexture: 'textures/grid-Desert-set---Oases-and-Ruins.png', gridSize: { cols: 5, rows: 10 } },
      // Arctic sets
      'ar_snow': { gridTexture: 'textures/grid-Arctic---Snow.png', gridSize: { cols: 5, rows: 10 } },
      'ar_frozen_forest': { gridTexture: 'textures/grid-Arctic---Frozen-Streams-and-Forests.png', gridSize: { cols: 5, rows: 10 } },
      'ar_ice_rocks': { gridTexture: 'textures/grid-Arctic---Rocks-and-Ice.png', gridSize: { cols: 5, rows: 10 } },
      // Volcanic sets
      'vo_basalt': { gridTexture: 'textures/grid-Volcano---Basalt.png', gridSize: { cols: 5, rows: 10 } },
      'vo_volcanic_crater': { gridTexture: 'textures/grid-Volcano---Lava-Lake.png', gridSize: { cols: 5, rows: 10 } },
      'vo_lava_flows': { gridTexture: 'textures/grid-Volcano---Lava-flow.png', gridSize: { cols: 5, rows: 10 } },
      // Marshland sets
      'ms_marsh': { gridTexture: 'textures/grid-Marshland---Marsh.png', gridSize: { cols: 5, rows: 10 } },
      'ms_swamp_streams': { gridTexture: 'textures/grid-Marshland---Swamp-and-Causeways.png', gridSize: { cols: 5, rows: 10 } },
      'ms_fetid_forest': { gridTexture: 'textures/grid-Marshland---Fetid-Forest.png', gridSize: { cols: 5, rows: 10 } },
      // Tavern sets
      'tv_walls': { gridTexture: 'textures/grid-Tavern-Walls.png', gridSize: { cols: 5, rows: 10 } },
      'tv_floors': { gridTexture: 'textures/grid-Tavern-floor.png', gridSize: { cols: 5, rows: 10 } },
      // Cavern sets
      'cv_walls': { gridTexture: 'textures/grid-Cavern-walls.png', gridSize: { cols: 5, rows: 10 } },
      'cv_floors': { gridTexture: 'textures/grid-Cavern-floors.png', gridSize: { cols: 5, rows: 10 } },
      // Street sets
      'st_road': { gridTexture: 'textures/grid-Streets---Road.png', gridSize: { cols: 5, rows: 10 } },
      'st_market': { gridTexture: 'textures/grid-Streets---Market.png', gridSize: { cols: 5, rows: 10 } },
      // Dungeon sets
      'dg_walls': { gridTexture: 'textures/grid-Dungeons---Walls.png', gridSize: { cols: 5, rows: 10 } },
      'dg_floors': { gridTexture: 'textures/grid-Dungeons---Floors.png', gridSize: { cols: 5, rows: 10 } },
      // Shadowlands sets
      'sh_cursed_earth': { gridTexture: 'textures/grid-Shadowlands---Cursed-Earth.png', gridSize: { cols: 5, rows: 10 } },
      'sh_dead_forest': { gridTexture: 'textures/grid-Shadowlands---Dead-Forest.png', gridSize: { cols: 5, rows: 10 } },
      'sh_twisted_roads_and_ruins': { gridTexture: 'textures/grid-Shadowlands---Twisted-Roads-and-Ruins.png', gridSize: { cols: 5, rows: 10 } },
      // Modern city sets
      'mc_concrete': { gridTexture: 'textures/grid-Modern-city---Concrete.png', gridSize: { cols: 5, rows: 10 } },
      'mc_streets': { gridTexture: 'textures/grid-Modern-city---Streets.png', gridSize: { cols: 5, rows: 10 } },
      'mc_pavement': { gridTexture: 'textures/grid-Modern-city---Pavement.png', gridSize: { cols: 5, rows: 10 } },
      // Castle building sets
      'cb_walls': { gridTexture: 'textures/grid-Castle-buildings---Walls.png', gridSize: { cols: 5, rows: 10 } },
      'cb_floors': { gridTexture: 'textures/grid-Castle-buildings---Floors.png', gridSize: { cols: 5, rows: 10 } },
      // Blank sets - using grassland as fallback since no brick textures found
      'bk_brown': { gridTexture: 'textures/grid-Grassland---plain-grass.png', gridSize: { cols: 5, rows: 10 } },
      'bk_gray': { gridTexture: 'textures/grid-Grassland---plain-grass.png', gridSize: { cols: 5, rows: 10 } }
    };

    return textureConfigs[biomeId] || null;
  }

  async function extractTileFromGrid(gridTexturePath, tileNumber, gridConfig) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const { cols, rows } = gridConfig.gridSize;
        const tileWidth = img.width / cols;
        const tileHeight = img.height / rows;

        canvas.width = tileWidth;
        canvas.height = tileHeight;

        const index = tileNumber - 1;
        const col = index % cols;
        const row = Math.floor(index / cols);

        ctx.drawImage(
          img,
          col * tileWidth, row * tileHeight, tileWidth, tileHeight,
          0, 0, tileWidth, tileHeight
        );

        const extractedImg = new Image();
        extractedImg.onload = () => resolve(extractedImg);
        extractedImg.onerror = () => resolve(null);
        extractedImg.src = canvas.toDataURL();
      };
      img.onerror = () => resolve(null);
      img.src = gridTexturePath;
    });
  }

  function createTilesListForLayer(tiles, yLevel) {
    const listDiv = document.createElement('div');
    listDiv.className = 'tiles-list';

    const details = document.createElement('details');
    details.open = false;
    details.className = 'tiles-accordion';
    const summary = document.createElement('summary');
    const uniqueBiomes = new Set(tiles.map(t => t.biomeId).filter(Boolean));
    summary.innerHTML = `<i class="fas fa-list"></i> Tiles List (Layer ${yLevel + 1}) — ${tiles.length} tiles, ${uniqueBiomes.size} biomes <span class="coords-hint">· Q = columns, R = rows</span>`;
    details.appendChild(summary);

    summary.addEventListener('click', () => {
      setTimeout(() => {
        try {
          const isOpen = details.open;
          if (isOpen) {
            listDiv.querySelectorAll('.biome-accordion').forEach(d => { d.open = true; });
          }
        } catch {
          // ignore
        }
      }, 0);
    });

    const listToolbar = document.createElement('div');
    listToolbar.className = 'tiles-list-toolbar';

    const biomeGroups = new Map();
    tiles.forEach(tile => {
      const biomeId = tile.biomeId;
      if (biomeId) {
        if (!biomeGroups.has(biomeId)) {
          biomeGroups.set(biomeId, []);
        }
        biomeGroups.get(biomeId).push(tile);
      }
    });

    const listContent = document.createElement('div');
    listContent.className = 'tiles-list-content';

    biomeGroups.forEach((biomeTiles, biomeId) => {
      const biome = biomeSets.find(b => b.id === biomeId);
      const biomeName = biome ? biome.name : biomeId;
      const biomeDetails = document.createElement('details');
      biomeDetails.className = 'biome-accordion';
      biomeDetails.open = false;
      const biomeSummary = document.createElement('summary');
      biomeSummary.innerHTML = `<strong>${biomeName}</strong> <span class="biome-count">(${biomeTiles.length})</span>`;
      biomeDetails.appendChild(biomeSummary);

      const biomeSection = document.createElement('div');
      biomeSection.className = 'biome-section';
      biomeSection.innerHTML = `
        <div class="biome-tiles">
          ${biomeTiles.map(tile => {
            const tileNum = tile.tileNumber || '?';
            const rot = (tile.rotationDegrees && tile.rotationDegrees !== 0) ? `<span class="rot">· ${tile.rotationDegrees}°</span>` : '';
            const short = (biomeId || '').split('_')[0]?.toUpperCase() || 'UNK';
            return `<span class="tile-tag"><span class="tile-num">${short}-${tileNum}</span><span class="coords">Q: ${tile.q} · R: ${tile.r}</span>${rot}</span>`;
          }).join('')}
        </div>
      `;
      biomeDetails.appendChild(biomeSection);
      listContent.appendChild(biomeDetails);
    });

    details.appendChild(listContent);
    listDiv.appendChild(details);
    return listDiv;
  }

  function createPrintLayout(root, analysis, options = {}) {
    if (!root) {
      return {
        registerLayer: () => {},
        refreshLayer: () => {},
        refreshAll: () => {},
        setDetailsVisibility: () => {}
      };
    }

    const settings = {
      includeDetails: Boolean(options.includeDetails),
      scale: options.scale === 'original' ? 'original' : 'fit',
      totalTiles: typeof options.totalTiles === 'number' ? options.totalTiles : 0
    };
    const logger = options.log;

    const CSS_PX_PER_MM = 96 / 25.4;
    const PRINTABLE_MM = {
      width: 297 - 24, // landscape A4 width minus margins
      height: 210 - 20 // landscape A4 height minus margins
    };
    const PRINTABLE_PX = {
      width: Math.floor(PRINTABLE_MM.width * CSS_PX_PER_MM),
      height: Math.floor(PRINTABLE_MM.height * CSS_PX_PER_MM)
    };
    const HEADER_ALLOWANCE_MM = 36;
    const HEADER_ALLOWANCE_PX = Math.min(
      Math.floor(HEADER_ALLOWANCE_MM * CSS_PX_PER_MM),
      Math.max(0, PRINTABLE_PX.height - 120)
    );
    const pxToMm = (px) => (Number.isFinite(px) ? px / CSS_PX_PER_MM : 0);

    root.innerHTML = '';
    root.setAttribute('role', 'document');

    const mapNameInput = document.getElementById('map-name-input-toolbar');
    const providedName = (mapNameInput?.value || '').trim();
    const titleText = providedName ? `${providedName} — Build Instructions` : 'Map Build Instructions';

    const header = document.createElement('header');
    header.className = 'print-header';

    const heading = document.createElement('h1');
    heading.className = 'print-header-title';
    heading.textContent = titleText;

    const layerCount = Array.isArray(analysis.layers) ? analysis.layers.length : 0;
    const statsText = `${analysis.mapWidth}×${analysis.mapHeight} · ${layerCount} layer${layerCount === 1 ? '' : 's'} · ${settings.totalTiles} tile${settings.totalTiles === 1 ? '' : 's'}`;
    if (statsText.trim()) {
      const statsInline = document.createElement('span');
      statsInline.className = 'print-header-stats';
      statsInline.textContent = `— ${statsText}`;
      heading.append(' ');
      heading.appendChild(statsInline);
    }

    header.appendChild(heading);

    let scaleValueNode = null;
    const metaEntries = [
      ['Scale', settings.scale === 'original' ? 'Original Tile Size' : 'Fit to Page'],
      ['Generated', new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })]
    ].filter(([, value]) => Boolean(value));

    if (metaEntries.length) {
      const meta = document.createElement('div');
      meta.className = 'print-meta';
      metaEntries.forEach(([label, value]) => {
        const item = document.createElement('div');
        item.className = 'print-meta-item';
        const labelEl = document.createElement('span');
        labelEl.className = 'print-meta-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('span');
        valueEl.className = 'print-meta-value';
        valueEl.textContent = value;
        if (label === 'Scale') {
          scaleValueNode = valueEl;
        }
        item.append(labelEl, valueEl);
        meta.appendChild(item);
      });
      header.appendChild(meta);
    }

    root.appendChild(header);

    const layersContainer = document.createElement('div');
    layersContainer.className = 'print-layers';
    root.appendChild(layersContainer);

    const layerRefs = new Map();

    const updateScaleIndicator = () => {
      if (!scaleValueNode) return;
      scaleValueNode.textContent = settings.scale === 'original' ? 'Original Tile Size' : 'Fit to Page';
    };

    const applyScaleToEntry = (entry) => {
      if (!entry) return;
      const isOriginal = settings.scale === 'original';
      entry.section?.classList.toggle('scale-original', isOriginal);
      if (entry.fitImage) {
        entry.fitImage.style.display = isOriginal ? 'none' : '';
      }
      if (entry.sheetContainer) {
        entry.sheetContainer.style.display = isOriginal ? '' : 'none';
        if (!isOriginal) {
          entry.sheetContainer.innerHTML = '';
        }
      }
    };

    const updateFitImage = (entry) => {
      if (!entry?.fitImage || !entry?.canvas) return;
      try {
        entry.fitImage.src = entry.canvas.toDataURL('image/png');
      } catch (error) {
        logger?.warn?.('Failed to capture canvas for print layout (fit scale)', error);
      }
    };

    const sliceCanvasIntoSheets = (canvas) => {
      if (!canvas || !canvas.width || !canvas.height) {
        return [];
      }

      const slices = [];
      let y = 0;
      let row = 0;
      while (y < canvas.height) {
        const maxHeightForRow = row === 0
          ? Math.max(120, PRINTABLE_PX.height - HEADER_ALLOWANCE_PX)
          : PRINTABLE_PX.height;
        const sliceHeight = Math.min(maxHeightForRow, canvas.height - y);
        if (sliceHeight <= 0) {
          break;
        }

        let x = 0;
        let col = 0;
        while (x < canvas.width) {
          const sliceWidth = Math.min(PRINTABLE_PX.width, canvas.width - x);
          const offscreen = document.createElement('canvas');
          offscreen.width = sliceWidth;
          offscreen.height = sliceHeight;
          const ctx = offscreen.getContext('2d');
          ctx.drawImage(canvas, x, y, sliceWidth, sliceHeight, 0, 0, sliceWidth, sliceHeight);
          slices.push({
            dataUrl: offscreen.toDataURL('image/png'),
            widthPx: sliceWidth,
            heightPx: sliceHeight,
            widthMm: pxToMm(sliceWidth),
            heightMm: pxToMm(sliceHeight),
            row,
            col,
            index: slices.length
          });
          x += sliceWidth;
          col += 1;
        }

        y += sliceHeight;
        row += 1;
      }

      return slices;
    };

    const updateOriginalSheets = (entry) => {
      if (!entry?.sheetContainer || !entry?.canvas) {
        return;
      }

      const container = entry.sheetContainer;
      container.innerHTML = '';
      const slices = sliceCanvasIntoSheets(entry.canvas);
      if (!slices.length) {
        updateFitImage(entry);
        return;
      }

      slices.forEach((slice, idx) => {
        const sheet = document.createElement('div');
        sheet.className = 'print-layer-sheet';
        if (idx > 0) {
          sheet.classList.add('continuation');
        }
        sheet.dataset.row = String(slice.row);
        sheet.dataset.col = String(slice.col);

        const img = document.createElement('img');
        img.alt = `Layer ${entry.layerNumber} section ${idx + 1}`;
        img.src = slice.dataUrl;
        img.style.width = `${slice.widthMm.toFixed(3)}mm`;
        img.style.height = `${slice.heightMm.toFixed(3)}mm`;

        sheet.appendChild(img);
        container.appendChild(sheet);
      });
    };

    const elevationLabel = (value) => {
      if (!Number.isFinite(value) || value === 0) return 'Ground Level';
      return value > 0 ? `+${value}` : `${value}`;
    };

    const registerLayer = ({ layerNumber, elevation, tileCount, tiles, canvas }) => {
      if (layerRefs.has(layerNumber)) {
        const existing = layerRefs.get(layerNumber);
        existing.canvas = canvas;
        existing.tiles = tiles;
        existing.tileCount = tileCount;
        if (existing.detailsEl) {
          existing.detailsEl.style.display = settings.includeDetails ? '' : 'none';
          existing.section?.classList.toggle('has-details', settings.includeDetails);
        }
        return existing;
      }

      const section = document.createElement('section');
      section.className = 'print-layer';
      section.dataset.layerNumber = String(layerNumber);

      const layerHeader = document.createElement('header');
      layerHeader.className = 'print-layer-header';
      const layerTitle = document.createElement('div');
      layerTitle.className = 'print-layer-title';
      layerTitle.textContent = `Layer ${layerNumber} · ${elevationLabel(elevation)}`;
      const layerMeta = document.createElement('div');
      layerMeta.className = 'print-layer-meta';
      layerMeta.textContent = `${tileCount} tile${tileCount === 1 ? '' : 's'}`;
      layerHeader.append(layerTitle, layerMeta);
      section.appendChild(layerHeader);

      const body = document.createElement('div');
      body.className = 'print-layer-body';
      section.appendChild(body);

      const figure = document.createElement('figure');
      figure.className = 'print-layer-figure';
      const fitImg = document.createElement('img');
      fitImg.className = 'print-layer-image print-layer-image--fit';
      fitImg.alt = `Layer ${layerNumber} layout`;
      fitImg.src = '';

      const sheetContainer = document.createElement('div');
      sheetContainer.className = 'print-layer-tilesheets';

      figure.append(fitImg, sheetContainer);
      body.appendChild(figure);

      const detailsEl = createPrintableTileSummary(tiles);
      if (detailsEl) {
        if (!settings.includeDetails) {
          detailsEl.style.display = 'none';
        }
        body.appendChild(detailsEl);
        section.classList.toggle('has-details', settings.includeDetails);
      }

      layersContainer.appendChild(section);

      const record = {
        layerNumber,
        canvas,
        fitImage: fitImg,
        sheetContainer,
        detailsEl,
        tiles,
        tileCount,
        section,
        body,
        figure
      };
      layerRefs.set(layerNumber, record);
      applyScaleToEntry(record);
      return record;
    };

    const refreshLayer = (layerNumber) => {
      const entry = layerRefs.get(layerNumber);
      if (!entry || !entry.canvas) return;
      try {
        if (settings.scale === 'original') {
          updateOriginalSheets(entry);
        } else {
          updateFitImage(entry);
        }
      } catch (error) {
        logger?.warn?.('Failed to capture canvas for print layout', error);
      }
    };

    const refreshAll = () => {
      layerRefs.forEach((_, key) => refreshLayer(key));
    };

    const setDetailsVisibility = (show) => {
      const displayValue = show ? '' : 'none';
      settings.includeDetails = Boolean(show);
      layerRefs.forEach((entry) => {
        if (entry.detailsEl) {
          entry.detailsEl.style.display = displayValue;
          entry.section?.classList.toggle('has-details', show);
        }
      });
    };

    const setScale = (scale) => {
      const next = scale === 'original' ? 'original' : 'fit';
      if (next === settings.scale) {
        return;
      }
      settings.scale = next;
      updateScaleIndicator();
      layerRefs.forEach((entry) => {
        applyScaleToEntry(entry);
        if (settings.scale === 'original') {
          updateOriginalSheets(entry);
        } else {
          updateFitImage(entry);
        }
      });
    };

    const prepareForPrint = () => {
      if (settings.scale === 'original') {
        layerRefs.forEach((entry) => updateOriginalSheets(entry));
      }
    };

    if (!settings.includeDetails) {
      setDetailsVisibility(false);
    }

    return {
      registerLayer,
      refreshLayer,
      refreshAll,
      setDetailsVisibility,
      setScale,
      prepareForPrint
    };
  }

  function createPrintableTileSummary(tiles) {
    if (!Array.isArray(tiles) || tiles.length === 0) {
      return null;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'print-layer-details';

    const biomeGroups = new Map();
    tiles.forEach((tile) => {
      const key = tile?.biomeId || 'unassigned';
      if (!biomeGroups.has(key)) {
        biomeGroups.set(key, []);
      }
      biomeGroups.get(key).push(tile);
    });

    const resolveBiomeName = (biomeId) => {
      if (!biomeId || biomeId === 'unassigned') {
        return 'Unassigned Biomes';
      }
      const match = Array.isArray(biomeSets) ? biomeSets.find((b) => b.id === biomeId) : null;
      return match?.name || biomeId;
    };

    const sortedGroups = Array.from(biomeGroups.entries()).sort((a, b) => {
      return resolveBiomeName(a[0]).localeCompare(resolveBiomeName(b[0]), undefined, { sensitivity: 'base' });
    });

    sortedGroups.forEach(([biomeId, groupTiles]) => {
      const groupSection = document.createElement('section');
      groupSection.className = 'print-biome-group';

      const groupTitle = document.createElement('h4');
      groupTitle.className = 'print-biome-title';
      groupTitle.textContent = `${resolveBiomeName(biomeId)} (${groupTiles.length})`;
      groupSection.appendChild(groupTitle);

      const table = document.createElement('table');
      table.className = 'print-tile-table';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      ['Tile', 'Coordinates', 'Rotation'].forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const orderedTiles = groupTiles.slice().sort((a, b) => {
        if (a.q !== b.q) return a.q - b.q;
        if (a.r !== b.r) return a.r - b.r;
        const aNum = a.tileNumber ?? 0;
        const bNum = b.tileNumber ?? 0;
        return aNum - bNum;
      });

      orderedTiles.forEach((tile) => {
        const row = document.createElement('tr');

        const short = (tile?.biomeId || 'UNK').split('_')[0]?.toUpperCase() || 'UNK';
        const tileLabel = tile?.tileNumber ? `${short}-${tile.tileNumber}` : short;
        const tileCell = document.createElement('td');
        tileCell.textContent = tileLabel;

        const coordCell = document.createElement('td');
        coordCell.textContent = `Q ${tile.q} · R ${tile.r}`;

        const rotationCell = document.createElement('td');
        rotationCell.textContent = tile?.rotationDegrees ? `${tile.rotationDegrees}°` : '—';

        row.append(tileCell, coordCell, rotationCell);
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      groupSection.appendChild(table);
      wrapper.appendChild(groupSection);
    });

    return wrapper;
  }

  function createInstructionsWindow() {
    const overlay = document.createElement('div');
    overlay.className = 'instructions-overlay';

    const container = document.createElement('div');
    container.className = 'instructions-container';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'instructions-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close instructions');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    container.appendChild(closeBtn);

    const interactiveRoot = document.createElement('div');
    interactiveRoot.className = 'instructions-interactive';
    container.appendChild(interactiveRoot);

    const printRoot = document.createElement('div');
    printRoot.className = 'instructions-print-document';
    printRoot.setAttribute('aria-hidden', 'true');
    container.appendChild(printRoot);

    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'instructions-loading';
    loadingOverlay.setAttribute('role', 'status');
    loadingOverlay.setAttribute('aria-live', 'polite');
    loadingOverlay.setAttribute('aria-hidden', 'true');
    loadingOverlay.innerHTML = `
      <div class="instructions-loading-spinner" aria-hidden="true"></div>
      <div class="instructions-loading-text">
        <p class="instructions-loading-primary">Preparing build instructions...</p>
        <p class="instructions-loading-secondary">Large maps may take a few seconds.</p>
      </div>
    `;
    container.appendChild(loadingOverlay);
    const loadingPrimary = loadingOverlay.querySelector('.instructions-loading-primary');
    const loadingSecondary = loadingOverlay.querySelector('.instructions-loading-secondary');
    container.setAttribute('aria-busy', 'false');

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    let beforePrintCallback = null;
    let afterPrintCallback = null;

    const runBeforePrint = () => {
      if (typeof beforePrintCallback === 'function') {
        try {
          beforePrintCallback();
        } catch (error) {
          console.warn('Instructions beforePrint hook failed.', error);
        }
      }
    };

    const runAfterPrint = () => {
      if (typeof afterPrintCallback === 'function') {
        try {
          afterPrintCallback();
        } catch (error) {
          console.warn('Instructions afterPrint hook failed.', error);
        }
      }
    };

    const handleBeforePrint = () => {
      runBeforePrint();
    };

    const handleAfterPrint = () => {
      runAfterPrint();
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    const teardown = () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      container.classList.remove('printing');
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      teardown();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        teardown();
      }
    });

    window.closeInstructions = () => {
      teardown();
    };

    const runPrint = () => {
      runBeforePrint();
      window.print();
    };

    window.printInstructions = runPrint;

    window.downloadAllLayerImages = async () => {
      const containerEl = document.querySelector('.instructions-container');
      if (!containerEl) return;
      const canvases = containerEl.querySelectorAll('canvas.layer-canvas');
      if (!canvases.length) { 
        showNotification({
          type: 'warning',
          title: 'No layers to save',
          message: 'No layer images were found to download.',
          duration: 5000
        }); 
        return; 
      }
      const nameEl = document.getElementById('map-name-input-toolbar');
      const mapName = (nameEl?.value || 'map').trim().replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
      let idx = 1;
      for (const cv of canvases) {
        const fileName = `${mapName || 'map'}_layer-${idx}.png`;
        if (cv.toBlob) {
          await new Promise((resolve) => {
            cv.toBlob((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
              URL.revokeObjectURL(url);
              resolve();
            }, 'image/png');
          });
        } else {
          const dataUrl = cv.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
        }
        idx++;
        await new Promise(r => setTimeout(r, 60));
      }
    };

    window.downloadInstructionsAsPDF = () => window.print();

    window.expandAllInstructionLists = () => {
      try {
        container.querySelectorAll('.tiles-accordion, .biome-accordion').forEach(d => { d.open = true; });
      } catch {
        // ignore
      }
    };
    window.collapseAllInstructionLists = () => {
      try {
        container.querySelectorAll('.biome-accordion').forEach(d => { d.open = false; });
        container.querySelectorAll('.tiles-accordion').forEach(d => { d.open = false; });
      } catch {
        // ignore
      }
    };

    const setLoadingState = (isLoading, primaryText, secondaryText) => {
      const active = Boolean(isLoading);
      container.classList.toggle('is-loading', active);
      container.setAttribute('aria-busy', active ? 'true' : 'false');
      loadingOverlay.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (typeof primaryText === 'string' && primaryText.trim()) {
        loadingPrimary.textContent = primaryText.trim();
      }
      if (typeof secondaryText === 'string') {
        loadingSecondary.textContent = secondaryText.trim();
        loadingSecondary.style.display = secondaryText.trim() ? '' : 'none';
      }
    };

    const updateLoadingMessage = (primaryText, secondaryText) => {
      if (typeof primaryText === 'string' && primaryText.trim()) {
        loadingPrimary.textContent = primaryText.trim();
      }
      if (typeof secondaryText === 'string') {
        loadingSecondary.textContent = secondaryText.trim();
        loadingSecondary.style.display = secondaryText.trim() ? '' : 'none';
      }
    };

    const setBeforePrint = (callback) => {
      beforePrintCallback = typeof callback === 'function' ? callback : null;
    };

    const setAfterPrint = (callback) => {
      afterPrintCallback = typeof callback === 'function' ? callback : null;
    };

    return {
      overlay,
      container,
      interactiveRoot,
      printRoot,
      setLoadingState,
      updateLoadingMessage,
      triggerPrint: runPrint,
      setBeforePrint,
      setAfterPrint
    };
  }

  return {
    generateLayerInstructions
  };
}

export function registerInstructionsEnhancer() {
  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const ENHANCED_FLAG = 'data-instructions-enhanced';

    function expandAllLayers(container) {
      container.querySelectorAll('details').forEach(d => { d.open = true; });
    }

    function ensureBottomActions(container) {
      // Bottom actions removed - now in sticky toolbar
      // No need to duplicate buttons
      return;
    }

    function ensureExpandAllPerTilesList(container) {
      const lists = container.querySelectorAll('.tiles-list, .tiles-accordion');
      lists.forEach(list => {
        if (list.hasAttribute(ENHANCED_FLAG)) return;

        const summary = list.querySelector(':scope > summary') || list.querySelector(':scope .tiles-accordion > summary');
        const target = summary || list;

        if (target.querySelector('.tiles-list-toolbar')) {
          list.setAttribute(ENHANCED_FLAG, '1');
          return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'tiles-list-toolbar';

        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary btn-compact';
        btn.type = 'button';
        btn.title = 'Expand all tiles lists across all layers';
        btn.innerHTML = '<i class="fas fa-angle-double-down"></i> <span>Expand all (all layers)</span>';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const containerRoot = document.querySelector('.instructions-container') || document;
          expandAllLayers(containerRoot);
        });

        toolbar.appendChild(btn);

        if (summary) {
          summary.appendChild(toolbar);
        } else {
          list.insertBefore(toolbar, list.firstChild);
        }

        list.setAttribute(ENHANCED_FLAG, '1');
      });
    }

    function enhanceInstructionsUI() {
      const container = document.querySelector('.instructions-container');
      if (!container) return;

      if (!container.hasAttribute(ENHANCED_FLAG)) {
        // ensureBottomActions(container); // Removed - buttons now in toolbar
        container.setAttribute(ENHANCED_FLAG, '1');
      }

      ensureExpandAllPerTilesList(container);

      const candidates = container.querySelectorAll('.instructions-actions button, .instructions-actions a');
      candidates.forEach(btn => {
        if (btn.dataset.wiredAny === '1') return;
        const label = (btn.textContent || btn.title || '').toLowerCase();
        const hasOnclick = btn.hasAttribute('onclick');
        const hasHref = btn.hasAttribute('href');
        const isPrintish = label.includes('print') || (label.includes('pdf') && !label.includes('expand'));
        if (!hasOnclick && isPrintish) {
          btn.addEventListener('click', (e) => {
            if (!hasHref) {
              e.preventDefault();
              window.print();
            }
          });
          btn.dataset.wiredAny = '1';
        }
      });
    }

    enhanceInstructionsUI();
    const mo = new MutationObserver(() => enhanceInstructionsUI());
    mo.observe(document.body, { childList: true, subtree: true });
  });
}
