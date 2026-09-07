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
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export type ChartShape = TLBaseShape<
  'chart',
  {
    w: number;
    h: number;
    kind: string; // bar | line | pie
    title: string;
    data: string; // JSON {label,value}[]
  }
>;

const COLORS = ['#18181b', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#3f3f46'];

function parseData(raw: string): { label: string; value: number }[] {
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data.map((d, i) => ({
        label: String(d.label ?? d.name ?? `Item ${i + 1}`),
        value: Number(d.value ?? d.y ?? 0) || 0,
      }));
    }
  } catch {
    /* empty */
  }
  return [
    { label: 'A', value: 4 },
    { label: 'B', value: 7 },
    { label: 'C', value: 3 },
    { label: 'D', value: 9 },
  ];
}

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
      w: 360,
      h: 240,
      kind: 'bar',
      title: 'Chart',
      data: JSON.stringify([
        { label: 'Mon', value: 4 },
        { label: 'Tue', value: 7 },
        { label: 'Wed', value: 3 },
        { label: 'Thu', value: 9 },
        { label: 'Fri', value: 6 },
      ]),
    };
  }

  getGeometry(shape: ChartShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override canResize = () => true;
  override isAspectRatioLocked = () => false;

  override onResize(shape: ChartShape, info: TLResizeInfo<ChartShape>) {
    return resizeBox(shape, info);
  }

  component(shape: ChartShape) {
    const { w, h, kind, title, data } = shape.props;
    const rows = parseData(data);
    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          background: 'rgba(255,255,255,0.94)',
          border: '1px solid rgba(24,24,27,0.18)',
          borderRadius: 12,
          padding: 10,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          pointerEvents: 'all',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b', marginBottom: 4 }}>{title}</div>
        <div style={{ width: '100%', height: h - 36 }}>
          <ResponsiveContainer width="100%" height="100%">
            {kind === 'line' ? (
              <LineChart data={rows}>
                <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={28} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#18181b" strokeWidth={2} dot={false} />
              </LineChart>
            ) : kind === 'pie' ? (
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="label" outerRadius="70%" innerRadius="35%">
                  {rows.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            ) : (
              <BarChart data={rows}>
                <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={28} />
                <Tooltip />
                <Bar dataKey="value" fill="#18181b" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: ChartShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} ry={12} />;
  }
}
