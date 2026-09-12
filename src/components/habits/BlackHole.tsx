import ArrodesVoiceMirror from '@/components/ArrodesVoiceMirror';

/** Habit Home + Tracker interactable — gothic mercury mirror. */
export default function BlackHole({
  className = '',
  variant = 'home',
}: {
  className?: string;
  percent?: number;
  variant?: 'home' | 'track';
}) {
  const track = variant === 'track' || className.includes('w-[176') || className.includes('w-44');
  return (
    <div className={`flex items-center justify-center overflow-visible bg-transparent ${className}`}>
      <ArrodesVoiceMirror variant={track ? 'track' : 'home'} mode="idle" active />
    </div>
  );
}
