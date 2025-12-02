# Generate Instructions - Screenshot Guide

## Screenshots to Create

### 1. Full View - Desktop
**Filename**: `instructions_full_desktop.png`
**Description**: Complete instructions window showing:
- Header with title and stats
- Sticky toolbar with all options
- 2-3 visible layers
- One layer expanded showing tile details
- Dark mode OFF

**Important elements to highlight**:
- Minimize button
- Copy Summary button
- View toggles (with some enabled)
- Layer canvas with axes
- Collapsible tile details

---

### 2. Dark Mode
**Filename**: `instructions_dark_mode.png`
**Description**: Same view as #1 but in dark mode
- Shows proper contrast
- Highlight dark theme colors
- Canvas background dark

---

### 3. Sticky Toolbar
**Filename**: `instructions_sticky_toolbar.gif`
**Description**: Animated GIF showing:
- Scrolling down through layers
- Toolbar stays at top
- Smooth scroll behavior

---

### 4. Keyboard Shortcuts
**Filename**: `instructions_keyboard_shortcuts.png`
**Description**: Overlay showing keyboard shortcuts:
- ESC to close
- Ctrl+P to print
- Ctrl+S to save
- Ctrl+E to expand/collapse

**Create overlay graphic with**:
```
┌─────────────────────────────┐
│  Keyboard Shortcuts         │
├─────────────────────────────┤
│  ESC     Close              │
│  Ctrl+P  Print/PDF          │
│  Ctrl+S  Save PNG           │
│  Ctrl+E  Expand/Collapse    │
└─────────────────────────────┘
```

---

### 5. Copy Summary
**Filename**: `instructions_copy_summary.gif`
**Description**: Animated GIF showing:
1. Click "Copy Summary" button
2. Button changes to checkmark
3. Success state (2 seconds)
4. Return to normal

---

### 6. Minimize/Restore
**Filename**: `instructions_minimize.gif`
**Description**: Animated GIF showing:
1. Full window
2. Click minimize button
3. Window collapses to 120px
4. Click restore button
5. Window expands back

---

### 7. View Toggles
**Filename**: `instructions_view_toggles.gif`
**Description**: Animated GIF showing:
1. Start with all toggles ON
2. Toggle "Simple view" - canvas updates
3. Toggle "Show axes" - axes disappear
4. Toggle "Show textures" - colors instead
5. Toggle "Show labels" - labels disappear

---

### 8. Layer Details
**Filename**: `instructions_layer_details.png`
**Description**: Zoomed view of expanded layer showing:
- Layer header with title and stats
- Canvas with grid, axes, labels
- Expanded tile details
- Biome sections with tiles
- Tile format: "GS-5 at Q:0, R:0 (60°)"

---

### 9. Responsive - Tablet
**Filename**: `instructions_tablet.png`
**Description**: Instructions on tablet (900px width):
- Vertical toolbar layout
- Stacked sections
- Adjusted spacing

---

### 10. Responsive - Mobile
**Filename**: `instructions_mobile.png`
**Description**: Instructions on mobile (600px width):
- Compact header
- Vertical stats
- Full-width buttons
- Stacked layer headers

---

### 11. Print Preview
**Filename**: `instructions_print_preview.png`
**Description**: Browser print preview showing:
- Clean layout without toolbar
- Each layer on separate page
- Proper page breaks
- A4 format

**Settings visible**:
- Destination: Save as PDF
- Layout: Portrait
- Paper: A4

---

### 12. Canvas Comparison
**Filename**: `instructions_canvas_comparison.png`
**Description**: Side-by-side comparison:

**Left**: Simple view OFF
- Shaded Q/R bands
- Rich visual

**Right**: Simple view ON
- Clean flat colors
- No bands

---

### 13. Texture vs Color
**Filename**: `instructions_texture_vs_color.png`
**Description**: Side-by-side comparison:

**Left**: Show textures ON
- Detailed tile textures
- Realistic appearance

**Right**: Show textures OFF
- Solid colors per biome
- Clean, minimal

---

### 14. Before/After Redesign
**Filename**: `instructions_before_after.png`
**Description**: Split screen showing:

**Left** (v1.0):
- Old layout
- Inline toggles
- Basic design

**Right** (v2.0):
- New layout
- Sticky toolbar
- Modern design

---

### 15. Export Options
**Filename**: `instructions_export_options.png`
**Description**: Toolbar export section highlighted:
- Print/PDF button
- Save All PNG button
- Copy Summary button
- Hover states

---

## Screenshot Best Practices

### Settings
- Browser: Chrome (latest)
- Window size: 1920×1080 for desktop
- Scale: 100%
- Hide browser UI (F11)
- Clear background

### Content
- Use a realistic map (15×12 tiles)
- Mix of biomes (Grassland, Arctic, Desert)
- 3 layers minimum
- Varied tile rotations

### Annotations
Use callout boxes with arrows for:
- New features
- Important buttons
- Keyboard shortcuts
- State changes

### Colors for Annotations
- Red: Important actions
- Blue: Information
- Green: Success states
- Yellow: Tips/warnings

## Animated GIFs

### Tools
- ScreenToGif (Windows)
- LICEcap (Mac/Windows)
- Peek (Linux)

### Settings
- FPS: 15-20
- Duration: 3-5 seconds
- Loop: Infinite
- Optimize: Yes
- Max size: 5MB

### Timing
1. Show initial state (1s)
2. Perform action (1-2s)
3. Show result (1s)
4. Pause before loop (0.5s)

## Video Tutorial (Optional)

### Full Walkthrough
**Filename**: `instructions_walkthrough.mp4`
**Duration**: 3-5 minutes

**Script**:
1. **Intro** (0:00-0:30)
   - What is Generate Instructions
   - When to use it

2. **Opening** (0:30-1:00)
   - Click button in toolbar
   - Overview of window

3. **Header & Stats** (1:00-1:30)
   - Explain map info
   - Minimize feature

4. **Toolbar** (1:30-2:30)
   - View options demo
   - Export actions demo
   - Copy summary demo

5. **Layers** (2:30-3:30)
   - Canvas explanation
   - Tile details
   - Download per layer

6. **Keyboard Shortcuts** (3:30-4:00)
   - Demo each shortcut

7. **Export** (4:00-4:30)
   - Print/PDF
   - Save PNG

8. **Outro** (4:30-5:00)
   - Tips
   - Resources

## Social Media Snippets

### Twitter/X
**Image**: instructions_dark_mode.png
**Text**:
```
✨ New Instructions UI in Lorescape Map Builder!

🎨 Sticky toolbar
⌨️ Keyboard shortcuts
💾 Quick export
🌙 Dark mode support

Build your maps with style! 
#gamedev #lorescape
```

### Reddit
**Post Title**: "Redesigned the Instructions UI in our hex map builder"
**Images**: Album with screenshots 1, 2, 8, 14
**Text**: [Link to User Guide]

### YouTube
**Thumbnail**: instructions_full_desktop.png with text overlay:
```
GENERATE
INSTRUCTIONS
New UI Redesign
```

## Documentation Images

### User Guide
- Screenshot #1 (overview)
- Screenshot #4 (shortcuts)
- Screenshot #8 (details)

### Developer Guide
- DOM structure diagram
- Canvas coordinate diagram
- Component hierarchy

### Quick Reference
- Screenshot #4 (shortcuts)
- Screenshot #15 (export options)

## Testing Checklist

Before taking screenshots:

- [ ] Clear console (no errors)
- [ ] Proper map loaded (15×12, 3 layers)
- [ ] Good biome distribution
- [ ] Some tiles rotated
- [ ] Browser zoom at 100%
- [ ] Hide browser toolbars (F11)
- [ ] Cursor not visible (unless showing click)
- [ ] Clean desktop background
- [ ] Good lighting/contrast

## File Organization

```
screenshots/
├── desktop/
│   ├── instructions_full_desktop.png
│   ├── instructions_dark_mode.png
│   └── ...
├── mobile/
│   ├── instructions_tablet.png
│   └── instructions_mobile.png
├── gifs/
│   ├── instructions_sticky_toolbar.gif
│   ├── instructions_copy_summary.gif
│   └── ...
└── comparisons/
    ├── instructions_before_after.png
    ├── instructions_canvas_comparison.png
    └── ...
```

## Captions/Alt Text

Always include descriptive alt text:

### Example 1
```html
<img 
  src="instructions_full_desktop.png" 
  alt="Lorescape Map Builder instructions window showing header with map statistics, sticky toolbar with view options and export buttons, and three map layers with hexagonal tile visualizations"
/>
```

### Example 2
```html
<img 
  src="instructions_copy_summary.gif" 
  alt="Animation showing user clicking Copy Summary button, button changing to checkmark briefly, then returning to normal state"
/>
```

## Final Checklist

Before publishing screenshots:

- [ ] All screenshots taken
- [ ] GIFs created and optimized
- [ ] Alt text written
- [ ] Files organized
- [ ] Names consistent
- [ ] Sizes optimized (<500KB images, <5MB GIFs)
- [ ] Formats correct (PNG for stills, GIF for animations)
- [ ] Quality checked (clear, readable)
- [ ] Annotations added where needed
- [ ] Copyright/watermark (if required)

---

**Note**: Screenshots should be updated whenever UI significantly changes.
**Last Updated**: October 5, 2025
