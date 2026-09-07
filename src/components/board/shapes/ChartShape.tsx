import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  TLBaseShape,
  Rectangle2d,
  resizeBox,
  type TLResizeInfo,
} from 'tldraw';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
} from 'recharts';

export type ChartKind =
  | 'area'
  | 'bar'
  | 'column'
  | 'donut'
  | 'histogram'
  | 'line'
  | 'pie'
  | 'scatter';

export type ChartShape = TLBaseShape<
  'chart',
  {
    w: number;
    h: number;
    kind: string;
    title: string;
    data: string;
  }
>;

const COLORS = ['#1971c2', '#e03131', '#2f9e44', '#f59f00', '#7048e8', '#f76707', '#0ca678', '#d6336c'];

const KINDS: { id: ChartKind; label: string }[] = [
  { id: 'area', label: 'Area' },
  { id: 'bar', label: 'Bar' },
  { id: 'column', label: 'Column' },
  { id: 'donut', label: 'Donut' },
  { id: 'histogram', label: 'Histogram' },
  { id: 'line', label: 'Line' },
  { id: 'pie', label: 'Pie' },
  { id: 'scatter', label: 'Scatter' },
];

export function parseChartData(raw: string): { label: string; value: number; x?: number; y?: number }[] {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data.map((d, i) => ({
        label: String(d.label ?? d.name ?? `Item ${i + 1}`),
        value: Number(d.value ?? d.y ?? d.v ?? 0) || 0,
        x: Number(d.x ?? i) || i,
        y: Number(d.y ?? d.value ?? 0) || 0,
      }));
    }
  } catch {
    /* empty */
  }
  return [
    { label: 'Mon', value: 4, x: 0, y: 4 },
    { label: 'Tue', value: 7, x: 1, y: 7 },
    { label: 'Wed', value: 3, x: 2, y: 3 },
    { label: 'Thu', value: 9, x: 3, y: 9 },
    { label: 'Fri', value: 6, x: 4, y: 6 },
  ];
}

const DEFAULT_DATA = JSON.stringify([
  { label: 'Mon', value: 4 },
  { label: 'Tue', value: 7 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 9 },
  { label: 'Fri', value: 6 },
]);

export class ChartShapeUtil extends BaseBoxShapeUtil<ChartShape> {
  static override type = 'chart' as const;
  static override props = {
    w: T.number,
    h: T.number,
    kind: T.string,
    title: T.string,
    data: T.string,
  };

  getDefaultProps(): ChartShape['props'] {
    return {
      w: 380,
      h: 260,
      kind: 'column',
      title: 'Chart',
      data: DEFAULT_DATA,
    };
  }

  getGeometry(shape: ChartShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override canEdit = () => true;
  override canResize = () => true;
  override isAspectRatioLocked = () => false;

  override onResize(shape: ChartShape, info: TLResizeInfo<ChartShape>) {
    return resizeBox(shape, info);
  }

  component(shape: ChartShape) {
    const { w, h, kind, title, data } = shape.props;
    const rows = parseChartData(data);
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const editor = this.editor;
    const k = (kind || 'column') as ChartKind;

    const chartBody = (() => {
      if (k === 'line') {
        return (
          <LineChart data={rows}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#1971c2" strokeWidth={2.5} dot={{ r: 3, fill: '#1971c2' }} />
          </LineChart>
        );
      }
      if (k === 'area') {
        return (
          <AreaChart data={rows}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={28} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#1971c2" fill="rgba(25,113,194,0.25)" strokeWidth={2.5} />
          </AreaChart>
        );
      }
      if (k === 'bar') {
        return (
          <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} width={40} />
            <Tooltip />
            <Bar dataKey="value" fill="#1971c2" radius={[0, 3, 3, 0]} />
          </BarChart>
        );
      }
      if (k === 'column' || k === 'histogram') {
        return (
          <BarChart data={rows}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={28} />
            <Tooltip />
            <Bar dataKey="value" fill={k === 'histogram' ? '#7048e8' : '#1971c2'} radius={k === 'histogram' ? 0 : [3, 3, 0, 0]} barSize={k === 'histogram' ? 28 : undefined} />
          </BarChart>
        );
      }
      if (k === 'scatter') {
        return (
          <ScatterChart>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name="x" tick={{ fontSize: 10, fill: '#71717a' }} />
            <YAxis type="number" dataKey="y" name="y" tick={{ fontSize: 10, fill: '#71717a' }} width={28} />
            <ZAxis range={[60, 60]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={rows} fill="#e03131" />
          </ScatterChart>
        );
      }
      // pie / donut
      const inner = k === 'donut' ? '42%' : 0;
      return (
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="label" outerRadius="72%" innerRadius={inner} paddingAngle={1}>
            {rows.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      );
    })();

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          background: 'rgba(255,255,255,0.96)',
          border: '1px solid rgba(24,24,27,0.18)',
          borderRadius: 12,
          padding: isEditing ? 8 : 10,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          pointerEvents: isEditing ? 'all' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {isEditing ? (
          <div onPointerDown={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
            <input
              value={title}
              onChange={(e) =>
                editor.updateShape({ id: shape.id, type: 'chart', props: { title: e.target.value } })
              }
              style={{
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid rgba(24,24,27,0.12)',
                borderRadius: 6,
                padding: '4px 8px',
                outline: 'none',
              }}
              placeholder="Chart title"
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {KINDS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => editor.updateShape({ id: shape.id, type: 'chart', props: { kind: opt.id } })}
                  style={{
                    fontSize: 10,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid rgba(24,24,27,0.12)',
                    background: k === opt.id ? '#18181b' : '#fff',
                    color: k === opt.id ? '#fff' : '#3f3f46',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <textarea
              value={(() => {
                try {
                  return JSON.stringify(JSON.parse(data), null, 2);
                } catch {
                  return data;
                }
              })()}
              onChange={(e) => {
                try {
                  JSON.parse(e.target.value);
                  editor.updateShape({ id: shape.id, type: 'chart', props: { data: e.target.value } });
                } catch {
                  editor.updateShape({ id: shape.id, type: 'chart', props: { data: e.target.value } });
                }
              }}
              style={{
                flex: 1,
                minHeight: 80,
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                border: '1px solid rgba(24,24,27,0.12)',
                borderRadius: 6,
                padding: 6,
                resize: 'none',
                outline: 'none',
              }}
              placeholder='[{"label":"A","value":3}]'
            />
            <div style={{ fontSize: 10, color: '#71717a' }}>
              Edit JSON rows. Scatter uses x/y; others use label + value.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b' }}>
              {title || 'Chart'}
              <span style={{ marginLeft: 8, fontWeight: 500, color: '#a1a1aa', fontSize: 10 }}>
                {KINDS.find((x) => x.id === k)?.label || k}
              </span>
            </div>
            <div style={{ width: '100%', flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                {chartBody}
              </ResponsiveContainer>
            </div>
          </>
        )}
      </HTMLContainer>
    );
  }

  indicator(shape: ChartShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />;
  }
}
