# 🗺️ Generate Instructions - Feature Documentation

> **Modern, intuitive UI for generating step-by-step map build instructions for Lorescape Map Builder**

![Version](https://img.shields.io/badge/version-2.0.0-green)
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

This document consolidates all documentation regarding the "Generate Instructions" feature, including user guides, developer documentation, and changelogs.

---

## 📋 Table of Contents

- [Overview](#overview)
- [✨ Features](#-features)
- [🚀 User Guide](#-user-guide)
  - [Quick Start](#quick-start)
  - [Interface Overview](#interface-overview)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Export Options](#export-options)
  - [Tips & Best Practices](#tips--best-practices)
- [👨‍💻 Developer Guide](#-developer-guide)
  - [Architecture](#architecture)
  - [Key Files](#key-files)
  - [Customization](#customization)
- [📅 Version History](#-version-history)

---

## Overview

The **Generate Instructions** feature allows users to create step-by-step building guides for their hex-based maps. It analyzes the map layers and generates a visual breakdown of each layer, complete with tile lists, coordinates, and export options.

---

## ✨ Features

### 🎨 Modern UI
- **Sticky Toolbar**: Always accessible view and export options during scroll.
- **Clean Layout**: Organized sections with collapsible tile details.
- **Dark Mode**: Full support with smooth transitions, adapting to the main app theme.
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile.

### 🎯 Core Functionality
- **Layer Visualization**: Interactive canvas rendering for each layer (Ground, +1, +2, etc.).
- **View Options**: Toggle axes, textures, labels, and simple mode.
- **Export Power**: Export as PDF, download individual layer PNGs, or batch download all layers.
- **Clipboard Summary**: Quickly copy map statistics and tile counts to clipboard.

### 📱 Accessibility
- **Keyboard Navigation**: Full keyboard support for common actions.
- **High Contrast**: Readable in all lighting conditions.
- **ARIA Labels**: Screen reader support.

---

## 🚀 User Guide

### Quick Start

1. **Build your map** in the main editor.
2. Click the **"Generate instructions"** button in the top toolbar.
3. **Review** each layer in the overlay window.
4. **Export** your instructions using the toolbar options.

### Interface Overview

#### Header
- Displays map statistics: Size, Layer count, Total tiles.
- **Minimize**: Collapses the window to the bottom of the screen.
- **Close**: Exits the instructions view.

#### Toolbar (Sticky)
**View Options:**
- ☑️ **Simple view**: Flat layout without shading (good for ink saving).
- ☑️ **Show axes**: Displays Q/R coordinate axes.
- ☑️ **Show textures**: Renders actual tile textures (uncheck for faster printing).
- ☑️ **Show labels**: Displays tile IDs (e.g., "GS-5") on the map.

**Export Options:**
- 🖨️ **Print / PDF**: Opens browser print dialog (optimized for A4 Portrait).
- 💾 **Save All PNG**: Downloads a ZIP or individual files for all layers.
- 📋 **Copy Summary**: Copies a text summary of the map to your clipboard.

#### Layer Cards
Each layer is presented as a card containing:
- **Visual Canvas**: The map layer rendered on a hex grid.
- **Tile Details**: A collapsible list of all tiles in that layer, grouped by biome.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `ESC` | Close instructions window |
| `Ctrl + P` | Print / Save as PDF |
| `Ctrl + S` | Download all layers as PNG |
| `Ctrl + E` | Expand/Collapse all tile lists |

### Export Options

1. **Print / PDF**:
   - Use **Portrait** layout and **A4** paper size for best results.
   - Disable "Show textures" to reduce file size and save ink.
   - Each layer is automatically formatted to fit on one page.

2. **PNG Images**:
   - Click the 💾 icon on a specific layer header to download just that layer.
   - Click "Save All PNG" in the toolbar to download all layers at once.
   - Files are named based on the map name (e.g., `MyMap_layer-1.png`).

### Tips & Best Practices

- **Naming**: Name your map in the main app header before generating instructions to ensure exported files have meaningful names.
- **Performance**: For very large maps, disable "Show textures" to speed up rendering and printing.
- **Verification**: Use the "Show labels" option to verify specific tile placements against the tile list.
- **Workflow**: Use "Copy Summary" to quickly share map stats in Discord or text notes.

---

## 👨‍💻 Developer Guide

### Architecture

The feature is built using Vanilla JavaScript and CSS, leveraging HTML Canvas for rendering.

**File Structure:**
```
src/app/instructions/
└── instructionsRenderer.js    # Main logic and rendering
style.css                      # Styles (search for "INSTRUCTIONS")
```

**Key Components:**
- **Overlay**: Modal backdrop.
- **Container**: Scrollable wrapper.
- **Header & Toolbar**: Sticky navigation elements.
- **Layers Container**: Holds individual layer cards.
- **Layer Card**: Contains the canvas and tile details.

### Key Functions

- `createInstructionsRenderer({ instructionsLog, biomeSets, placedTiles })`: Factory function to initialize the renderer.
- `generateLayerInstructions(analysis)`: Main entry point that builds the UI from map data.
- `createLayerVisualization(...)`: Renders a single layer card.
- `drawHexagonalGrid(...)`: Core canvas drawing logic.

### Customization

**CSS Variables**:
The UI uses CSS variables for easy theming.
```css
:root {
  --primary-color: #38ab19;
  --bg-primary: #ffffff;
  --text-primary: #333333;
}
```

**Adding New Features**:
1. Modify `instructionsRenderer.js` to add new UI elements.
2. Register event listeners in the `createInstructionsWindow` function.
3. Update `style.css` for new classes.

**Coordinate System**:
Uses axial hex coordinates (Q, R).
- `x = hexSize * (3/2 * q)`
- `y = hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r)`

---

## 📅 Version History

### v2.0.0 (2025-10-05) - Major UI Redesign
- **New**: Sticky toolbar, Dark mode support, Copy Summary, Minimize/Maximize.
- **Improved**: Canvas rendering, Print styles, Accessibility.
- **Changed**: Complete DOM structure overhaul for better responsiveness.

### v1.0.0
- Initial release with basic layer visualization and export.

---

*Generated from project instruction files.*
