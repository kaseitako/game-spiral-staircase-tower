import * as THREE from 'three';
import { AccessoryModels } from './accessories.ts';
import { createWallGeometries } from './architecture.ts';
import { RoomStories } from './room-stories.ts';
import { RoomLife } from './room-life.ts';
import type { Campfire } from './room-stories.ts';
import {
  INNER_RADIUS, ROOM_HEIGHT, STEP_ANGLE, STEP_HEIGHT, STEPS_PER_ROOM,
  accessoryFind, accessoryKind, initialRealm, initialTrade, itemKind, postcard, roomDesign, roomFind, roomKey, roomNpc, roomNumber, roomPlants, roomSeed, roomWindow, visibleChunks,
} from './model.ts';
import type { Accessory, Keepsake, Realm, RoomKind, TradeState } from './model.ts';

export const ROOM_NAMES: Record<RoomKind, string> = {
  shelter: '暮らしの名残', empty: '静かな空室', weathered: '風化した部屋',
  library: '小さな書斎', greenhouse: '植物のいる部屋', studio: '忘れられた作業部屋',
  ruin: '崩れた住まい', camp: '焚き火の寝床', dining: '誰かの食卓', mending: '縫いかけの部屋',
};
export const SEAT = { x: -0.85, z: -0.7 };
const C = {
  stone: '#b7b9ab', wood: '#726e56', dark: '#52584b',
};
const PALETTES = [
  { wall: '#a6a18c', floor: '#b0a58c', wood: '#7d7058', cloth: '#b5a384' },
  { wall: '#9fa99e', floor: '#a5a58f', wood: '#737e6c', cloth: '#a4b49c' },
  { wall: '#a5a8ac', floor: '#aaa99e', wood: '#727a7c', cloth: '#a3afba' },
  { wall: '#b0a39a', floor: '#b2a18b', wood: '#8c7564', cloth: '#b6a096' },
];
const ACCESSORY_POSITION = [1.05, 0.61, -1.45] as const;

interface Chunk {
  design: ReturnType<typeof roomDesign>;
  group: THREE.Group;
  interior: THREE.Group;
  keepsakes: THREE.Group;
  accessories: THREE.Group;
  fire: Campfire | null;
  npc: THREE.Group | null;
  owned: { dispose(): void }[];
}

const ITEM_POSITIONS = {
  cup: [-0.58, 0.72, 1.43], lantern: [0.02, 0.72, 1.40], postcard: [1.05, 1.20, -1.88],
} as const;

/** A bounded, reusable window of the tower. Geometry/materials are shared by chunks. */
export class TowerWorld {
  readonly group = new THREE.Group();
  readonly chunks = new Map<number, Chunk>();
  readonly lamp = new THREE.PointLight('#ffe4b0', 1.1, 6, 2);
  private readonly lanternLight = new THREE.PointLight('#ffc476', 0, 5.5, 2);
  private readonly fireLight = new THREE.PointLight('#ffac56', 0, 4.8, 2);
  private readonly loftLight = new THREE.PointLight('#ffe9be', 0, 5, 2);
  private keepsakes: Keepsake[] = [];
  private accessories: Accessory[] = [];
  private readonly accessoryModels = new AccessoryModels();
  private readonly resources: { dispose(): void }[] = [];
  private readonly cube = this.keep(new THREE.BoxGeometry(1, 1, 1));
  private readonly vessel = this.keep(new THREE.CylinderGeometry(0.44, 0.5, 1, 7));
  private readonly leaf = this.keep(new THREE.ConeGeometry(0.5, 1, 4));
  private readonly handle = this.keep(new THREE.TorusGeometry(0.075, 0.016, 4, 10));
  private readonly glow = this.keep(new THREE.MeshBasicMaterial({ color: '#ffe0a2' }));
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly floor = this.keep(new THREE.CircleGeometry(INNER_RADIUS + 0.015, 45));
  private readonly walls = new Map<string, ReturnType<typeof createWallGeometries>>();
  private readonly step = this.makeStep();
  private readonly stories: RoomStories;
  private readonly life: RoomLife;
  private readonly realm: Realm;
  private readonly trade: TradeState;
  private elapsed = 0;
  private anchor = Number.NaN;

  constructor(scene: THREE.Scene, realm = initialRealm(), trade = initialTrade()) {
    this.realm = realm;
    this.trade = trade;
    this.life = new RoomLife({ box: (group, color, size, position, rotation) => this.box(group, color, size, position, rotation), round: (group, color, size, position) => this.round(group, color, size, position) });
    this.stories = new RoomStories({
      box: (group, color, size, position, rotation) => this.box(group, color, size, position, rotation),
      round: (group, color, size, position) => this.round(group, color, size, position),
      mesh: (geometry, color) => this.mesh(geometry, color),
    }, realm);
    scene.add(this.group, this.lamp, this.lanternLight, this.fireLight, this.loftLight);
  }

  private keep<T extends { dispose(): void }>(resource: T): T {
    this.resources.push(resource);
    return resource;
  }

  private material(color: string, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    const key = `${color}:${side}`;
    let material = this.materials.get(key);
    if (!material) {
      material = this.keep(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, side }));
      this.materials.set(key, material);
    }
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, color: string, side: THREE.Side = THREE.FrontSide): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color, side));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private box(group: THREE.Group, color: string, size: number[], position: number[], rotation = 0): THREE.Mesh {
    const box = this.mesh(this.cube, color);
    box.scale.set(size[0], size[1], size[2]);
    box.position.set(position[0], position[1], position[2]);
    box.rotation.y = rotation;
    group.add(box);
    return box;
  }

  private makeStep(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const a = STEP_ANGLE / 2;
    shape.moveTo(Math.cos(-a) * 2.46, Math.sin(-a) * 2.46);
    shape.lineTo(Math.cos(-a) * 3.34, Math.sin(-a) * 3.34);
    shape.lineTo(Math.cos(a) * 3.34, Math.sin(a) * 3.34);
    shape.lineTo(Math.cos(a) * 2.46, Math.sin(a) * 2.46);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    return this.keep(geometry);
  }

  sync(anchor: number): number {
    if (anchor === this.anchor) return 0;
    const previous = Number.isFinite(this.anchor) ? this.anchor * ROOM_HEIGHT : anchor * ROOM_HEIGHT;
    this.anchor = anchor;
    const required = new Set(visibleChunks(anchor));
    for (const [id, chunk] of this.chunks) {
      if (required.has(id)) continue;
      this.group.remove(chunk.group);
      for (const resource of chunk.owned) resource.dispose();
      this.chunks.delete(id);
    }
    for (const id of required) {
      if (!this.chunks.has(id)) {
        const chunk = this.buildChunk(id);
        this.chunks.set(id, chunk);
        this.group.add(chunk.group);
      }
      this.chunks.get(id)!.group.position.y = (id - anchor) * ROOM_HEIGHT;
      // Distant furniture is hidden behind the tower walls; keep nearby rooms visible.
      this.chunks.get(id)!.interior.visible = Math.abs(id - anchor) <= 1;
    }
    return anchor * ROOM_HEIGHT - previous;
  }

  rebuild(): void {
    for (const chunk of this.chunks.values()) for (const resource of chunk.owned) resource.dispose();
    this.chunks.clear();
    this.group.clear();
    this.anchor = Number.NaN;
    this.fireLight.intensity = 0;
    this.lanternLight.intensity = 0;
    this.loftLight.intensity = 0;
  }

  illuminate(room: number, origin: number, indoors: boolean, dt: number): void {
    this.elapsed += dt;
    const kind = roomDesign(room, this.realm).kind;
    this.lamp.position.set(0.4, room * ROOM_HEIGHT - origin + 2.15, -0.2);
    this.lamp.intensity = kind === 'camp' ? 0 : kind === 'ruin' ? 0.5 : indoors ? 3.5 : 1.5;
    const lanterns = this.keepsakes.filter((item) => item.room === room && itemKind(item.source) === 'lantern');
    const lanternSlot = lanterns.findIndex((item) => item.lit);
    this.lanternLight.position.set(0.02, room * ROOM_HEIGHT - origin + 0.99 + Math.max(0, lanternSlot) * 0.52, 1.40);
    this.lanternLight.intensity = lanternSlot >= 0 ? 8.5 : 0;
    this.loftLight.position.set(0, room * ROOM_HEIGHT - origin + 4.75, 0.1);
    this.loftLight.intensity = this.realm.home === room && this.trade.loft ? 5 : 0;
    this.fireLight.intensity = 0;
    for (const [id, chunk] of this.chunks) {
      if (chunk.npc && chunk.interior.visible) chunk.npc.rotation.z = Math.sin(this.elapsed * 0.7 + id) * 0.012;
      if (!chunk.fire || !chunk.interior.visible) continue;
      const intensity = this.stories.animate(chunk.fire, this.elapsed);
      if (id !== room) continue;
      this.fireLight.position.set(chunk.fire.group.position.x, room * ROOM_HEIGHT - origin + 0.43, chunk.fire.group.position.z);
      this.fireLight.intensity = intensity;
    }
  }

  campfireSnapshot(room: number) {
    const fire = this.chunks.get(room)?.fire;
    return fire ? {
      embers: fire.embers, intensity: this.fireLight.intensity, position: this.fireLight.position.toArray(),
      flameHeights: fire.tongues.map((tongue) => tongue.scale.y),
    } : null;
  }

  setKeepsakes(keepsakes: Keepsake[]): void {
    this.keepsakes = keepsakes;
    for (const [id, chunk] of this.chunks) this.populateKeepsakes(chunk, id);
  }

  setAccessories(accessories: Accessory[]): void {
    this.accessories = accessories;
    for (const [id, chunk] of this.chunks) this.populateAccessories(chunk, id);
  }

  private populateAccessories(chunk: Chunk, room: number): void {
    chunk.accessories.clear();
    const found = accessoryFind(room, this.accessories, this.realm);
    if (!found) return;
    const item = this.accessoryModels.make(found.source);
    item.position.set(...ACCESSORY_POSITION);
    item.rotation.y = -0.4;
    if (accessoryKind(found.source) === 'flower') item.scale.setScalar(1.25);
    chunk.accessories.add(item);
  }

  private populateKeepsakes(chunk: Chunk, room: number): void {
    chunk.keepsakes.clear();
    const found = roomFind(room, this.keepsakes, this.realm);
    if (found) {
      const item = this.makeKeepsake(found);
      item.position.set(-1.65, 0.69, 0.65);
      item.rotation.y = 0.55;
      chunk.keepsakes.add(item);
    }
    const slots = { cup: 0, lantern: 0, postcard: 0 };
    for (const record of this.keepsakes) {
      if (record.room !== room) continue;
      const item = this.makeKeepsake(record);
      const kind = itemKind(record.source);
      const [x, y, z] = ITEM_POSITIONS[kind];
      const slot = slots[kind]++;
      item.position.set(x, y + slot * 0.52, z);
      // Stack cards on the clear wall beside the doorway; the rear wall can
      // be occupied by a bookcase or other generated furniture.
      if (kind === 'postcard') item.rotation.y = -0.51;
      chunk.keepsakes.add(item);
    }
  }

  private round(group: THREE.Group, color: string, size: number[], position: number[]): THREE.Mesh {
    const mesh = this.mesh(this.vessel, color);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    group.add(mesh);
    return mesh;
  }

  private makeKeepsake(record: Keepsake): THREE.Group {
    const group = new THREE.Group();
    const kind = itemKind(record.source);
    group.userData.source = record.source;
    group.userData.kind = kind;
    if (kind === 'cup') {
      this.round(group, '#d9d1b4', [0.23, 0.20, 0.23], [0, 0.1, 0]);
      this.round(group, '#877654', [0.19, 0.012, 0.19], [0, 0.202, 0]);
      const handle = this.mesh(this.handle, '#d9d1b4');
      handle.position.set(0.13, 0.11, 0);
      group.add(handle);
    } else if (kind === 'lantern') {
      this.box(group, '#59685b', [0.27, 0.055, 0.23], [0, 0.03, 0]);
      this.box(group, '#59685b', [0.28, 0.055, 0.25], [0, 0.35, 0]);
      for (const x of [-0.1, 0.1]) for (const z of [-0.08, 0.08]) {
        this.box(group, '#59685b', [0.025, 0.28, 0.025], [x, 0.19, z]);
      }
      const centre = new THREE.Mesh(this.cube, record.lit ? this.glow : this.material('#bcb9a0'));
      centre.scale.set(0.15, 0.22, 0.12);
      centre.position.y = 0.19;
      group.add(centre);
      const handle = this.mesh(this.handle, '#59685b');
      handle.position.y = 0.42;
      group.add(handle);
    } else {
      this.box(group, '#e3ddc7', [0.40, 0.29, 0.022], [0, 0.16, 0]);
      this.box(group, postcard(record.source).color, [0.34, 0.20, 0.025], [0, 0.17, 0.007]);
      this.box(group, '#e7e2ce', [0.10, 0.07, 0.028], [-0.075, 0.20, 0.012]);
      this.box(group, '#778777', [0.34, 0.055, 0.028], [0, 0.10, 0.012]);
    }
    return group;
  }

  private buildChunk(id: number): Chunk {
    const group = new THREE.Group();
    const owned: Chunk['owned'] = [];
    const design = roomDesign(id, this.realm);
    const kind = design.kind;
    const loft = id === this.realm.home && this.trade.loft;
    const wallKey = `${design.window}:${loft}`;
    let walls = this.walls.get(wallKey);
    if (!walls) {
      walls = createWallGeometries(roomWindow(id, this.realm), loft ? 5.35 : 2.65);
      for (const geometry of Object.values(walls)) this.keep(geometry);
      this.walls.set(wallKey, walls);
    }
    const wall = this.mesh(walls.outside, C.stone);
    wall.name = 'outer-wall';
    group.add(wall);
    const inner = this.mesh(walls.inside, kind === 'ruin' ? '#9b988b' : kind === 'camp' ? '#929083' : kind === 'weathered' ? '#8a8e7c' : PALETTES[design.palette].wall);
    inner.name = 'inner-wall';
    inner.castShadow = false;
    group.add(inner);
    if (design.window !== 'none') {
      const reveal = this.mesh(walls.reveals, '#c2bca7', THREE.DoubleSide);
      reveal.name = 'window-reveal';
      group.add(reveal);
      const opening = roomWindow(id, this.realm)!;
      const frame = new THREE.Group();
      frame.position.set(Math.cos(opening.angle) * 2.265, 0, Math.sin(opening.angle) * 2.265);
      frame.rotation.y = Math.PI / 2 - opening.angle;
      const width = 2 * INNER_RADIUS * Math.sin(opening.halfWidth);
      this.box(frame, '#b7ab8e', [width + 0.10, 0.075, 0.34], [0, opening.bottom - 0.025, 0]);
      // A shallow wooden sill; nothing covers the opening or paints over the sky.
      group.add(frame);
    }

    const stairs = new THREE.InstancedMesh(this.step, this.material('#c4c1ac'), STEPS_PER_ROOM);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < STEPS_PER_ROOM; i++) {
      transform.position.y = i * STEP_HEIGHT;
      // Positive polar angles map to negative Three.js Y rotations.
      transform.rotation.y = -i * STEP_ANGLE;
      transform.updateMatrix();
      stairs.setMatrixAt(i, transform.matrix);
      const tint = 0.94 + ((i * 7 + roomSeed(id)) % 11) / 160;
      stairs.setColorAt(i, color.setRGB(tint, tint, tint));
    }
    stairs.castShadow = true;
    stairs.receiveShadow = true;
    stairs.computeBoundingSphere();
    group.add(stairs);
    owned.push(stairs);

    // A real opening through the hollow wall, with a small level threshold.
    this.box(group, '#b4b09b', [1.07, 0.14, 0.96], [2.72, -0.075, 0]);
    this.box(group, '#999b87', [0.32, 2.55, 0.13], [2.43, 1.25, -0.65]);
    this.box(group, '#999b87', [0.32, 2.55, 0.13], [2.43, 1.25, 0.65]);
    this.box(group, '#999b87', [0.32, 0.16, 1.43], [2.43, 2.55, 0]);
    this.box(group, '#777a68', [0.12, 0.1, 1.18], [2.32, 0.015, 0]);
    const { interior, fire } = this.buildRoom(group, id);
    const inhabitant = roomNpc(id, this.realm);
    const npc = inhabitant ? this.life.npc(interior, inhabitant) : null;
    if (id === this.realm.home) this.life.home(interior, group, this.trade);
    const keepsakes = new THREE.Group();
    const accessories = new THREE.Group();
    interior.add(keepsakes, accessories);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#b2b19f';
    context.fillRect(0, 0, 128, 96);
    context.fillStyle = '#555e51';
    context.font = '32px monospace';
    context.textAlign = 'center';
    context.fillText(roomNumber(id), 64, 59);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const signMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
    const signGeometry = new THREE.PlaneGeometry(0.31, 0.23);
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(Math.cos(0.36) * 2.515, 1.55, Math.sin(0.36) * 2.515);
    sign.rotation.y = Math.PI / 2 - 0.36;
    group.add(sign);
    owned.push(texture, signMaterial, signGeometry);
    const chunk = { group, interior, keepsakes, accessories, fire, npc, owned, design };
    this.populateKeepsakes(chunk, id);
    this.populateAccessories(chunk, id);
    return chunk;
  }

  private buildRoom(group: THREE.Group, room: number): { interior: THREE.Group; fire: Campfire | null } {
    const design = roomDesign(room, this.realm);
    const { kind, layout } = design;
    const seed = roomSeed(roomKey(room, this.realm));
    const palette = PALETTES[design.palette];
    const rustic = kind === 'ruin' || kind === 'camp';
    const floor = this.mesh(this.floor, rustic ? '#999484' : palette.floor, THREE.DoubleSide);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    group.add(floor);
    const ceiling = this.mesh(this.floor, '#8d927e', THREE.DoubleSide);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = room === this.realm.home && this.trade.loft ? 5.35 : 2.65;
    group.add(ceiling);
    const furniture = new THREE.Group();
    group.add(furniture);
    group = furniture;
    if (kind === 'shelter' || kind === 'library' || kind === 'dining' || kind === 'mending') {
      for (let i = -6; i <= 6; i++) {
        const z = i * 0.32;
        const length = Math.sqrt(Math.max(0, INNER_RADIUS ** 2 - (Math.abs(z) + 0.16) ** 2)) * 2;
        this.box(group, i % 3 === 0 ? palette.wood : palette.floor, [length, 0.035, 0.304], [0, 0, z]);
      }
    }
    if (kind === 'shelter') {
      this.box(group, '#89876b', [1.1, 0.055, 0.77], [-0.14, 0.04, -1.35], -0.08);
      this.box(group, palette.cloth, [1.03, 0.13, 0.66], [-0.14, 0.13, -1.35], -0.08);
      this.box(group, '#c5bfa3', [0.26, 0.13, 0.47], [-0.47, 0.21, -1.32], -0.08);
    } else if (kind === 'weathered') {
      this.box(group, '#858b79', [0.58, 0.43, 0.45], [-0.6, 0.2, 1.3], 0.2);
      for (let i = 0; i < 5; i++) {
        this.box(group, i % 2 ? '#929783' : '#bab8a2', [0.13 + i * 0.023, 0.06, 0.21], [-0.3 + i * 0.2, 0.03, 1.42 - ((seed + i) % 4) * 0.16], i);
      }
      this.box(group, '#777f6d', [0.035, 1.2, 0.65], [-2.12, 1.1, 0.28], -0.12);
    }

    // Every room offers a simple seat; clutter is kept clear of the entrance.
    const wood = kind === 'weathered' ? '#6b7462' : palette.wood;
    this.box(group, wood, [0.52, 0.09, 0.82], [SEAT.x, 0.46, SEAT.z]);
    if (rustic) {
      this.box(group, kind === 'ruin' ? '#858477' : '#786e57', [0.49, 0.41, 0.70], [SEAT.x, 0.22, SEAT.z]);
      this.box(group, palette.cloth, [0.42, 0.025, 0.34], [SEAT.x, 0.52, SEAT.z + 0.12], 0.07);
    } else {
      this.box(group, wood, [0.07, 0.48, 0.82], [SEAT.x - 0.23, 0.72, SEAT.z]);
      for (const x of [-0.18, 0.18]) for (const z of [-0.32, 0.32]) {
        this.box(group, wood, [0.065, 0.43, 0.065], [SEAT.x + x, 0.23, SEAT.z + z]);
      }
      if (kind !== 'empty' && kind !== 'weathered') this.box(group, palette.cloth, [0.43, 0.055, 0.66], [SEAT.x + 0.015, 0.53, SEAT.z]);
    }
    if (!rustic) {
      this.box(group, C.dark, [0.20, 0.045, 0.20], [0.2, 2.60, -0.15]);
      const bulb = this.box(group, '#e8ddba', [0.09, 0.10, 0.09], [0.2, 2.52, -0.15]);
      bulb.castShadow = false;
    }
    if (!['ruin', 'camp', 'dining', 'mending'].includes(kind)) this.addEverydayObjects(group, kind, seed, design.details);
    this.addRoomVariation(group, room);
    const fire = this.stories.add(group, room);
    // A small find on the left, and a table for the things brought from elsewhere.
    this.box(group, C.wood, [0.60, 0.06, 0.45], [-1.65, 0.65, 0.65]);
    if (rustic) this.box(group, kind === 'ruin' ? '#8d8a7b' : wood, [0.48, 0.62, 0.37], [-1.65, 0.32, 0.65]);
    else for (const x of [-1.88, -1.42]) for (const z of [0.49, 0.81]) {
      this.box(group, C.wood, [0.055, 0.63, 0.055], [x, 0.32, z]);
    }
    this.box(group, wood, [0.94, 0.07, 0.56], [-0.30, 0.68, 1.38]);
    if (rustic) {
      for (const x of [-0.57, -0.03]) this.box(group, kind === 'ruin' ? '#8d8a7b' : wood, [0.29, 0.62, 0.45], [x, 0.33, 1.38]);
    } else if (layout === 0) {
      this.box(group, wood, [0.09, 0.65, 0.09], [-0.30, 0.33, 1.38]);
      this.box(group, wood, [0.64, 0.06, 0.45], [-0.30, 0.05, 1.38]);
    } else for (const x of [-0.65, 0.05]) for (const z of [1.18, 1.58]) {
      this.box(group, wood, [0.065, 0.65, 0.065], [x, 0.33, z]);
    }
    if (layout === 2) this.box(group, palette.cloth, [0.24, 0.016, 0.57], [-0.52, 0.724, 1.38]);
    this.round(group, '#a6afa0', [0.24, 0.21, 0.24], [-0.30, 0.83, 1.38]);
    this.round(group, '#657663', [0.26, 0.045, 0.26], [-0.30, 0.95, 1.38]);
    this.box(group, '#a6afa0', [0.07, 0.07, 0.14], [-0.30, 0.89, 1.24], -0.15);
    if (accessoryFind(room, [], this.realm)) {
      this.box(group, wood, [0.66, 0.055, 0.48], [1.05, 0.57, -1.45]);
      for (const x of [0.80, 1.30]) this.box(group, wood, [0.065, 0.55, 0.36], [x, 0.28, -1.45]);
    }
    return { interior: furniture, fire };
  }

  private addEverydayObjects(group: THREE.Group, kind: RoomKind, seed: number, details: number): void {
    const round = (color: string, size: number[], position: number[]): THREE.Mesh => {
      const mesh = this.mesh(this.vessel, color);
      mesh.scale.set(size[0], size[1], size[2]);
      mesh.position.set(position[0], position[1], position[2]);
      group.add(mesh);
      return mesh;
    };
    const colors = ['#8c785b', '#71816e', '#a08e75', '#b2a78d', '#7a8582'];
    // Shallow wall shelves leave the centre of the little room open.
    this.box(group, C.wood, [0.30, 0.055, 1.0], [-1.94, 1.32, 0.28]);
    if (kind !== 'empty') this.box(group, C.wood, [0.30, 0.055, 1.0], [-1.94, 1.90, 0.28]);
    const bookCount = kind === 'empty' ? 1 : 2 + details % 5;
    for (let i = 0; i < bookCount; i++) {
      const height = 0.22 + ((seed + i * 3) % 4) * 0.045;
      const book = this.box(group, colors[(seed + i) % colors.length], [0.18, height, 0.095], [-1.91, 1.35 + height / 2, -0.09 + i * 0.12]);
      if (i === bookCount - 1) book.rotation.x = -0.13;
    }
    // A faded framed picture, a hanging towel, and a pair of worn slippers.
    if (details % 3 === 0) {
      this.box(group, '#696f5a', [0.055, 0.52, 0.55], [-2.13, 1.69, -0.56], -0.25);
      this.box(group, '#b4b398', [0.06, 0.42, 0.45], [-2.09, 1.69, -0.55], -0.25);
      this.box(group, '#8c987e', [0.065, 0.12, 0.36], [-2.075, 1.61, -0.55], -0.25);
    }
    if (details % 2 === 0) {
      this.box(group, C.wood, [0.62, 0.065, 0.07], [0.53, 1.64, -2.08], -0.24);
      this.box(group, kind === 'shelter' ? '#b8ac8b' : '#969781', [0.38, 0.52, 0.035], [0.51, 1.37, -2.035], -0.24);
    }
    if (kind === 'shelter' || details % 4 === 0) {
      for (let i = 0; i < 2; i++) {
        this.box(group, '#77775f', [0.13, 0.055, 0.28], [1.48 + i * 0.18, 0.05, -0.55], -0.22 + i * 0.18);
        this.box(group, '#959078', [0.13, 0.06, 0.13], [1.47 + i * 0.18, 0.09, -0.60], -0.22 + i * 0.18);
      }
    }
    if (kind === 'shelter') {
      this.box(group, '#8d947a', [1.05, 0.015, 1.22], [0.25, 0.032, 0.28], 0.04);
      round('#808c7c', [0.16, 0.25, 0.16], [-1.94, 2.05, 0.48]);
      round('#808c7c', [0.07, 0.1, 0.07], [-1.94, 2.22, 0.48]);
      // A folded blanket at the foot of the bed.
      this.box(group, '#848e79', [0.30, 0.055, 0.64], [0.20, 0.225, -1.36], -0.08);
      round('#9f8168', [0.30, 0.25, 0.30], [-1.20, 0.15, 1.35]);
      for (let i = 0; i < 4; i++) {
        const plant = this.mesh(this.leaf, i % 2 ? '#788569' : '#67775c');
        plant.scale.set(0.25, 0.48, 0.19);
        plant.position.set(-1.20 + Math.cos(i * 1.7) * 0.10, 0.49, 1.35 + Math.sin(i * 1.7) * 0.10);
        plant.rotation.z = Math.cos(i * 1.7) * 0.35;
        group.add(plant);
      }
    } else if (kind === 'empty' || kind === 'weathered') {
      round('#96947e', [0.26, 0.33, 0.26], [-1.18, 0.17, 1.4]);
      if (kind === 'weathered') {
        for (let i = 0; i < 3; i++) {
          const stem = this.box(group, '#747660', [0.025, 0.42, 0.025], [-1.18 + i * 0.045, 0.45, 1.4]);
          stem.rotation.z = (i - 1) * 0.35;
        }
        this.box(group, '#b2aa8b', [0.33, 0.04, 0.24], [-0.61, 0.44, 1.3], 0.2);
      }
    }
  }

  private addRoomVariation(group: THREE.Group, room: number): void {
    const { kind, layout, palette: paletteIndex, details } = roomDesign(room, this.realm);
    const palette = PALETTES[paletteIndex];
    const colors = ['#a89476', '#7f9281', '#9892a1', '#b3ac8d', '#81969b'];
    if (kind === 'library' || kind === 'studio' || kind === 'greenhouse') {
      this.box(group, palette.cloth, [0.95 + layout * 0.13, 0.018, 1.05], [0.18, 0.035, 0.1], (layout - 1) * 0.12);
    }
    if (kind === 'library') {
      const width = layout === 1 ? 0.96 : 1.35;
      this.box(group, palette.wood, [width, 1.85, 0.055], [-0.05, 0.94, -1.90]);
      for (const x of [-0.05 - width / 2, -0.05 + width / 2]) this.box(group, palette.wood, [0.06, 1.90, 0.30], [x, 0.95, -1.77]);
      for (let shelf = 0; shelf < 4; shelf++) {
        const y = 0.13 + shelf * 0.46;
        this.box(group, palette.wood, [width, 0.05, 0.32], [-0.05, y, -1.76]);
        const count = (layout === 1 ? 4 : 6) + (details + shelf) % 2;
        for (let i = 0; i < count; i++) {
          const height = 0.23 + ((details + i * 3 + shelf) % 4) * 0.04;
          const book = this.box(group, colors[(i + shelf + details) % colors.length], [0.10, height, 0.19], [-width / 2 + 0.05 + i * 0.17, y + height / 2 + 0.026, -1.70]);
          if (i === count - 1) book.rotation.z = -0.12;
        }
      }
      for (let i = 0; i < 3; i++) this.box(group, colors[(details + i) % 5], [0.27, 0.06, 0.34], [-1.1, 0.07 + i * 0.065, 1.32], i * 0.12);
    } else if (kind === 'greenhouse') {
      for (const [index, { x, z, height }] of roomPlants(room, this.realm).entries()) {
        this.round(group, index % 2 ? '#a08771' : '#949d89', [0.33, 0.26, 0.33], [x, 0.15, z]);
        this.round(group, '#616b50', [0.30, 0.025, 0.30], [x, 0.285, z]);
        for (let branch = 0; branch < 5; branch++) {
          const angle = branch * 2.4 + details;
          const leaf = this.mesh(this.leaf, branch % 2 ? '#8b9d76' : '#71856b');
          leaf.position.set(x + Math.cos(angle) * 0.09, 0.3 + height * 0.43, z + Math.sin(angle) * 0.09);
          leaf.scale.set(0.20, height, 0.17);
          leaf.rotation.set(Math.sin(angle) * 0.3, angle, Math.cos(angle) * 0.3);
          group.add(leaf);
        }
      }
      this.round(group, '#8b9c92', [0.23, 0.27, 0.23], [0.62, 0.16, -0.90]);
      this.box(group, '#8b9c92', [0.06, 0.09, 0.22], [0.62, 0.20, -0.71], 0.15);
    } else if (kind === 'studio') {
      this.box(group, palette.wood, [1.30, 0.08, 0.48], [-0.05, 0.76, -1.70]);
      for (const x of [-0.57, 0.47]) this.box(group, palette.wood, [0.09, 0.75, 0.38], [x, 0.38, -1.70]);
      this.box(group, '#d0c7ab', [0.46, 0.012, 0.32], [-0.15, 0.808, -1.68], 0.12 * (layout - 1));
      for (let i = 0; i < 3; i++) {
        this.round(group, colors[(details + i) % 5], [0.11, 0.12 + i * 0.035, 0.11], [-0.51 + i * 0.12, 0.88, -1.80]);
      }
      this.box(group, '#796751', [0.025, 0.022, 0.30], [0.28, 0.82, -1.62], -0.32);
      this.box(group, '#727a73', [0.16, 0.065, 0.06], [0.24, 0.84, -1.75], -0.32);
      this.box(group, palette.wood, [0.42, 0.46, 0.38], [-1.21, 0.23, 1.35], 0.18);
    } else if (kind === 'empty') {
      // Some rooms are almost bare, with only a folded cloth or an abandoned crate.
      if (layout === 1) this.box(group, palette.cloth, [0.44, 0.045, 0.34], [-0.20, 0.03, -1.55], 0.17);
      if (layout === 2) this.box(group, palette.wood, [0.54, 0.35, 0.36], [-0.20, 0.18, -1.70], -0.08);
    } else if (kind === 'weathered') {
      for (let i = 0; i < 4 + layout; i++) {
        this.box(group, '#878c78', [0.012, 0.004, 0.24 + i * 0.04], [-0.55 + i * 0.18, 0.008, -1.46 + i * 0.12], (details + i) % 6);
      }
    }
  }

  dispose(): void {
    this.accessoryModels.dispose();
    this.stories.dispose();
    for (const chunk of this.chunks.values()) for (const resource of chunk.owned) resource.dispose();
    for (const resource of this.resources) resource.dispose();
    this.chunks.clear();
    this.group.removeFromParent();
    this.lamp.removeFromParent();
    this.lanternLight.removeFromParent();
    this.fireLight.removeFromParent();
    this.loftLight.removeFromParent();
  }
}
