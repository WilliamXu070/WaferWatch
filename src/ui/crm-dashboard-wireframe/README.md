# WaferWatch CRM Dashboard Wireframe (React/Tailwind Generation)

## Inputs used for this rerender

- Figma source metadata in `figma-source.ts` (file key, frame name, target node).
- Existing in-repo data contract from `mock-data.ts`, `copy.ts`, `layout.ts`, `types.ts`.
- Visual truth source used for spacing/color parity: `/waferwatch-crm-dashboard-wireframe.png` and the existing route shell.

`get_design_context`, `get_styles`, `get_variable_defs`, `export_tokens`, and `get_nodes_info` were not available in this run, so any missing design-system fields are derived from the local screenshot + prior constants.

## Component mapping

- `CrmDashboardWireframe` (root feature component): shell, top bar, metric band, board, selected panel.
- `CrmDashboardToolbar`: search field + action buttons.
- `CrmWorkflowBoard`: four workflow columns as semantic grid columns.
- `CrmWorkflowColumn`: per-stage container, header, and card stack.
- `CrmWaferCard`: wafer cards with title/meta/location/handler/due and status token-driven chip.
- `CrmSelectedWaferPanel`: right-side details rail and next-action block.

## Tailwind class mapping decisions

- Canvas width is fixed in design to `1154px`:
  - `max-w-[1154px]` on shell container.
- Frame/canvas visual depth:
  - `bg-[#f6f6f2]`, `border-[#d6d6d0]`, `rounded-[20px]`, `shadow-[0_14px_38px_-22px_rgba(20,20,20,0.35)]`.
- Top bar, cards, columns, panel:
  - `rounded-[14px]` and `border border-ww-border` with compact paddings from original screenshot.
- Typography:
  - Section labels: `text-[11px]`, `font-semibold`, `tracking-[0.08em]`.
  - Page heading: `text-[36px]`.
  - Metric values: `text-3xl`.

## Unresolved assumptions to resolve with real MCP payload

1. Exact token naming/schema for style variables (spacing, font scale, radii).
2. Precise `selectedCard` background and status chip styles from the selected state.
3. Whether the workflow column backgrounds are state-tinted globally or only per-card accent.
4. Keyboard/focus interactions for cards (wireframe render currently static).

## Next step when MCP payload exists

Replace:
- fixed hex literals with CSS variables from `export_tokens`/`get_variable_defs`.
- node-level class mapping with generated `classNameByNode` derived from `get_design_context`.
- side-effects on card selection once behavior state is specified.

