export const TAU = Math.PI * 2;
export const STEPS_PER_TURN = 45;
export const STEP_ANGLE = TAU / STEPS_PER_TURN;
export const STEP_HEIGHT = 0.17;
export const STEPS_PER_ROOM = STEPS_PER_TURN;
export const ROOM_HEIGHT = STEPS_PER_ROOM * STEP_HEIGHT;
export const TOWER_RADIUS = 2.5;
export const INNER_RADIUS = 2.28;
export const PATH_RADIUS = 2.92;
export const STAIR_WIDTH = 0.84;
export const STEP_LENGTH = Math.hypot(PATH_RADIUS * STEP_ANGLE, STEP_HEIGHT);
export const CHUNK_RADIUS = 5;
export const STORAGE_KEY = 'still-tower.walk.v1';
const ROOM_LIMIT = 10_000_000;
const SOURCE_SPAN = ROOM_LIMIT * 2 + 1;
export const MAX_CYCLE = 1_000_000;
// 28 bits leave room for the room number in an exact JavaScript integer.
// Seeds 0..MAX_CYCLE are reserved for worlds from saves made before v5.
export const MAX_SEED = 0x0fffffff;
export interface Realm {
  cycle: number;
  seed: number;
  usedSeeds: number[];
  home: number | null;
  /** Kept until the next return, even if the player chooses a different home. */
  preserved: { room: number; cycle: number; seed: number } | null;
}
function newSeed(usedSeeds: readonly number[]): number {
  const buffer = new Uint32Array(1);
  let seed: number;
  do { seed = crypto.getRandomValues(buffer)[0] & MAX_SEED; }
  while (seed <= MAX_CYCLE || usedSeeds.includes(seed));
  return seed;
}
export const initialRealm = (seed = newSeed([])): Realm => ({ cycle: 0, seed, usedSeeds: seed > MAX_CYCLE ? [seed] : [], home: null, preserved: null });
export const roomCycle = (room: number, realm?: Realm): number => realm?.preserved?.room === room ? realm.preserved.cycle : realm?.cycle ?? 0;
export const roomSeedId = (room: number, realm?: Realm): number => realm?.preserved?.room === room ? realm.preserved.seed : realm?.seed ?? 0;
/** Finds retain their original seed even after their tower has disappeared. */
export const itemSource = (room: number, realm?: Realm): number => roomSeedId(room, realm) * SOURCE_SPAN + room;
export const sourceSeed = (source: number): number => Math.floor((source + ROOM_LIMIT) / SOURCE_SPAN);
export const sourceRoom = (source: number): number => source - sourceSeed(source) * SOURCE_SPAN;
const sourceKey = (source: number): number => sourceSeed(source) === 0 ? sourceRoom(source) : sourceRoom(source) ^ roomSeed(sourceSeed(source) ^ 0x7f4a7c15);
export const roomKey = (room: number, realm?: Realm): number => sourceKey(itemSource(room, realm));

export type Place = 'stairs' | 'room' | 'rest';
export type RoomKind = 'shelter' | 'empty' | 'weathered' | 'library' | 'greenhouse' | 'studio'
  | 'ruin' | 'camp' | 'dining' | 'mending';
export type LookMode = 'walk' | 'down' | 'up' | 'far';
export const ITEM_KINDS = ['cup', 'lantern', 'postcard'] as const;
export type ItemKind = typeof ITEM_KINDS[number];
export const ITEM_NAMES: Record<ItemKind, string> = { cup: 'カップ', lantern: 'ランタン', postcard: '絵葉書' };
/** One find per source room; null means that the player is carrying it. */
export interface Keepsake { source: number; room: number | null | 'lost'; lit: boolean }
export type AccessoryKind = 'hat' | 'flower';
export interface Accessory { source: number; worn: boolean }
export const ACCESSORY_NAMES: Record<AccessoryKind, string> = { hat: '旅の帽子', flower: '小さな花' };
export const WALK_SPEED = { slow: 0.69, normal: 1.02, fast: 2.1 } as const;
export interface WalkState {
  steps: number;
  direction: number;
  place: Place;
  room: number;
  x: number;
  z: number;
}
export interface Preferences {
  pace: 'slow' | 'normal' | 'fast';
  quality: 'standard' | 'light';
}
export interface SavedWalk {
  version: 5;
  state: WalkState;
  preferences: Preferences;
  visitedRooms: number[];
  keepsakes: Keepsake[];
  accessories: Accessory[];
  realm: Realm;
  returning: boolean;
}

export const initialState = (): WalkState => ({
  steps: -4, direction: 1, place: 'stairs', room: 0, x: 1.45, z: 0,
});
export const defaultPreferences = (): Preferences => ({ pace: 'slow', quality: 'standard' });
export const nearestRoom = (steps: number): number => Math.round(steps / STEPS_PER_ROOM);
export const entranceDistance = (steps: number): number => Math.abs(steps - nearestRoom(steps) * STEPS_PER_ROOM);
export const canEnter = (steps: number): boolean => entranceDistance(steps) <= 2.1;
export const roomNumber = (room: number): string => `${room < 0 ? '−' : ''}${Math.abs(room).toString().padStart(3, '0')}`;

export function stairPose(steps: number, origin: number): { x: number; y: number; z: number; angle: number } {
  // Reduce the angle before trigonometry. Origin rebasing keeps rendered heights small.
  const angle = (steps % STEPS_PER_TURN) * STEP_ANGLE;
  return { x: Math.cos(angle) * PATH_RADIUS, y: steps * STEP_HEIGHT - origin, z: Math.sin(angle) * PATH_RADIUS, angle };
}

export function roomSeed(room: number): number {
  let n = (Math.trunc(room) ^ 0x61c88647) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function roomKind(room: number, realm?: Realm): RoomKind {
  if (room === 0 && roomSeedId(room, realm) === 0) return 'shelter';
  const key = roomKey(room, realm);
  const story = roomSeed(key ^ 0x68bc21eb) % 10;
  if (story < 4) return (['ruin', 'camp', 'dining', 'mending'] as const)[story];
  return (['empty', 'weathered', 'shelter', 'library', 'greenhouse', 'studio'] as const)[roomSeed(key) % 6];
}

/** Independent, repeatable choices: returning to a room never reshuffles its contents. */
export function roomDesign(room: number, realm?: Realm) {
  const seed = roomSeed(roomKey(room, realm) ^ 0x4f1bbcdc);
  return {
    kind: roomKind(room, realm),
    palette: seed % 4,
    layout: (seed >>> 5) % 3,
    window: (room === 0 && roomSeedId(room, realm) === 0) || seed % 5 > 1 ? 'none' as const : seed % 5 === 0 ? 'wide' as const : 'tall' as const,
    details: seed >>> 8,
  };
}

export interface RoomWindow { angle: number; halfWidth: number; bottom: number; top: number }
export function roomWindow(room: number, realm?: Realm): RoomWindow | null {
  const type = roomDesign(room, realm).window;
  if (type === 'none') return null;
  return { angle: Math.PI * 1.22, halfWidth: type === 'wide' ? 0.37 : 0.23, bottom: type === 'wide' ? 1.04 : 0.78, top: 2.27 };
}

export function roomPlants(room: number, realm?: Realm) {
  const { layout, details } = roomDesign(room, realm);
  const positions = [[-0.42, -1.66], [0.32, -1.72], [-1.55, -1.18], [-1.20, 1.35]];
  return positions.filter((_, index) => (index + layout) % 4 !== 0).map(([x, z], index) => ({
    x, z, height: 0.45 + ((details + index) % 4) * 0.13,
  }));
}

/** Shared by the visible hearth, its light, and walking collision. */
export function roomCampfire(room: number, realm?: Realm) {
  if (roomKind(room, realm) !== 'camp') return null;
  return { x: 0.20, z: -0.12, r: 0.55, embers: roomDesign(room, realm).layout === 2 };
}

export function roomObstacles(room: number, realm?: Realm) {
  const obstacles = [
    { x: -0.85, z: -0.7, r: 0.48 }, { x: -0.30, z: 1.38, r: 0.52 }, { x: -1.65, z: 0.65, r: 0.37 },
  ];
  const kind = roomKind(room, realm);
  if (kind === 'shelter') obstacles.push({ x: -0.14, z: -1.35, r: 0.6 });
  if (['library', 'studio', 'ruin', 'camp', 'dining', 'mending'].includes(kind)) obstacles.push({ x: -0.05, z: -1.72, r: 0.68 });
  if (kind === 'studio' || kind === 'mending') obstacles.push({ x: -1.21, z: 1.35, r: 0.32 });
  const fire = roomCampfire(room, realm);
  if (fire) obstacles.push({ x: fire.x, z: fire.z, r: fire.r });
  if (kind === 'empty' && roomDesign(room, realm).layout === 2) obstacles.push({ x: -0.20, z: -1.70, r: 0.36 });
  if (kind === 'greenhouse') obstacles.push(...roomPlants(room, realm).map(({ x, z }) => ({ x, z, r: 0.27 })));
  if (accessoryFind(room, [], realm)) obstacles.push({ x: 1.05, z: -1.45, r: 0.41 });
  return obstacles;
}

/** Slide around furniture without letting a wall-side obstacle push the player outside. */
export function constrainRoomPosition(room: number, x: number, z: number, realm?: Realm) {
  const radius = 1.98;
  const length = Math.hypot(x, z);
  if (length > radius) { x *= radius / length; z *= radius / length; }
  const obstacles = roomObstacles(room, realm);
  for (let pass = 0; pass < 4; pass++) for (const obstacle of obstacles) {
    const gap = Math.hypot(x - obstacle.x, z - obstacle.z);
    if (gap >= obstacle.r - 1e-8) continue;
    const d = Math.hypot(obstacle.x, obstacle.z);
    const dx = gap > 1e-8 ? (x - obstacle.x) / gap : -obstacle.x / d;
    const dz = gap > 1e-8 ? (z - obstacle.z) / gap : -obstacle.z / d;
    const nextX = obstacle.x + dx * obstacle.r;
    const nextZ = obstacle.z + dz * obstacle.r;
    if (Math.hypot(nextX, nextZ) <= radius) { x = nextX; z = nextZ; continue; }
    // Choose the nearer intersection of the room boundary and the furniture boundary.
    const a = (radius * radius - obstacle.r * obstacle.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, radius * radius - a * a));
    const ux = obstacle.x / d, uz = obstacle.z / d;
    const candidates = [-1, 1].map((sign) => ({ x: ux * a - sign * uz * h, z: uz * a + sign * ux * h }));
    candidates.sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z));
    ({ x, z } = candidates[0]);
  }
  return { x, z };
}

export const accessoryKind = (source: number): AccessoryKind => roomSeed(sourceKey(source) ^ 0x1b873593) % 2 === 0 ? 'hat' : 'flower';
export const accessoryColor = (source: number): string => {
  const colors = accessoryKind(source) === 'hat' ? ['#b49a70', '#7c8b78', '#8a7770'] : ['#d2ac83', '#b5a8c2', '#e2d9b2'];
  return colors[(roomSeed(sourceKey(source) ^ 0x85ebca6b) >>> 4) % colors.length];
};
const hasAccessory = (source: number): boolean => roomSeed(sourceKey(source) ^ 0x27d4eb2d) % 5 < 2;
export function accessoryFind(room: number, accessories: Accessory[], realm?: Realm): Accessory | null {
  const source = itemSource(room, realm);
  return hasAccessory(source) && !accessories.some((item) => item.source === source) ? { source, worn: false } : null;
}

export const itemKind = (source: number): ItemKind => ITEM_KINDS[(((sourceRoom(source) + sourceSeed(source)) % 3) + 3) % 3];
export const roomFind = (room: number, keepsakes: Keepsake[], realm?: Realm): Keepsake | null =>
  keepsakes.some((item) => item.source === itemSource(room, realm)) ? null : { source: itemSource(room, realm), room, lit: false };
export const canPlace = (item: Keepsake, room: number, keepsakes: Keepsake[]): boolean =>
  item.room === null && !keepsakes.some((other) => other.room === room && itemKind(other.source) === itemKind(item.source));

const POSTCARDS = [
  { title: '白い午後', text: '窓の向こうは、今日も白い。\nそれでも、昨日とは少し違う気がする。\nここでお茶を飲んでから、また歩こう。', color: '#adb9a0' },
  { title: '灯りのある場所', text: '帰るころには、灯りをつけておきます。\n部屋の番号を忘れても、\nあの暖かい色を探してください。', color: '#c6a47e' },
  { title: '雲の手紙', text: '雲がゆっくり横切っていった。\n急いで伝えることは、何もない。\nただ、きれいだったので。', color: '#9dafbf' },
  { title: '遠い朝', text: '上のほうで、朝のような色を見ました。\nあそこに時計はないけれど、\nきっと誰かが目を覚ましたのでしょう。', color: '#c6b38b' },
  { title: '置いていくもの', text: '小さな机と、使い慣れたカップ。\n次にここへ来る人が、\n少し長く休めますように。', color: '#a6b4ac' },
  { title: '途中の景色', text: 'どこまで来たか、わからなくなったら、\n少し立ち止まって見上げてみる。\n階段は、まだ続いている。', color: '#aaa7bd' },
] as const;
export const postcard = (source: number) => POSTCARDS[roomSeed(sourceKey(source)) % POSTCARDS.length];

export function visibleChunks(anchor: number): number[] {
  return Array.from({ length: CHUNK_RADIUS * 2 + 1 }, (_, i) => anchor + i - CHUNK_RADIUS);
}

/** Lost finds stay recorded, so an item taken from home and left elsewhere cannot respawn at home. */
export function renewTower(saved: SavedWalk): SavedWalk {
  const home = saved.realm.home;
  if (home === null || saved.realm.cycle >= MAX_CYCLE) return { ...saved, returning: false };
  const seed = newSeed(saved.realm.usedSeeds);
  return {
    ...saved, returning: false,
    state: { ...initialState(), place: 'room', room: home, steps: home * STEPS_PER_ROOM, x: 0.95, z: 0 },
    realm: {
      cycle: saved.realm.cycle + 1, seed, usedSeeds: [...saved.realm.usedSeeds, seed], home,
      preserved: { room: home, cycle: roomCycle(home, saved.realm), seed: roomSeedId(home, saved.realm) },
    },
    visitedRooms: [home],
    keepsakes: saved.keepsakes.map((item) => item.room === null || item.room === home ? { ...item } : { ...item, room: 'lost', lit: false }),
    accessories: saved.accessories.map((item) => ({ ...item })),
  };
}

export function parseSave(raw: string | null): SavedWalk | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    const s = saved?.state;
    if (![1, 2, 3, 4, 5].includes(saved?.version) || !s || !['stairs', 'room', 'rest'].includes(s.place)) return null;
    if (![s.steps, s.direction, s.room, s.x, s.z].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    if (Math.abs(s.steps) > 1e9 || !Number.isSafeInteger(s.room) || Math.abs(s.room) > 1e7) return null;
    if (s.direction !== 1 && s.direction !== -1) return null;
    if (Math.hypot(s.x, s.z) > 2.05) return null;
    const savedSpacing = saved.version === 1 ? 90 : STEPS_PER_ROOM;
    if (s.place !== 'stairs' && Math.abs(s.steps - s.room * savedSpacing) > 0.01) return null;
    const visitedRooms = new Set<number>(Array.isArray(saved.visitedRooms)
      ? saved.visitedRooms.filter((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && Math.abs(id) <= 1e7)
      : []);
    // Old saves did not track visits. Preserve the current room when known.
    if (s.place !== 'stairs') visitedRooms.add(s.room);
    const keepsakes: Keepsake[] = [];
    const sources = new Set<number>();
    const occupied = new Set<string>();
    const validRoom = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && Math.abs(id) <= 1e7;
    const validCycle = (cycle: unknown): cycle is number => typeof cycle === 'number' && Number.isSafeInteger(cycle) && cycle >= 0 && cycle <= MAX_CYCLE;
    const validSeed = (seed: unknown): seed is number => typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0 && seed <= MAX_SEED;
    // Preserve the exact layouts and item identities of older saves. Randomness
    // starts at their next return, rather than changing rooms during migration.
    const realm = initialRealm(0);
    if (saved.version >= 4) {
      const r = saved.realm;
      if (!r || !validCycle(r.cycle) || !(r.home === null || validRoom(r.home))) return null;
      realm.cycle = r.cycle;
      realm.home = r.home;
      realm.seed = r.cycle;
      if (saved.version === 5) {
        if (!validSeed(r.seed) || !Array.isArray(r.usedSeeds) || r.usedSeeds.length > r.cycle + 1
          || !r.usedSeeds.every((seed: unknown) => validSeed(seed) && seed > MAX_CYCLE)
          || new Set(r.usedSeeds).size !== r.usedSeeds.length) return null;
        realm.seed = r.seed;
        realm.usedSeeds = [...r.usedSeeds];
        if (r.seed <= MAX_CYCLE ? r.seed !== r.cycle : !realm.usedSeeds.includes(r.seed)) return null;
      }
      if (r.preserved !== null) {
        if (!r.preserved || !validRoom(r.preserved.room) || !validCycle(r.preserved.cycle) || r.preserved.cycle > r.cycle) return null;
        const seed = saved.version === 5 ? r.preserved.seed : r.preserved.cycle;
        if (!validSeed(seed) || (seed <= MAX_CYCLE ? seed !== r.preserved.cycle : !realm.usedSeeds.includes(seed))) return null;
        realm.preserved = { room: r.preserved.room, cycle: r.preserved.cycle, seed };
      }
    }
    const usedSeeds = new Set(realm.usedSeeds);
    const validSource = (source: unknown): source is number => typeof source === 'number' && Number.isSafeInteger(source)
      && source >= -ROOM_LIMIT && source <= MAX_SEED * SOURCE_SPAN + ROOM_LIMIT
      && (sourceSeed(source) <= MAX_CYCLE ? sourceSeed(source) <= realm.cycle : usedSeeds.has(sourceSeed(source)));
    if (saved.version >= 2 && Array.isArray(saved.keepsakes)) for (const item of saved.keepsakes) {
      if (!item || !validSource(item.source) || sources.has(item.source)) continue;
      let room: Keepsake['room'] = saved.version >= 4 && item.room === 'lost' ? 'lost' : validRoom(item.room) ? item.room : null;
      const slot = `${room}:${itemKind(item.source)}`;
      // Repair duplicate placements without throwing away a collected item.
      if (typeof room === 'number' && occupied.has(slot)) room = null;
      if (typeof room === 'number') occupied.add(slot);
      sources.add(item.source);
      keepsakes.push({ source: item.source, room, lit: itemKind(item.source) === 'lantern' && typeof room === 'number' && item.lit === true });
    }
    const accessories: Accessory[] = [];
    const accessorySources = new Set<number>();
    const wornKinds = new Set<AccessoryKind>();
    if (saved.version >= 3 && Array.isArray(saved.accessories)) for (const item of saved.accessories) {
      if (!item || !validSource(item.source) || accessorySources.has(item.source) || !hasAccessory(item.source)) continue;
      const kind = accessoryKind(item.source);
      const worn = item.worn === true && !wornKinds.has(kind);
      if (worn) wornKinds.add(kind);
      accessorySources.add(item.source);
      accessories.push({ source: item.source, worn });
    }
    return {
      version: 5,
      state: { steps: s.steps * STEPS_PER_ROOM / savedSpacing, direction: s.direction, room: s.room, place: s.place, x: s.x, z: s.z },
      preferences: {
        pace: saved.preferences?.pace === 'fast' ? 'fast' : saved.preferences?.pace === 'normal' ? 'normal' : 'slow',
        quality: saved.preferences?.quality === 'light' ? 'light' : 'standard',
      },
      visitedRooms: [...visitedRooms].sort((a, b) => a - b),
      keepsakes,
      accessories,
      realm,
      returning: saved.version >= 4 && saved.returning === true && realm.home !== null,
    };
  } catch { return null; }
}
