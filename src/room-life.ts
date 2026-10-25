import * as THREE from 'three';
import { LADDER, LOFT_SEAT, LOFT_Y } from './model.ts';
import type { TradeState, roomNpc } from './model.ts';

interface Builders {
  box(group: THREE.Group, color: string, size: number[], position: number[], rotation?: number): THREE.Mesh;
  round(group: THREE.Group, color: string, size: number[], position: number[]): THREE.Mesh;
}

/** Residents and improvised additions share the tower's small set of meshes. */
export class RoomLife {
  constructor(private readonly builders: Builders) {}

  npc(parent: THREE.Group, npc: NonNullable<ReturnType<typeof roomNpc>>): THREE.Group {
    const group = new THREE.Group();
    group.name = npc.kind;
    group.position.set(npc.x, 0, npc.z);
    group.rotation.y = Math.PI / 2;
    parent.add(group);
    const box = (color: string, size: number[], position: number[]) => this.builders.box(group, color, size, position);
    const coat = npc.kind === 'merchant' ? '#647c7b' : ['#a28a73', '#7b846f', '#898197'][npc.detail % 3];
    const skin = ['#c2a583', '#ac8b6c', '#d0b997'][npc.detail % 3];
    for (const x of [-0.12, 0.12]) {
      box('#52594c', [0.14, 0.45, 0.16], [x, 0.33, 0]);
      box('#3f4941', [0.16, 0.11, 0.25], [x, 0.055, 0.04]);
      box(coat, [0.12, 0.46, 0.15], [x * 2, 0.95, 0.03]);
      box(skin, [0.10, 0.10, 0.11], [x * 2, 0.69, 0.05]);
    }
    box(coat, [0.43, 0.68, 0.32], [0, 0.91, 0]);
    box(skin, [0.25, 0.29, 0.24], [0, 1.40, 0.02]);
    box('#655d50', [0.27, 0.085, 0.25], [0, 1.55, 0]);
    box('#d5c8a7', [0.38, 0.10, 0.35], [0, 1.22, 0]);
    for (const x of [-0.055, 0.055]) box('#45483f', [0.022, 0.024, 0.015], [x, 1.42, 0.15]);
    if (npc.kind === 'merchant') {
      this.builders.round(group, '#aa9872', [0.62, 0.045, 0.53], [0, 1.59, 0]);
      this.builders.round(group, '#aa9872', [0.39, 0.18, 0.34], [0, 1.70, 0]);
      box('#b6aa90', [0.18, 0.14, 0.06], [0, 1.30, 0.15]);
      box('#79634e', [0.24, 0.32, 0.19], [-0.24, 0.70, -0.08]);
      this.builders.box(parent, '#7b735c', [0.44, 0.40, 0.42], [1.38, 0.20, 1.18], -0.16);
      this.builders.box(parent, '#c4b393', [0.48, 0.035, 0.46], [1.38, 0.42, 1.18], -0.16);
      for (let i = 0; i < 3; i++) this.builders.round(parent, '#c7ae6e', [0.09, 0.025, 0.09], [1.32 + i * 0.07, 0.46, 1.17]);
    } else {
      box('#7a705e', [0.34, 0.40, 0.20], [0, 0.94, -0.24]);
      box('#c3b38e', [0.27, 0.04, 0.21], [0.20, 0.77, 0.18]);
    }
    return group;
  }

  home(interior: THREE.Group, exterior: THREE.Group, trade: TradeState): void {
    const b = this.builders;
    if (trade.shelves) for (const x of [-0.71, 0.11]) {
      const height = trade.shelves * 0.52;
      b.box(interior, '#655f50', [0.045, height, 0.045], [x, 0.70 + height / 2, 1.55]);
    }
    for (let shelf = 0; shelf < trade.shelves; shelf++) {
      const y = 1.18 + shelf * 0.52;
      b.box(interior, '#81745d', [1.23, 0.055, 0.45], [-0.30, y, 1.40]);
      for (const x of [-0.71, 0.11]) b.box(interior, '#655f50', [0.045, 0.26, 0.28], [x, y - 0.12, 1.49]);
    }
    if (trade.loft) {
      const loft = new THREE.Group();
      loft.name = 'home-loft';
      interior.add(loft);
      for (let i = 0; i < 8; i++) b.box(loft, i % 3 ? '#b09e7e' : '#97896e', [0.29, 0.14, 2.1], [-1.65 + i * 0.30, LOFT_Y - 0.07, 0]);
      for (const z of [-0.95, 0.2, 0.98]) b.box(loft, '#766951', [0.065, 0.94, 0.065], [0.57, LOFT_Y + 0.46, z]);
      b.box(loft, '#82745c', [0.065, 0.065, 1.18], [0.57, LOFT_Y + 0.90, 0.58]);
      b.box(loft, '#82745c', [0.065, 0.065, 0.18], [0.57, LOFT_Y + 0.90, -0.91]);
      for (const z of [LADDER.z - 0.22, LADDER.z + 0.22]) {
        const rail = b.box(loft, '#8e7b5d', [0.07, 3.02, 0.07], [0.82, 1.44, z]);
        rail.rotation.z = 0.19;
      }
      for (let i = 0; i < 11; i++) b.box(loft, '#b5a17b', [0.13, 0.055, 0.48], [1.1 - i * 0.052, 0.18 + i * 0.25, LADDER.z]);
      b.box(loft, '#7a7059', [0.60, 0.43, 0.72], [LOFT_SEAT.x, LOFT_Y + 0.22, LOFT_SEAT.z]);
      b.box(loft, '#bbc0a3', [0.60, 0.10, 0.72], [LOFT_SEAT.x, LOFT_Y + 0.48, LOFT_SEAT.z]);
      b.box(loft, '#7a7059', [0.065, 0.55, 0.72], [LOFT_SEAT.x - 0.27, LOFT_Y + 0.65, LOFT_SEAT.z]);
      b.box(loft, '#acb89d', [0.34, 0.11, 0.68], [-1.35, LOFT_Y + 0.09, 0.67], 0.1);
      b.box(loft, '#c4b99a', [0.26, 0.045, 0.34], [-0.55, LOFT_Y + 0.04, 0.62], -0.2);
      b.box(loft, '#82917e', [0.24, 0.035, 0.30], [-0.56, LOFT_Y + 0.08, 0.64], -0.12);
    }
    if (trade.balcony) {
      const balcony = new THREE.Group();
      balcony.name = 'home-balcony';
      exterior.add(balcony);
      for (let i = 0; i < 6; i++) b.box(balcony, i % 2 ? '#b7a384' : '#a59170', [1.88, 0.12, 0.275], [4.0, -0.06, -0.16 + i * 0.28]);
      b.box(balcony, '#aa9574', [0.82, 0.12, 0.62], [2.98, -0.06, 0.03]);
      for (const z of [-0.20, 1.22]) {
        const beam = b.box(balcony, '#76694f', [0.12, 2.65, 0.12], [3.25, -0.98, z]);
        beam.rotation.z = -0.88;
        b.box(balcony, '#6c6652', [0.18, 0.35, 0.20], [2.22, -1.55, z]);
      }
      for (const x of [3.18, 4.86]) for (const z of [-0.26, 1.39]) b.box(balcony, '#7d6e53', [0.065, 0.95, 0.065], [x, 0.47, z]);
      for (const z of [-0.26, 1.39]) b.box(balcony, '#c3b58e', [1.72, 0.035, 0.035], [4.0, 0.88, z]);
      b.box(balcony, '#c3b58e', [0.035, 0.035, 1.68], [4.86, 0.88, 0.56]);
    }
  }
}
