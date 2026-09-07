import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  TLBaseShape,
  Rectangle2d,
  resizeBox,
  type TLResizeInfo,
} from 'tldraw';

export type TableShape = TLBaseShape<
  'table',
  {
    w: number;
    h: number;
    rows: number;
    cols: number;
    cells: string; // JSON string[][]
  }
>;

function parseCells(raw: string, rows: number, cols: number): string[][] {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      const grid: string[][] = [];
      for (let r = 0; r < rows; r++) {
        const row = Array.isArray(data[r]) ? data[r] : [];
        grid.push(Array.from({ length: cols }, (_, c) => String(row[c] ?? '')));
      }
      return grid;
    }
  } catch {
    /* empty */
  }
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
}

export class TableShapeUtil extends BaseBoxShapeUtil<TableShape> {
  static override type = 'table' as const;
  static override props = {
    w: T.number,
    h: T.number,
    rows: T.number,
    cols: T.number,
    cells: T.string,
  };

  getDefaultProps(): TableShape['props'] {
    const rows = 3;
    const cols = 3;
    return {
      w: 320,
      h: 160,
      rows,
      cols,
      cells: JSON.stringify(Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))),
    };
  }

  getGeometry(shape: TableShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override canEdit = () => true;
  override canResize = () => true;
  override isAspectRatioLocked = () => false;

  override onResize(shape: TableShape, info: TLResizeInfo<TableShape>) {
    return resizeBox(shape, info);
  }

  component(shape: TableShape) {
    const { w, h, rows, cols, cells } = shape.props;
    const grid = parseCells(cells, rows, cols);
    const cellW = w / cols;
    const cellH = h / rows;
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(24,24,27,0.2)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, width: '100%', height: '100%' }}>
          {grid.map((row, ri) =>
            row.map((cell, ci) => (
              <div
                key={`${ri}-${ci}`}
                style={{
                  borderRight: ci < cols - 1 ? '1px solid rgba(24,24,27,0.12)' : undefined,
                  borderBottom: ri < rows - 1 ? '1px solid rgba(24,24,27,0.12)' : undefined,
                  minHeight: cellH,
                  minWidth: cellW,
                  padding: 6,
                  fontSize: 12,
                  color: '#18181b',
                  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                }}
              >
                {cell || <span style={{ color: '#a1a1aa' }}>…</span>}
              </div>
            )),
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: TableShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}
