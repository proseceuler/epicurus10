# Bklit charts on feat/bklit-data-viz

Focus Analytics and Praxis season map import from `@/charts/*` (Bklit UI).

## Install chart sources (required once)

`components.json` already has the `@bklit` registry. From the repo root:

```bash
npx shadcn@latest add @bklit/bar-chart @bklit/area-chart @bklit/heatmap-chart
```

That pulls Visx-based sources into your components path. If the CLI writes under `src/components/ui` or similar, either move them to `src/charts` or update imports in:

- `src/pages/AnalyticsPage.tsx`
- `src/components/PraxisHeatmap.tsx`

Zinc chart tokens live in `src/charts/chart-tokens.css` (imported from `App.tsx`).

## Wired surfaces

| Surface | Bklit components |
|---|---|
| Focus Analytics | `BarChart` + `Bar` / `AreaChart` + `Area` |
| Praxis (Ataraxia) | `HeatmapChart` + cells/axes/tooltip/legend |

## Deps

`package.json` already lists `@visx/*`, `d3-array`, `d3-shape`, `@number-flow/react`.
