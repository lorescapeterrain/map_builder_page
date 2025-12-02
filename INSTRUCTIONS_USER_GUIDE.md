# 🗺️ Generate Instructions - User Guide

## Co to jest?

Widok **Generate Instructions** to narzędzie do tworzenia instrukcji budowy mapy krok po kroku. Generuje wizualizację każdej warstwy (layer) z dokładną listą potrzebnych kafelków.

## Jak otworzyć?

1. Zbuduj swoją mapę w głównym widoku
2. Kliknij przycisk **"Generate instructions"** w górnym toolbarze
3. Okno z instrukcjami otworzy się jako overlay

## Co zobaczysz?

### 📊 Header (góra okna)
- **Tytuł**: "Map Build Instructions"
- **Statystyki**:
  - **Map Size**: wymiary mapy (np. 15×12)
  - **Layers**: liczba warstw
  - **Total Tiles**: łączna liczba kafelków
- **Przyciski**:
  - **Minimize** - zminimalizuj okno (pozostanie na dole ekranu)
  - **Close (X)** - zamknij okno

### 🎨 Toolbar (zawsze widoczny przy scrollu)

#### Lewa sekcja - View Options:
- ☑️ **Simple view** - uproszczony widok bez nakładek cieniowania
- ☑️ **Show axes** - wyświetl osie Q/R wokół mapy
- ☑️ **Show textures** - wyświetl tekstury kafelków (zamiast kolorów)
- ☑️ **Show labels** - wyświetl etykiety na kafelkach (np. "GS-5")

#### Prawa sekcja - Export:
- 🖨️ **Print / PDF** - drukuj lub zapisz jako PDF
- 💾 **Save All PNG** - pobierz wszystkie warstwy jako obrazy PNG
- 📋 **Copy Summary** - skopiuj podsumowanie do schowka

### 📐 Warstwy (Layers)

Każda warstwa jest wyświetlana jako osobna karta:

```
┌─────────────────────────────────┐
│ 📐 Layer 1 (Ground Level)  [💾] │
│ 🧩 45 tiles                     │
│                                 │
│   [Wizualizacja canvas]         │
│                                 │
│ ▼ Tile Details (45 tiles)       │
│   └─ [Lista kafelków]           │
└─────────────────────────────────┘
```

#### Informacje o warstwie:
- **Numer warstwy** (np. Layer 1)
- **Poziom** (Ground Level / +1 / +2 itd.)
- **Liczba kafelków**
- **Przycisk Download** (💾) - pobierz tylko tę warstwę

#### Canvas (wizualizacja):
- Sześciokątna siatka z kafelkami
- Opcjonalne osie Q/R
- Opcjonalne etykiety
- Opcjonalne tekstury

#### Tile Details:
- **Domyślnie zwinięte** - kliknij aby rozwinąć
- **Lista kafelków** pogrupowana po biomach:
  ```
  ▼ Grassland (20 tiles)
    • GS-1 at Q:0, R:0 (0°)
    • GS-2 at Q:1, R:0 (60°)
    ...
  
  ▼ Arctic (25 tiles)
    • AR-1 at Q:-1, R:1 (0°)
    ...
  ```

## 🎹 Skróty klawiszowe

| Skrót | Akcja |
|-------|-------|
| **ESC** | Zamknij okno instrukcji |
| **Ctrl+P** | Drukuj / Zapisz jako PDF |
| **Ctrl+S** | Zapisz wszystkie warstwy jako PNG |
| **Ctrl+E** | Rozwiń/Zwiń wszystkie listy kafelków |

## 💡 Wskazówki

### Drukowanie/PDF:
1. Naciśnij **Ctrl+P** lub kliknij **Print / PDF**
2. W oknie drukowania wybierz:
   - **Destination**: "Save as PDF" (Chrome)
   - **Layout**: Portrait (pionowo)
   - **Paper size**: A4
3. Każda warstwa będzie na osobnej stronie

### Zapisywanie obrazów:
1. **Pojedyncza warstwa**: 
   - Kliknij ikonę 💾 przy warstwie
   - Plik zostanie pobrany jako `map_layer-1.png`

2. **Wszystkie warstwy**: 
   - Kliknij **Save All PNG** w toolbarze
   - Wszystkie warstwy zostaną pobrane jako osobne pliki

### Copy Summary:
1. Kliknij **Copy Summary** w toolbarze
2. Tekst z podsumowaniem zostanie skopiowany:
   ```
   Map Build Instructions
   Map Size: 15×12
   Layers: 3
   Total Tiles: 180
   
   Layer 1 (Ground): 60 tiles
   Layer 2 (+1): 60 tiles
   Layer 3 (+2): 60 tiles
   ```
3. Wklej (Ctrl+V) gdzie potrzebujesz

### View Options:
- **Simple view** - użyj dla czystego, minimalistycznego wyglądu
- **Show textures** - wyłącz jeśli chcesz szybciej drukować (mniejszy rozmiar PDF)
- **Show labels** - włącz aby widzieć dokładne numery kafelków

## 📱 Mobile/Tablet

Na mniejszych ekranach:
- Toolbar przełączy się na layout pionowy
- Statystyki będą wyświetlane w kolumnie
- Przyciski eksportu na pełną szerokość
- Wszystkie funkcje nadal dostępne

## 🌙 Dark Mode

Okno automatycznie dostosuje się do trybu ciemnego z głównej aplikacji:
- Jasny motyw dla drukowania
- Ciemny motyw dla pracy na ekranie

## ❓ FAQ

**Q: Czy mogę edytować mapę podczas gdy instrukcje są otwarte?**
A: Nie, instrukcje są "snapshot" mapy w momencie generowania. Zamknij okno i wygeneruj ponownie aby zobaczyć zmiany.

**Q: Gdzie są zapisywane pliki PNG?**
A: W folderze Downloads przeglądarki (domyślnie).

**Q: Czy mogę zmienić nazwę plików?**
A: Tak, nazwa jest oparta o pole "Map Name" w headerze aplikacji. Zmień nazwę mapy przed generowaniem instrukcji.

**Q: Dlaczego niektóre warstwy są puste?**
A: Jeśli warstwa nie ma kafelków, nie będzie wyświetlona w instrukcjach.

**Q: Czy mogę eksportować do formatu innego niż PNG/PDF?**
A: Obecnie tylko PNG i PDF są wspierane. W przyszłości planujemy dodać JSON, CSV.

## 🔄 Workflow

Typowy workflow budowy mapy:

1. **Buduj** mapę w głównym widoku
2. **Generuj** instrukcje (przycisk w toolbarze)
3. **Dostosuj** widok (toggles w toolbarze)
4. **Eksportuj**:
   - **Dla siebie**: Save All PNG
   - **Dla innych**: Print/PDF
   - **Do notatek**: Copy Summary
5. **Zamknij** (ESC) i kontynuuj budowę

## 🎓 Best Practices

1. **Nazewnictwo**: Zawsze nadaj mapie nazwę przed generowaniem (pole w headerze)
2. **View Options**: Dla drukowania wyłącz tekstury (szybszy, mniejszy PDF)
3. **Labels**: Włącz labels przed eksportem dla łatwiejszej identyfikacji
4. **Sprawdzenie**: Przejrzyj każdą warstwę przed drukowaniem
5. **Backup**: Zapisz PNG jako backup przed drukowaniem

---

**Wsparcie**: Jeśli masz pytania lub sugestie, zgłoś issue w repozytorium projektu.
