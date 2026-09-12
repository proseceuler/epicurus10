/** User gothic silver Arrodes frame (exact attached PNG). Mercury fills the glass hole. */
import { ARRODES_FRAME_A } from '@/components/arrodesFrameA';
import { ARRODES_FRAME_B } from '@/components/arrodesFrameB';
import { ARRODES_FRAME_C } from '@/components/arrodesFrameC';
import { ARRODES_FRAME_D } from '@/components/arrodesFrameD';
import { ARRODES_FRAME_E } from '@/components/arrodesFrameE';
import { ARRODES_FRAME_F } from '@/components/arrodesFrameF';
import { ARRODES_HOLE_B64 } from '@/components/arrodesFrameHole';

export const ARRODES_FRAME = `data:image/webp;base64,${ARRODES_FRAME_A}${ARRODES_FRAME_B}${ARRODES_FRAME_C}${ARRODES_FRAME_D}${ARRODES_FRAME_E}${ARRODES_FRAME_F}`;
export const ARRODES_HOLE_MASK = `data:image/png;base64,${ARRODES_HOLE_B64}`;
