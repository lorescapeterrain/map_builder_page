# Generate Instructions - Developer Guide

## Architecture

### File Structure
```
src/app/instructions/
└── instructionsRenderer.js    # Main renderer with all logic
```

### Key Functions

#### `createInstructionsRenderer({ instructionsLog, biomeSets, placedTiles })`
Main factory function that creates the renderer instance.

**Returns**: `{ generateLayerInstructions }`

#### `generateLayerInstructions(analysis)`
Generates the full instructions UI from layer analysis data.

**Parameters**:
- `analysis` - Object with layer data, bounds, dimensions

**Structure**:
```javascript
{
  layers: [0, 1, 2],           // Y-levels
  layerData: Map,              // Map<yLevel, tiles[]>
  bounds: { minQ, maxQ, minR, maxR },
  mapWidth: 15,
  mapHeight: 12
}
```

#### `createLayerVisualization(yLevel, tiles, analysis, layerNumber, globalView, registerRerender)`
Creates a single layer card with canvas and tile list.

**Returns**: HTMLElement (`.instr-layer`)

#### `createInstructionsWindow()`
Creates the modal overlay and container.

**Returns**: `{ overlay, container }`

## DOM Structure

```html
<div class="instructions-overlay">
  <div class="instructions-container">
    
    <!-- Header -->
    <div class="instr-header">
      <div class="instr-title-row">
        <h2 class="instr-title">...</h2>
        <div class="instr-header-actions">
          <button id="instr-minimize">...</button>
        </div>
      </div>
      <div class="instr-stats">...</div>
    </div>
    
    <!-- Sticky Toolbar -->
    <div class="instr-toolbar sticky">
      <div class="instr-toolbar-section view-options">
        <div class="section-title">...</div>
        <div class="view-toggles">
          <label class="view-toggle">...</label>
        </div>
      </div>
      <div class="instr-toolbar-section export-actions">
        <div class="section-title">...</div>
        <div class="export-buttons">
          <button>...</button>
        </div>
      </div>
    </div>
    
    <!-- Layers -->
    <div class="instr-layers-container">
      <div class="instr-layer">
        <div class="instr-layer-header">...</div>
        <div class="instr-canvas-wrap">
          <div class="axis-frame">
            <div class="axis-left">...</div>
            <canvas class="layer-canvas">...</canvas>
            <div class="axis-bottom">...</div>
          </div>
        </div>
        <details class="instr-layer-tiles">
          <summary>...</summary>
          <div class="instr-tiles-content">...</div>
        </details>
      </div>
    </div>
    
    <button class="instructions-close">×</button>
  </div>
</div>
```

## Global View State

```javascript
const globalView = {
  simple: false,        // Simple/detailed view
  showAxes: true,       // Show Q/R axes
  showTextures: true,   // Show tile textures
  showLabels: true      // Show tile labels
};
```

## Rerender System

All view toggles trigger a rerender of all layers:

```javascript
const rerenders = [];
const addRerender = (fn) => { 
  if (typeof fn === 'function') rerenders.push(fn); 
};
const rerenderAll = () => rerenders.forEach(fn => fn());

// Register layer rerender function
addRerender(render);

// Trigger on toggle change
toggleInput.addEventListener('change', () => {
  globalView[key] = input.checked;
  rerenderAll();
});
```

## Keyboard Shortcuts

Handled via event listener on overlay:

```javascript
overlay.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { /* close */ }
  else if (e.ctrlKey && e.key === 'p') { /* print */ }
  else if (e.ctrlKey && e.key === 's') { /* save all */ }
  else if (e.ctrlKey && e.key === 'e') { /* expand/collapse */ }
});
```

## Canvas Rendering

### Coordinate System

Uses axial hex coordinates (Q, R):

```javascript
// Convert hex coords to pixel position
const x = hexSize * (3/2 * q);
const y = hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
```

### Rendering Pipeline

1. **Clear canvas**
2. **Draw grid** (`drawHexagonalGrid`)
   - Optional: Q/R bands (shading)
3. **Draw shadows** (`drawLowerLayerShadows`) - if not ground level
4. **Draw tiles**:
   - With textures: `drawHexLayerTiles`
   - Without textures: `drawSimpleLayerTiles`
5. **Draw axes** (`drawAxisArrows`) - if enabled

### Canvas Sizing

```javascript
// Calculate bounds
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

// Add padding
const paddingHexes = 2;
const hexPaddingX = paddingHexes * hexSize * 1.5;
const hexPaddingY = paddingHexes * hexHeight;

const canvasWidth = (maxPixelX - minPixelX) + hexWidth + (hexPaddingX * 2) + (margin * 2);
const canvasHeight = (maxPixelY - minPixelY) + hexHeight + (hexPaddingY * 2) + (margin * 2);
```

## Texture Loading

```javascript
async function getTextureImage(biomeId, tileNumber) {
  const gridConfig = getGridTexturePath(biomeId);
  if (!gridConfig) return null;
  
  return await extractTileFromGrid(
    gridConfig.gridTexture,
    tileNumber,
    gridConfig
  );
}
```

## Adding New Features

### Example: Add "Zoom Layer" button

1. **Add button to layer header**:
```javascript
headerActions.innerHTML = `
  <button class="btn btn-icon layer-zoom" title="Zoom this layer">
    <i class="fas fa-search-plus"></i>
  </button>
  <button class="btn btn-icon layer-save" ...>
    ...
  </button>
`;
```

2. **Add event listener**:
```javascript
const zoomBtn = layerHeader.querySelector('.layer-zoom');
zoomBtn?.addEventListener('click', () => {
  // Create zoomed modal
  const zoomModal = document.createElement('div');
  zoomModal.className = 'zoom-modal';
  // ... implementation
});
```

3. **Add CSS**:
```css
.zoom-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.9);
  z-index: 10001;
  display: flex;
  justify-content: center;
  align-items: center;
}

.zoom-modal canvas {
  max-width: 95vw;
  max-height: 95vh;
}
```

### Example: Add Search/Filter

1. **Add search input to toolbar**:
```javascript
const searchSection = document.createElement('div');
searchSection.className = 'instr-toolbar-section search-section';
searchSection.innerHTML = `
  <div class="section-title">
    <i class="fas fa-search"></i> Search
  </div>
  <input type="text" 
         class="search-input" 
         placeholder="Find tile (e.g., GS-5)">
`;
viewToolbar.appendChild(searchSection);
```

2. **Implement search logic**:
```javascript
const searchInput = searchSection.querySelector('.search-input');
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const allTiles = container.querySelectorAll('.tile-tag');
  
  allTiles.forEach(tile => {
    const text = tile.textContent.toLowerCase();
    tile.style.display = text.includes(query) ? '' : 'none';
  });
});
```

### Example: Add Layer Navigation

1. **Add nav buttons**:
```javascript
const nav = document.createElement('div');
nav.className = 'layer-navigation';
nav.innerHTML = analysis.layers.map((yLevel, idx) => `
  <button class="nav-btn" data-layer="${idx + 1}">
    Layer ${idx + 1}
  </button>
`).join('');
container.insertBefore(nav, layersContainer);
```

2. **Implement scroll-to**:
```javascript
nav.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const layerNum = btn.dataset.layer;
    const layer = container.querySelector(`[data-layer-number="${layerNum}"]`);
    layer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
```

## Styling Guidelines

### CSS Variables
Use existing variables for consistency:

```css
/* Colors */
var(--primary-color)      /* #38ab19 - green */
var(--text-primary)       /* Main text */
var(--text-secondary)     /* Muted text */
var(--bg-primary)         /* Main background */
var(--bg-secondary)       /* Secondary background */
var(--border-color)       /* Borders */

/* Spacing */
var(--spacing-xs)         /* 0.25rem */
var(--spacing-sm)         /* 0.5rem */
var(--spacing-md)         /* 1rem */
var(--spacing-lg)         /* 1.5rem */
var(--spacing-xl)         /* 2rem */

/* Radius */
var(--radius-sm)          /* 0.375rem */
var(--radius-md)          /* 0.5rem */
var(--radius-lg)          /* 0.9rem */
var(--radius-xl)          /* 1.25rem */

/* Shadows */
var(--shadow-sm)
var(--shadow-md)
var(--shadow-lg)

/* Fonts */
var(--font-body)          /* Inter */
var(--font-display)       /* Outfit */
var(--fs-xs)              /* 0.72rem */
var(--fs-sm)              /* 0.85rem */
var(--fs-md)              /* 0.95rem */
var(--fs-lg)              /* 1.05rem */
var(--fs-xl)              /* 1.25rem */
var(--fs-2xl)             /* 1.45rem */
```

### Dark Mode
Always add dark mode support:

```css
.my-new-element {
  background: var(--bg-primary);
  color: var(--text-primary);
}

[data-theme='dark'] .my-new-element {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.1);
}
```

### Responsive Design
Use consistent breakpoints:

```css
/* Desktop (default) */
.my-element { ... }

/* Tablet */
@media (max-width: 1200px) { ... }

/* Mobile */
@media (max-width: 900px) { ... }

/* Small Mobile */
@media (max-width: 600px) { ... }
```

## Testing Checklist

- [ ] All view toggles work
- [ ] All keyboard shortcuts work
- [ ] Print/PDF generates correctly
- [ ] Save PNG works for single layer
- [ ] Save All PNG works
- [ ] Copy Summary works
- [ ] Minimize/Restore works
- [ ] Close (X and ESC) works
- [ ] Tile Details expand/collapse
- [ ] Canvas renders correctly
- [ ] Axes display properly
- [ ] Labels display properly
- [ ] Textures load
- [ ] Dark mode works
- [ ] Responsive on mobile
- [ ] Print styles work
- [ ] No console errors

## Performance Tips

1. **Lazy load textures**:
   - Only load when "Show textures" is enabled
   - Cache loaded textures

2. **Optimize canvas rendering**:
   - Use `requestAnimationFrame` for updates
   - Debounce resize events

3. **Minimize reflows**:
   - Batch DOM updates
   - Use CSS transforms for animations
   - `will-change` for animated elements

4. **Virtualize long lists**:
   - If many tiles, consider virtual scrolling
   - Collapse details by default

## Common Issues

### Canvas not rendering
- Check canvas dimensions are set
- Verify context is 2d
- Ensure tiles have valid q, r coordinates

### Styles not applying
- Check CSS specificity
- Verify class names match
- Check for typos in CSS variables

### Keyboard shortcuts not working
- Ensure overlay has focus
- Check event.preventDefault() is called
- Verify key names are correct

### Print cuts off content
- Adjust page-break-inside: avoid
- Check canvas scaling
- Verify print media queries

## Future Enhancements

### Planned Features
1. Layer comparison view
2. Export to JSON/CSV
3. Tile search/filter
4. Canvas zoom controls
5. Layer diff visualization
6. Assembly animation
7. 3D preview mode
8. Custom color schemes
9. Multilingual support
10. Accessibility improvements

### API Improvements
Consider creating more modular API:

```javascript
// Current
createInstructionsRenderer({ ... }).generateLayerInstructions(analysis);

// Future
const renderer = createInstructionsRenderer({ ... });
renderer.open();
renderer.loadAnalysis(analysis);
renderer.setViewOption('showTextures', false);
renderer.exportLayer(1, 'png');
renderer.close();
```

## Contributing

When adding features:
1. Follow existing code style
2. Add JSDoc comments
3. Update this guide
4. Add tests if possible
5. Consider performance impact
6. Support dark mode
7. Make it responsive
8. Add keyboard shortcuts where appropriate

## Resources

- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- Hex coordinates: https://www.redblobgames.com/grids/hexagons/
- Print CSS: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/print
- Accessibility: https://www.w3.org/WAI/WCAG21/quickref/
