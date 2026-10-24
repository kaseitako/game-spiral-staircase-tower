import * as THREE from 'three';
import { INNER_RADIUS, roomCampfire, roomDesign, roomWindow } from './model.ts';
import type { Realm } from './model.ts';

interface Builders {
  box(group: THREE.Group, color: string, size: number[], position: number[], rotation?: number): THREE.Mesh;
  round(group: THREE.Group, color: string, size: number[], position: number[]): THREE.Mesh;
  mesh(geometry: THREE.BufferGeometry, color: string): THREE.Mesh;
}

export interface Campfire {
  group: THREE.Group;
  tongues: THREE.Mesh[];
  sparks: THREE.Mesh[];
  embers: boolean;
  phase: number;
}

/** Small, silent scenes of ordinary life. All rooms share the same GPU resources. */
export class RoomStories {
  private readonly builders: Builders;
  private readonly realm: Realm;
  private readonly stone = new THREE.DodecahedronGeometry(1, 0);
  private readonly flame = new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
  private readonly coal = new THREE.MeshBasicMaterial({ color: '#b64b23' });
  private readonly orange = new THREE.MeshBasicMaterial({ color: '#f9973d' });
  private readonly gold = new THREE.MeshBasicMaterial({ color: '#ffe0a0' });

  constructor(builders: Builders, realm: Realm) {
    this.builders = builders;
    this.realm = realm;
  }

  add(parent: THREE.Group, room: number): Campfire | null {
    const { kind, layout, details } = roomDesign(room, this.realm);
    if (!['ruin', 'camp', 'dining', 'mending'].includes(kind)) return null;
    const group = new THREE.Group();
    group.name = `room-story-${kind}`;
    parent.add(group);
    if (kind === 'ruin') this.ruin(group, room, layout, details);
    if (kind === 'dining') this.dining(group, room, layout);
    if (kind === 'mending') this.mending(group, room, layout);
    if (kind === 'camp') return this.camp(group, room, layout, details);
    return null;
  }

  private rock(group: THREE.Group, color: string, size: number[], position: number[], rotation = 0): THREE.Mesh {
    const mesh = this.builders.mesh(this.stone, color);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation * 0.3, rotation, rotation * 0.7);
    group.add(mesh);
    return mesh;
  }

  private bar(group: THREE.Group, color: string, width: number, from: number[], to: number[]): void {
    const a = new THREE.Vector3().fromArray(from), b = new THREE.Vector3().fromArray(to);
    const bar = this.builders.box(group, color, [width, a.distanceTo(b), width], a.clone().add(b).multiplyScalar(0.5).toArray());
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  }

  /** Curved-wall details leave every real window opening clear. */
  private wall(group: THREE.Group, room: number, color: string, angle: number, y: number, width: number, height: number, inset = 0.045): void {
    const opening = roomWindow(room, this.realm);
    const gap = opening ? Math.abs(Math.atan2(Math.sin(angle - opening.angle), Math.cos(angle - opening.angle))) : Infinity;
    if (opening && gap < opening.halfWidth + width / (2 * INNER_RADIUS) && y + height / 2 > opening.bottom && y - height / 2 < opening.top) return;
    const radius = INNER_RADIUS - inset;
    this.builders.box(group, color, [width, height, 0.035], [Math.cos(angle) * radius, y, Math.sin(angle) * radius], Math.PI / 2 - angle);
  }

  private ruin(group: THREE.Group, room: number, layout: number, details: number): void {
    const { box } = this.builders;
    // Uneven masonry shows through missing plaster, all inside the continuous tower shell.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 6 - Math.abs(row - 2); col++) {
      const angle = 4.24 + col * 0.135 + (row % 2) * 0.065;
      this.wall(group, room, (row + col) % 3 ? '#827e70' : '#9a9381', angle, 0.29 + row * 0.24, 0.28, 0.21);
    }
    const cracks = new THREE.Group();
    const angle = 2.85;
    cracks.position.set(Math.cos(angle) * 2.24, 0, Math.sin(angle) * 2.24);
    cracks.rotation.y = Math.PI / 2 - angle;
    group.add(cracks);
    const points = [[-0.16, 2.24, 0], [-0.03, 1.98, 0], [-0.10, 1.74, 0], [0.07, 1.48, 0], [0.02, 1.17, 0], [0.16, 0.94, 0]];
    for (let i = 1; i < points.length; i++) this.bar(cracks, '#78796d', 0.012, points[i - 1], points[i]);
    this.bar(cracks, '#78796d', 0.009, points[2], [-0.28, 1.61, 0]);
    this.bar(cracks, '#78796d', 0.009, points[4], [-0.14, 1.07, 0]);
    // A collapsed bed frame and a blanket still caught on its boards.
    const frame = new THREE.Group();
    frame.position.set(-0.03, 0.15, -1.65);
    frame.rotation.set(0.08, (layout - 1) * 0.12, -0.12);
    group.add(frame);
    for (const z of [-0.26, 0.26]) box(frame, '#736c58', [1.17, 0.09, 0.07], [0, 0, z]);
    for (let i = 0; i < 5; i++) box(frame, '#8b7f67', [0.13, 0.055, 0.58], [-0.47 + i * 0.22, 0.025, 0], i === layout + 1 ? 0.40 : 0);
    box(frame, '#9b9884', [0.51, 0.055, 0.46], [-0.15, 0.08, 0], -0.08);
    box(frame, '#9b9884', [0.36, 0.20, 0.04], [-0.10, 0.01, 0.27], -0.08);
    for (let i = 0; i < 9 + layout * 2; i++) {
      const angle = 4.05 + i * 0.14;
      const radius = 1.73 + ((details + i * 3) % 4) * 0.09;
      this.rock(group, i % 2 ? '#aaa493' : '#8d8c7d', [0.12 + (i % 3) * 0.04, 0.075, 0.10], [Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius], i * 0.7);
    }
    for (let i = 0; i < 3; i++) {
      this.rock(group, '#b7b1a0', [0.27, 0.035, 0.20], [-1.45 + i * 0.26, 0.045, -0.23 - i * 0.09], i * 2.1);
    }
    const floorCrack = [[-0.87, 0.01, 0.55], [-0.55, 0.01, 0.41], [-0.34, 0.01, 0.53], [0.06, 0.01, 0.36]];
    for (let i = 1; i < floorCrack.length; i++) this.bar(group, '#828376', 0.012, floorCrack[i - 1], floorCrack[i]);
    const beam = box(group, '#6d6958', [0.095, 1.52, 0.12], [0.57, 0.75, -1.94]);
    beam.rotation.z = -0.22;
    // A fallen picture and scattered pages, rather than a pristine furnished room.
    box(group, '#777361', [0.42, 0.035, 0.34], [-1.21, 0.04, 1.25], -0.35);
    box(group, '#b3ae93', [0.33, 0.01, 0.25], [-1.21, 0.064, 1.25], -0.35);
    box(group, '#7e8c7b', [0.25, 0.012, 0.10], [-1.20, 0.071, 1.20], -0.35);
    for (let i = 0; i < 3; i++) box(group, '#bbb6a0', [0.17, 0.006, 0.24], [-0.55 + i * 0.30, 0.018, 0.25 + (i % 2) * 0.21], details + i);
  }

  private camp(group: THREE.Group, room: number, layout: number, details: number): Campfire {
    const { box, round } = this.builders;
    const hearth = roomCampfire(room, this.realm)!;
    // The bedding and packed supplies suggest a temporary stopping place.
    const cloth = ['#858b74', '#a29377', '#7e8e92'][layout];
    box(group, '#615f50', [1.18, 0.04, 0.60], [-0.05, 0.025, -1.69], -0.04);
    box(group, cloth, [1.07, 0.13, 0.51], [-0.05, 0.11, -1.69], -0.04);
    const roll = round(group, '#a7a08a', [0.23, 0.49, 0.23], [-0.49, 0.22, -1.67]);
    roll.rotation.x = Math.PI / 2;
    for (const z of [-1.82, -1.52]) box(group, '#626858', [0.055, 0.26, 0.025], [-0.49, 0.19, z]);
    box(group, '#6c7665', [0.34, 0.43, 0.28], [0.61, 0.23, -1.76], -0.16);
    box(group, '#8d9279', [0.30, 0.08, 0.30], [0.60, 0.45, -1.76], -0.16);
    box(group, '#4e5749', [0.04, 0.37, 0.03], [0.60, 0.24, -1.60], -0.16);
    for (let i = 0; i < 3; i++) {
      const log = round(group, '#6b6555', [0.10, 0.47, 0.10], [-1.23 + i * 0.10, 0.08 + (i % 2) * 0.08, 1.20]);
      log.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 4 + layout; i++) this.wall(group, room, '#b9b09a', 4.73 + i * 0.045, 1.36 + (i % 2) * 0.02, 0.018, 0.16);

    const fire = new THREE.Group();
    fire.name = 'campfire';
    fire.position.set(hearth.x, 0, hearth.z);
    group.add(fire);
    round(fire, '#55564e', [0.81, 0.025, 0.81], [0, 0.018, 0]);
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      this.rock(fire, i % 2 ? '#85877b' : '#a09b88', [0.13, 0.105, 0.105], [Math.cos(angle) * 0.36, 0.09, Math.sin(angle) * 0.36], i * 0.4);
    }
    for (let i = 0; i < 3; i++) {
      const log = round(fire, '#49473e', [0.12, 0.52, 0.12], [0, 0.11 + i * 0.025, 0]);
      log.rotation.set(Math.PI / 2, 0, i * 1.05);
      const coal = new THREE.Mesh(this.stone, this.coal);
      coal.scale.set(0.13, 0.055, 0.10);
      coal.position.set(Math.cos(i * 2.1) * 0.12, 0.135, Math.sin(i * 2.1) * 0.12);
      fire.add(coal);
    }
    // A kettle waiting beside the stones, within the same collision footprint.
    round(fire, '#555e58', [0.20, 0.19, 0.20], [-0.30, 0.18, 0.16]);
    round(fire, '#6f786b', [0.22, 0.035, 0.22], [-0.30, 0.285, 0.16]);
    this.bar(fire, '#4c554b', 0.018, [-0.39, 0.30, 0.16], [-0.30, 0.41, 0.16]);
    this.bar(fire, '#4c554b', 0.018, [-0.30, 0.41, 0.16], [-0.21, 0.30, 0.16]);
    const tongues: THREE.Mesh[] = [], sparks: THREE.Mesh[] = [];
    if (!hearth.embers) {
      for (let i = 0; i < 7; i++) {
        const tongue = new THREE.Mesh(this.flame, i < 4 ? this.orange : this.gold);
        tongue.position.set(Math.cos(i * 2.4) * (i < 4 ? 0.11 : 0.06), 0.14, Math.sin(i * 2.4) * (i < 4 ? 0.11 : 0.06));
        tongues.push(tongue);
        fire.add(tongue);
      }
      for (let i = 0; i < 3; i++) {
        const spark = new THREE.Mesh(this.stone, this.orange);
        sparks.push(spark);
        fire.add(spark);
      }
    }
    return { group: fire, tongues, sparks, embers: hearth.embers, phase: (details % 100) / 10 };
  }

  private dining(group: THREE.Group, room: number, layout: number): void {
    const { box, round } = this.builders;
    const wood = '#8d7d62';
    box(group, wood, [1.14, 0.07, 0.61], [-0.05, 0.74, -1.70]);
    for (const x of [-0.51, 0.41]) for (const z of [-1.92, -1.48]) box(group, wood, [0.065, 0.70, 0.065], [x, 0.36, z]);
    box(group, '#b2a58a', [0.28, 0.012, 0.62], [-0.06, 0.782, -1.70]);
    box(group, '#b2a58a', [0.28, 0.24, 0.016], [-0.06, 0.67, -1.385]);
    // Two place settings, one pushed aside; no explanation of who used them.
    for (let i = 0; i < 2; i++) {
      const x = -0.34 + i * 0.61;
      const bowl = round(group, '#bfc0a9', [0.25, 0.065, 0.25], [x, 0.81, -1.64]);
      if (layout === 2 && i === 1) { bowl.rotation.z = 0.9; bowl.position.y = 0.85; }
      else round(group, '#807a64', [0.19, 0.012, 0.19], [x, 0.846, -1.64]);
      round(group, '#929e91', [0.12, 0.14, 0.12], [x + 0.05, 0.85, -1.91]);
      box(group, '#665f4e', [0.017, 0.013, 0.22], [x + 0.17, 0.788, -1.63], 0.07);
    }
    box(group, '#776e59', [0.68, 0.07, 0.25], [-0.05, 0.39, -1.22], -0.06);
    for (const x of [-0.30, 0.20]) box(group, '#776e59', [0.055, 0.37, 0.20], [x, 0.19, -1.22]);
    this.rock(group, '#aa8e62', [0.13, 0.06, 0.08], [-0.07, 0.83, -1.73]);
    round(group, '#8c977f', [0.20, 0.28, 0.20], [-1.19, 0.15, 1.34]);
    round(group, '#717d65', [0.10, 0.13, 0.10], [-1.19, 0.35, 1.34]);
    this.wall(group, room, '#aaa38c', 4.73, 1.75, 0.63, 0.43);
    this.wall(group, room, '#899582', 4.73, 1.70, 0.46, 0.12, 0.067);
    // A cloth hung to dry and a small stack of dishes along the wall.
    this.wall(group, room, '#7f8d81', 2.95, 1.55, 0.33, 0.52);
    for (let i = 0; i < 3; i++) round(group, '#b0ad92', [0.22, 0.035, 0.22], [-1.25, 0.03 + i * 0.038, 0.95]);
  }

  private mending(group: THREE.Group, room: number, layout: number): void {
    const { box, round } = this.builders;
    const cloth = ['#8e9c92', '#a596a0', '#b29d7a'][layout];
    box(group, '#847960', [1.20, 0.07, 0.53], [-0.05, 0.75, -1.72]);
    for (const x of [-0.54, 0.44]) box(group, '#847960', [0.07, 0.72, 0.45], [x, 0.37, -1.72]);
    box(group, cloth, [0.46, 0.014, 0.48], [-0.15, 0.794, -1.69], 0.04);
    box(group, cloth, [0.46, 0.40, 0.018], [-0.14, 0.60, -1.45], 0.04);
    for (let i = 0; i < 4; i++) box(group, '#c7bfa5', [0.013, 0.018, 0.26], [-0.32 + i * 0.10, 0.806, -1.61], 0.04);
    // A small unfinished weaving frame and spools of thread on the worktop.
    for (const x of [-0.39, 0.05]) box(group, '#71694f', [0.035, 0.55, 0.045], [x, 1.07, -1.86]);
    for (const y of [0.84, 1.32]) box(group, '#71694f', [0.48, 0.035, 0.045], [-0.17, y, -1.86]);
    for (let i = 0; i < 7; i++) box(group, '#c9c0a5', [0.009, 0.47, 0.012], [-0.35 + i * 0.06, 1.08, -1.86]);
    box(group, cloth, [0.40, 0.21, 0.022], [-0.17, 0.97, -1.85]);
    for (let i = 0; i < 3; i++) {
      const x = 0.21 + i * 0.11;
      round(group, '#aa9777', [0.095, 0.04, 0.095], [x, 0.80, -1.79]);
      round(group, i % 2 ? '#b4a088' : cloth, [0.073, 0.14, 0.073], [x, 0.88, -1.79]);
      round(group, '#aa9777', [0.095, 0.025, 0.095], [x, 0.96, -1.79]);
    }
    this.bar(group, '#817c67', 0.014, [-0.63, 2.08, -1.98], [0.70, 2.04, -1.96]);
    for (let i = 0; i < 3; i++) {
      const x = -0.43 + i * 0.43;
      box(group, i % 2 ? '#b4b09a' : cloth, [0.28, 0.35 + i * 0.06, 0.025], [x, 1.88 - i * 0.03, -1.96], (i - 1) * 0.06);
      for (const dx of [-0.09, 0.09]) box(group, '#786e56', [0.023, 0.075, 0.04], [x + dx, 2.06, -1.96]);
    }
    round(group, '#998269', [0.40, 0.35, 0.40], [-1.21, 0.18, 1.35]);
    for (let i = 0; i < 3; i++) box(group, i % 2 ? '#b4b09a' : cloth, [0.27, 0.055, 0.24], [-1.21, 0.36 + i * 0.05, 1.35], i * 0.25);
    this.wall(group, room, '#7f8b80', 2.94, 1.47, 0.24, 0.66);
  }

  animate(fire: Campfire, elapsed: number): number {
    const time = elapsed + fire.phase;
    const flicker = 1 + Math.sin(time * 3.7) * 0.08 + Math.sin(time * 6.1) * 0.035;
    for (const [index, tongue] of fire.tongues.entries()) {
      const core = index >= 4;
      const sway = Math.sin(time * 2.6 + index * 1.7);
      tongue.scale.set(core ? 0.17 : 0.26, (core ? 0.28 : 0.43 + (index % 2) * 0.13) * (1 + sway * 0.14), core ? 0.15 : 0.23);
      tongue.rotation.set(sway * 0.10, index * 1.7, Math.cos(time * 2.1 + index) * 0.13);
    }
    for (const [index, spark] of fire.sparks.entries()) {
      const progress = ((time * 0.23 + index / 3) % 1 + 1) % 1;
      spark.position.set(Math.sin(time + index * 2) * 0.09, 0.3 + progress * 0.85, Math.cos(time * 0.7 + index) * 0.08);
      spark.scale.setScalar(0.014 * Math.sin(progress * Math.PI));
    }
    return (fire.embers ? 1.6 : 9) * flicker;
  }

  dispose(): void {
    for (const resource of [this.stone, this.flame, this.coal, this.orange, this.gold]) resource.dispose();
  }
}
