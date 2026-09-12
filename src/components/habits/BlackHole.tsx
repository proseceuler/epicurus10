import ArrodesVoiceMirror from '@/components/ArrodesVoiceMirror';

/** Habit Home + Tracker interactable — the gothic mercury mirror, sized by its parent. */
export default function BlackHole({
  className = '',
}: {
  className?: string;
  percent?: number;
}) {
  const track = className.includes('w-[176') || className.includes('w-44');
  return (
    <div className={`flex items-center justify-center bg-transparent ${className}`}>
      <ArrodesVoiceMirror variant={track ? 'track' : 'home'} mode="idle" active />
    </div>
  );
}
