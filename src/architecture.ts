import * as THREE from 'three';
import { INNER_RADIUS, ROOM_HEIGHT, STEP_ANGLE, TAU, TOWER_RADIUS } from './model.ts';
import type { RoomWindow } from './model.ts';

export const WALL_HEIGHT = 2.65;
const DOOR_HALF_WIDTH = 0.265;
type Point = [number, number, number];

/** Matching vertical facets keep the tower continuous, with actual holes in both wall faces. */
export function createWallGeometries(window: RoomWindow | null, interiorHeight = WALL_HEIGHT) {
  const outside: number[] = [], inside: number[] = [], reveals: number[] = [];
  const at = (radius: number, angle: number, y: number): Point => [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  const quad = (target: number[], a: Point, b: Point, c: Point, d: Point) => target.push(...a, ...b, ...c, ...a, ...c, ...d);
  const edges = [0, TAU, DOOR_HALF_WIDTH, TAU - DOOR_HALF_WIDTH];
  for (let i = 1; i < 45; i++) edges.push(i * STEP_ANGLE);
  // Every chunk uses the same facet boundaries, including chunks without windows.
  for (const halfWidth of [0.23, 0.37]) edges.push(Math.PI * 1.22 - halfWidth, Math.PI * 1.22 + halfWidth);
  edges.sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1], mid = (a + b) / 2;
    const door = mid < DOOR_HALF_WIDTH || mid > TAU - DOOR_HALF_WIDTH;
    const opening = window && Math.abs(mid - window.angle) < window.halfWidth ? window : null;
    const spans = door ? [[WALL_HEIGHT, ROOM_HEIGHT]] : opening ? [[0, opening.bottom], [opening.top, ROOM_HEIGHT]] : [[0, ROOM_HEIGHT]];
    for (const [bottom, top] of spans) {
      quad(outside, at(TOWER_RADIUS, a, bottom), at(TOWER_RADIUS, a, top), at(TOWER_RADIUS, b, top), at(TOWER_RADIUS, b, bottom));
      if (bottom < interiorHeight) {
        const innerTop = Math.min(top, interiorHeight);
        quad(inside, at(INNER_RADIUS, b, bottom), at(INNER_RADIUS, b, innerTop), at(INNER_RADIUS, a, innerTop), at(INNER_RADIUS, a, bottom));
      }
    }
    if (opening) for (const y of [opening.bottom, opening.top]) {
      quad(reveals, at(INNER_RADIUS, a, y), at(TOWER_RADIUS, a, y), at(TOWER_RADIUS, b, y), at(INNER_RADIUS, b, y));
    }
  }
  if (window) for (const angle of [window.angle - window.halfWidth, window.angle + window.halfWidth]) {
    quad(reveals, at(INNER_RADIUS, angle, window.bottom), at(INNER_RADIUS, angle, window.top), at(TOWER_RADIUS, angle, window.top), at(TOWER_RADIUS, angle, window.bottom));
  }
  const geometry = (vertices: number[]) => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    result.computeVertexNormals();
    return result;
  };
  return { outside: geometry(outside), inside: geometry(inside), reveals: geometry(reveals) };
}
