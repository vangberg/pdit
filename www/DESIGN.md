# pdit Design System

Visual identity inspired by **Wohnpark Alterlaa** (Vienna brutalist housing with bold colored balconies) and **Waffle House** (warm American diner aesthetic).

## Philosophy

- Bold, confident, friendly
- Geometric color blocks over gradients
- Sharp edges over rounded corners
- High contrast, no subtlety
- Warm and inviting, not cold and corporate

## Color Palette

### Primary Colors

| Name | Hex | Usage |
|------|-----|-------|
| Waffle Yellow | `#FFD700` | Nav background, code highlighting, primary accent |
| Alterlaa Red | `#E63946` | Links, first accent, hover states |
| Alterlaa Blue | `#457B9D` | Secondary accent, link hover |
| Alterlaa Teal | `#2A9D8F` | Tertiary accent |
| Warm Orange | `#F4A261` | Quaternary accent |

### Neutrals

| Name | Hex | Usage |
|------|-----|-------|
| Black | `#1a1a1a` | Text, borders, code backgrounds |
| Cream | `#FFFEF5` | Page background |
| Warm Hover | `#FFF8DC` | Table row hover, subtle highlights |
| Gray | `#555` | Subtitles, secondary text |
| Light Gray | `#888` | Dates, metadata |

## Typography

- **Font Family**: `system-ui, -apple-system, sans-serif`
- **Monospace**: `ui-monospace, monospace`
- **Weights**: 400 (body), 600 (links, emphasis), 700 (headings), 800 (titles)
- **Letter Spacing**: `-0.02em` to `-0.03em` for large headings

## Components

### Navigation Bar

```css
nav {
  background: #FFD700;
  border-bottom: 3px solid #1a1a1a;
}

.logo {
  font-family: ui-monospace, monospace;
  font-size: 1.5rem;
  font-weight: 800;
  color: #1a1a1a;
}

.logo:hover {
  color: #E63946;
}
```

### Headings with Color Squares

Each heading gets a small colored square before it, cycling through the palette:

```css
h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

h2::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #E63946;
}

h2:nth-of-type(2)::before { background: #FFD700; }
h2:nth-of-type(3)::before { background: #457B9D; }
h2:nth-of-type(4)::before { background: #2A9D8F; }
h2:nth-of-type(5)::before { background: #F4A261; }
/* Then cycle back */
```

### Code Blocks

Dark background with rainbow stripe (Alterlaa balcony colors):

```css
pre {
  background: #1a1a1a;
  padding: 1.25rem;
  border-radius: 0;
  position: relative;
}

pre::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg,
    #E63946 25%,
    #FFD700 25%, #FFD700 50%,
    #457B9D 50%, #457B9D 75%,
    #2A9D8F 75%
  );
}

pre code {
  color: #fff;
}
```

### Inline Code

```css
code {
  background: #1a1a1a;
  color: #FFD700;
  padding: 0.2em 0.4em;
  border-radius: 3px;
}
```

### List Items with Color Bullets

```css
ul {
  list-style: none;
  padding-left: 0;
}

li {
  padding-left: 1.5rem;
  position: relative;
}

li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 8px;
  height: 8px;
  background: #FFD700;
  border: 2px solid #1a1a1a;
}

li:nth-child(2)::before { background: #E63946; }
li:nth-child(3)::before { background: #457B9D; }
li:nth-child(4)::before { background: #2A9D8F; }
li:nth-child(5)::before { background: #F4A261; }
```

### Links

```css
a {
  color: #E63946;
  font-weight: 600;
}

a:hover {
  color: #457B9D;
}
```

### Section Dividers

Use thick black borders instead of subtle gray lines:

```css
border-top: 3px solid #1a1a1a;
```

### Tables

```css
th {
  border-bottom: 3px solid #1a1a1a;
  font-weight: 700;
}

td {
  border-bottom: 1px solid #ddd;
}

tr:hover td {
  background: #FFF8DC;
}
```

## Design Tokens (CSS Variables)

```css
:root {
  /* Primary */
  --color-yellow: #FFD700;
  --color-red: #E63946;
  --color-blue: #457B9D;
  --color-teal: #2A9D8F;
  --color-orange: #F4A261;

  /* Neutrals */
  --color-black: #1a1a1a;
  --color-cream: #FFFEF5;
  --color-warm-hover: #FFF8DC;
  --color-gray: #555;
  --color-gray-light: #888;

  /* Semantic */
  --color-link: var(--color-red);
  --color-link-hover: var(--color-blue);
  --color-code-bg: var(--color-black);
  --color-code-text: var(--color-yellow);

  /* Borders */
  --border-thick: 3px solid var(--color-black);
  --border-thin: 1px solid #eee;

  /* Rainbow gradient */
  --gradient-rainbow: linear-gradient(90deg,
    var(--color-red) 25%,
    var(--color-yellow) 25%, var(--color-yellow) 50%,
    var(--color-blue) 50%, var(--color-blue) 75%,
    var(--color-teal) 75%
  );
}
```

## Key Principles

1. **No rounded corners** on major elements (code blocks, nav) - brutalist geometry
2. **Thick black borders** (3px) for emphasis, thin borders (1px) for separation
3. **Color cycling** - rotate through the 5-color palette for lists and headings
4. **Yellow is primary** - use it for nav, code highlighting, first bullet
5. **Red for interaction** - links and hover states
6. **Dark code blocks** - high contrast, professional, but with playful rainbow stripe
7. **Warm background** - cream (#FFFEF5) not white, feels friendlier
