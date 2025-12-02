# Generate Instructions UI - Redesign Proposal

## Obecna funkcjonalność
- Wizualizacja warstw mapy na canvas
- Opcje widoku: Simple view, Show axes, Show textures, Show labels
- Eksport: Print/PDF, Save all layers PNG, Save individual layer
- Lista kafelków z podziałem na biomy (accordion)
- Informacje o mapie i warstwach

## Propozycja ulepszeń UI/UX

### 1. NAGŁÓWEK (Header)
**Układ:** 
```
┌─────────────────────────────────────────────────────────────┐
│  🗺️ Map Build Instructions              [Minimize] [Close]│
│  ───────────────────────────────────────────────────────    │
│  📊 Map: 15×12 tiles  │  🔢 3 layers  │  🧩 180 total tiles│
└─────────────────────────────────────────────────────────────┘
```

**Zmiany:**
- Bardziej kompaktowy nagłówek
- Stats w jednej linii z ikonami
- Przycisk Minimize (zwijanie do małego okna na dole ekranu)

### 2. GŁÓWNY TOOLBAR (Actions Bar)
**Układ - sticky bar u góry:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🎨 VIEW OPTIONS        │      📥 EXPORT                     │
│ • Simple view          │  [🖨️ Print/PDF]  [💾 Save All PNG]│
│ • Show axes            │  [📋 Copy Summary]                 │
│ • Show textures        │                                    │
│ • Show labels          │                                    │
└─────────────────────────────────────────────────────────────┘
```

**Zmiany:**
- Sticky toolbar (zawsze widoczny przy scrollu)
- Pogrupowanie: View Options | Export
- Dodanie: Copy Summary (tekst do schowka)
- Wszystkie toggle'e w jednej sekcji

### 3. WIDOK WARSTWY (Layer View)
**Układ:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📐 Layer 1 (Ground Level)                      [💾 Save PNG]│
│ ─────────────────────────────────────────────────────────   │
│ 🧩 45 tiles                                                 │
│                                                              │
│        [Canvas visualization]                                │
│                                                              │
│ ▼ Tile Details (45 tiles)                                   │
│   ├─ ▼ Grassland (20 tiles)                                │
│   │   • GS-1 at Q:0, R:0 (0°)                              │
│   │   • GS-2 at Q:1, R:0 (60°)                             │
│   │   └─ ...                                                │
│   └─ ▼ Arctic (25 tiles)                                   │
│       • AR-1 at Q:-1, R:1 (0°)                             │
│       └─ ...                                                │
└─────────────────────────────────────────────────────────────┘
```

**Zmiany:**
- Kompaktowy header warstwy
- Canvas z marginesami i cieniami (ładniejszy)
- Tile Details domyślnie zwinięte
- Lepsze grupowanie biomów
- Bardziej czytelne formatowanie

### 4. RESPONSYWNOŚĆ
- Mobile: single column, simplified toggles
- Tablet: dostosowana szerokość
- Desktop: optimal width (max 90vw)

### 5. DODATKOWE ULEPSZENIA
1. **Quick Actions per Layer:**
   - Przycisk "Zoom In" (powiększenie canvas)
   - Przycisk "Download this layer"
   
2. **Search/Filter w Tile Details:**
   - Szybkie wyszukiwanie po numerze kafelka
   - Filtrowanie po biomie

3. **Keyboard Shortcuts:**
   - ESC - Close
   - Ctrl+P - Print
   - Ctrl+S - Save All
   - Ctrl+E - Expand/Collapse All

4. **Progress Indicator:**
   - Podczas generowania: "Generating layer 2 of 3..."

5. **Dark Mode Support:**
   - Zachowanie trybu z głównej aplikacji

## Struktura HTML (nowa)
```html
<div class="instructions-overlay">
  <div class="instructions-modal">
    <!-- Header -->
    <div class="instr-header">
      <div class="instr-title">...</div>
      <div class="instr-stats">...</div>
      <div class="instr-header-actions">...</div>
    </div>
    
    <!-- Sticky Toolbar -->
    <div class="instr-toolbar sticky">
      <div class="instr-toolbar-section view-options">...</div>
      <div class="instr-toolbar-section export-actions">...</div>
    </div>
    
    <!-- Layers -->
    <div class="instr-layers-container">
      <div class="instr-layer" data-layer="1">
        <div class="instr-layer-header">...</div>
        <div class="instr-layer-canvas-wrap">
          <canvas></canvas>
        </div>
        <details class="instr-layer-tiles">
          <summary>Tile Details (45 tiles)</summary>
          <div class="instr-tiles-content">...</div>
        </details>
      </div>
    </div>
  </div>
</div>
```

## Kolory i Style
- Wykorzystanie istniejącej palety CSS variables
- Bardziej spójne z głównym UI aplikacji
- Lepsze kontrasty dla czytelności
- Subtelne animacje (fade in, smooth scroll)

## Priorytet zmian
1. ✅ Reorganizacja toolbara (sticky)
2. ✅ Lepszy layout header
3. ✅ Kompaktowy design warstw
4. ⭐ Keyboard shortcuts
5. ⭐ Copy to clipboard
6. 💡 Search/Filter tiles (future)
