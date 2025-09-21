# AI Memory Dashboard Design Guidelines

## Design Approach
**Reference-Based Approach**: Drawing inspiration from modern productivity tools like Notion, Linear, and Microsoft 365 admin dashboards. This utility-focused application prioritizes efficiency and data management while maintaining visual appeal.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Light mode: 236 39% 12% (deep slate)
- Dark mode: 225 71% 95% (soft white)

**Background Colors:**
- Light mode: 0 0% 98% (warm white)
- Dark mode: 224 71% 4% (deep navy)

**Accent Colors:**
- Success: 142 69% 58% (emerald green)
- Warning: 45 93% 58% (amber)
- Error: 0 72% 51% (red)

### Typography
**Primary Font**: Inter (Google Fonts)
- Headings: 600-700 weight
- Body text: 400-500 weight
- Small text: 400 weight

**Font Scale:**
- H1: text-3xl (30px)
- H2: text-2xl (24px) 
- H3: text-xl (20px)
- Body: text-base (16px)
- Small: text-sm (14px)

### Layout System
**Spacing Units**: Consistent use of Tailwind units 2, 4, 8, 16
- Component padding: p-4, p-6
- Section margins: m-8, m-16
- Card gaps: gap-4, gap-6

### Component Library

#### Memory Cards
- Clean card design with subtle shadows
- Memory preview with source app icon
- Timestamp and tags display
- Quick action buttons (edit, delete)

#### App Integration Panels
- Toggle switches for each app
- App logos prominently displayed
- Status indicators (connected/disconnected)
- Configuration dropdowns for advanced settings

#### Navigation
- Sidebar navigation with sections:
  - Dashboard overview
  - All memories
  - App integrations
  - Settings
- Top header with search and user profile

#### Data Display
- Sortable memory table view option
- Filter chips for source, date, tags
- Infinite scroll or pagination
- Empty states with helpful illustrations

#### Forms & Modals
- Clean modal overlays for memory editing
- Form validation with inline feedback
- Autocomplete for tags and categories
- Rich text editor for memory content

### App Integration Visual Treatment

#### API-Based Apps Section
**Microsoft Apps:** Outlook, OneDrive, SharePoint, Teams, Calendar
**Google Apps:** Gmail, Drive, Calendar, Docs, Sheets, Photos

#### Browser Extension Apps Section
**Productivity:** ChatGPT, Claude, Notion, Linear, GitHub
**Social:** Twitter, LinkedIn, Reddit
**Others:** YouTube, Amazon, Netflix

Each app integration displays:
- Official app icon/logo
- Connection status badge
- Last sync timestamp
- Configuration gear icon

### Key Design Principles
1. **Information Hierarchy**: Clear visual separation between memory content and app management
2. **Scan-ability**: Easy to quickly identify memory sources and dates
3. **Consistency**: Unified interaction patterns across all sections
4. **Accessibility**: High contrast ratios and keyboard navigation support
5. **Performance**: Optimized for large memory datasets with virtual scrolling

### Interactive Elements
- Hover states for cards and buttons
- Loading states for sync operations
- Success/error toasts for user actions
- Smooth transitions between views
- Progressive disclosure for advanced features

The design balances professional functionality with modern aesthetics, ensuring users can efficiently manage their AI memory layer while enjoying a polished experience.