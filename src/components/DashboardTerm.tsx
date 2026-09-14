import type { PageId } from '@/components/AppLayout';
import type { WeatherSnapshot } from '@/lib/weather';

const DIV = '│';
const RULE = '─'.repeat(28);

export function DashboardTerm(props: {
  awake: boolean;
  sigil: string;
  editingSigil: boolean;
  setEditingSigil: (v: boolean) => void;
  saveSigil: (v: string) => void;
  time: string;
  dateLabel: string;
  weather: WeatherSnapshot | null;
  host: string;
  streak: number;
  term: number;
  terms: number;
  focusLabel: string;
  gpa: string;
  tasks: number;
  navigate: (p: PageId) => void;
}) {
  const host = props.host.toLowerCase();
  return (
    <section className={`hud-hero mb-8 ${props.awake ? 'hud-awake' : ''}`}>
      <div className="hud-term">
        <div className="hud-term-chrome">
          <span className="hud-dot" />
          <span className="hud-dot hud-dot-mid" />
          <span className="hud-dot hud-dot-dim" />
          <span className="hud-term-title">user@{host}:~</span>
        </div>
        <div className="hud-term-body">
          <div className="hud-term-art">
            {props.editingSigil ? (
              <div>
                <textarea
                  defaultValue={props.sigil}
                  rows={10}
                  className="hud-sigil-frame resize-y bg-transparent p-1 outline-none"
                  autoFocus
                  onBlur={(e) => props.saveSigil(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') props.setEditingSigil(false);
                  }}
                />
                <p className="mt-1 text-[10px] text-zinc-500">click away to save · original glyph only</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => props.setEditingSigil(true)}
                title="Customize sigil"
                className="hud-sigil hud-sigil-frame block text-left"
              >
                <pre className="select-none leading-[1.12] text-[clamp(10px,1.55vw,15px)]">{props.sigil}</pre>
              </button>
            )}
          </div>
          <pre className="hud-term-div" aria-hidden>
            {Array.from({ length: 13 }, () => DIV).join('\n')}
          </pre>
          <div className="hud-fetch">
            <p className="hud-clock">
              <span className="hud-clock-time">{props.time}</span>
              <span className="hud-cursor" aria-hidden />
              <span className="hud-clock-date">{props.dateLabel.toLowerCase()}</span>
            </p>
            {props.weather ? (
              <p className="mb-2 lowercase text-zinc-600">
                weather · {props.weather.tempC}°c · {props.weather.description.toLowerCase()}
                <span className="text-zinc-400"> · {props.weather.city.toLowerCase()}</span>
              </p>
            ) : (
              <p className="mb-2 text-[10px] lowercase text-zinc-400">weather · offline</p>
            )}
            <p className="lowercase text-zinc-800">
              user<span className="text-zinc-500">@</span>
              {host}
            </p>
            <p className="hud-rule">{RULE}</p>
            <StatRow label="os" value="epicure 10.2" />
            <StatRow label="streak" value={`${props.streak}d`} />
            <StatRow label="term" value={`t${props.term} / ${props.terms}`} />
            <StatRow label="focus" value={props.focusLabel.toLowerCase()} />
            <StatRow label="gpa" value={props.gpa} />
            <StatRow label="tasks" value={`${props.tasks} open`} />
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => props.navigate('grades')} className="hud-link">
                → grades
              </button>
              <button type="button" onClick={() => props.navigate('habits')} className="hud-link">
                → habits
              </button>
              <button type="button" onClick={() => props.navigate('todos')} className="hud-link">
                → tasks
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="lowercase">
      <span className="hud-k">{label}:</span>
      <span className="text-zinc-800">{value}</span>
    </p>
  );
}
