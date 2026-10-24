import { PATH_RADIUS, stairPose } from './model.ts';

export const RETURN_AT = 5.8;
export const RETURN_END = 7.2;
const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function whiteoutAt(elapsed: number): number {
  if (elapsed <= RETURN_AT) return smooth((elapsed - 5) / 0.8);
  return 1 - smooth((elapsed - 6) / 1.2);
}

export function fallPose(steps: number, elapsed: number, origin: number) {
  const start = stairPose(steps, origin);
  const radius = PATH_RADIUS + 2.8 * (1 - Math.exp(-elapsed * 1.2));
  const drop = 1.5 * elapsed + 2 * elapsed * elapsed - 0.5 * Math.sin(Math.min(elapsed / 0.6, 1) * Math.PI);
  return { x: Math.cos(start.angle) * radius, y: start.y - drop, z: Math.sin(start.angle) * radius, angle: start.angle, drop };
}
