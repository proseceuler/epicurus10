import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  TLBaseShape,
  Rectangle2d,
  resizeBox,
  type TLResizeInfo,
} from 'tldraw';
import type { CSSProperties } from 'react';

export type TableShape = TLBaseShape<
  'table',
  {
    w: number;
    h: number;
    rows: number;
    cols: number;
    cells: string;
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
      w: 360,
      h: 180,
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
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const editor = this.editor;

    const updateCell = (ri: number, ci: number, value: string) => {
      const next = parseCells(cells, rows, cols);
      next[ri][ci] = value;
      editor.updateShape({
        id: shape.id,
        type: 'table',
        props: { cells: JSON.stringify(next) },
      });
    };

    const setDims = (nr: number, nc: number) => {
      const next = parseCells(cells, nr, nc);
      editor.updateShape({
        id: shape.id,
        type: 'table',
        props: {
          rows: nr,
          cols: nc,
          cells: JSON.stringify(next),
          h: Math.max(120, nr * 36),
          w: Math.max(200, nc * 100),
        },
      });
    };

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          background: 'rgba(255,255,255,0.96)',
          border: '1px solid rgba(24,24,27,0.2)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: isEditing ? 'all' : 'none',
        }}
      >
        {isEditing && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: '4px 6px',
              borderBottom: '1px solid rgba(24,24,27,0.08)',
              background: '#f4f4f5',
              fontSize: 11,
              alignItems: 'center',
              color: '#3f3f46',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span>Rows</span>
            <button type="button" onClick={() => setDims(Math.max(1, rows - 1), cols)} style={btnStyle}>
              −
            </button>
            <span>{rows}</span>
            <button type="button" onClick={() => setDims(rows + 1, cols)} style={btnStyle}>
              +
            </button>
            <span style={{ marginLeft: 8 }}>Cols</span>
            <button type="button" onClick={() => setDims(rows, Math.max(1, cols - 1))} style={btnStyle}>
              −
            </button>
            <span>{cols}</span>
            <button type="button" onClick={() => setDims(rows, cols + 1)} style={btnStyle}>
              +
            </button>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>Double-click table to edit cells</span>
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            flex: 1,
            width: '100%',
            minHeight: 0,
          }}
        >
          {grid.map((row, ri) =>
            row.map((cell, ci) =>
              isEditing ? (
                <input
                  key={`${ri}-${ci}`}
                  value={cell}
                  onChange={(e) => updateCell(ri, ci, e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    borderRight: ci < cols - 1 ? '1px solid rgba(24,24,27,0.12)' : undefined,
                    borderBottom: ri < rows - 1 ? '1px solid rgba(24,24,27,0.12)' : undefined,
                    borderTop: 'none',
                    borderLeft: 'none',
                    outline: 'none',
                    padding: 6,
                    fontSize: 12,
                    color: '#18181b',
                    background: 'transparent',
                    width: '100%',
                    minWidth: 0,
                    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                  }}
                />
              ) : (
                <div
                  key={`${ri}-${ci}`}
                  style={{
                    borderRight: ci < cols - 1 ? '1px solid rgba(24,24,27,0.12)' : undefined,
                    borderBottom: ri < rows - 1 ? '1px solid rgba(24,24,27,0.12)' : undefined,
                    padding: 6,
                    fontSize: 12,
                    color: '#18181b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell || <span style={{ color: '#a1a1aa' }}>…</span>}
                </div>
              ),
            ),
          )}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: TableShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}

const btnStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  border: '1px solid rgba(24,24,27,0.15)',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: '20px',
  padding: 0,
};
