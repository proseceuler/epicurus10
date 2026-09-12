/** User gothic silver Arrodes frame (exact attached PNG). Mercury fills the glass hole. */
import { ARRODES_FRAME_A } from '@/components/arrodesFrameA';
import { ARRODES_FRAME_B, ARRODES_HOLE_B64 } from '@/components/arrodesFrameB';

export const ARRODES_FRAME = `data:image/webp;base64,${ARRODES_FRAME_A}${ARRODES_FRAME_B}`;
export const ARRODES_HOLE_MASK = `data:image/webp;base64,${ARRODES_HOLE_B64}`;
