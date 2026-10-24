import * as THREE from 'three';
import { Character } from './character.ts';
import { Atmosphere } from './atmosphere.ts';
import { ROOM_NAMES, SEAT, TowerWorld } from './world.ts';
import { RETURN_AT, RETURN_END, fallPose, whiteoutAt } from './return.ts';
import {
  INNER_RADIUS, ROOM_HEIGHT, STEP_HEIGHT, STEP_LENGTH, STEPS_PER_ROOM, STORAGE_KEY, TOWER_RADIUS, MAX_CYCLE,
  ACCESSORY_NAMES, ITEM_NAMES, WALK_SPEED, accessoryFind, accessoryKind, canEnter, canPlace, constrainRoomPosition, defaultPreferences, initialState, itemKind, nearestRoom,
  initialRealm, itemSource, parseSave, renewTower, roomDesign, roomFind, roomKind, roomNumber, roomWindow, stairPose,
} from './model.ts';
import type { Accessory, Keepsake, LookMode, Preferences, Realm, SavedWalk, WalkState } from './model.ts';

export interface GameFrame {
  state: WalkState;
  placeLabel: string;
  action: string | null;
  transitioning: boolean;
  saving: boolean;
  lookMode: LookMode;
  looking: boolean;
  visitedCount: number;
  keepsakes: Keepsake[];
  accessories: Accessory[];
  reading: number | null;
  tea: boolean;
  notice: string;
  falling: boolean;
  whiteout: number;
}
interface Transition { from: THREE.Vector3; to: THREE.Vector3; time: number; duration: number }

export class TowerGame {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(49, 1, 0.06, 72);
  readonly world: TowerWorld;
  readonly atmosphere: Atmosphere;
  readonly character = new Character();
  readonly input = new Set<string>();
  state = initialState();
  preferences = defaultPreferences();
  hasSave = false;
  running = false;
  canSave = true;
  lookMode: LookMode = 'walk';
  readonly visitedRooms = new Set<number>();
  readonly keepsakes: Keepsake[] = [];
  readonly accessories: Accessory[] = [];
  readonly realm: Realm;
  private fall: { elapsed: number; steps: number; returned: boolean } | null = null;
  reading: number | null = null;
  tea = false;
  private notice = '';
  private noticeTime = 0;
  onFrame: (frame: GameFrame) => void = () => {};
  private origin = 0;
  private velocity = 0;
  private cameraDirection = 1;
  private roomBlend = 0;
  private lookBlend = 0;
  private lookPreset: Exclude<LookMode, 'walk'> = 'far';
  private previousPace: 'slow' | 'normal' = 'slow';
  private transition: Transition | null = null;
  private target = new THREE.Vector3();
  private firstFrame = true;
  private lastTime = 0;
  private saveElapsed = 0;
  private raf = 0;
  private disposed = false;
  private readonly sunlight = new THREE.DirectionalLight('#fff5dc', 2.6);
  private readonly resizeObserver: ResizeObserver;
  private readonly visibilityHandler = () => { if (document.hidden) this.save(); };
  private readonly pageHideHandler = () => this.save();

  constructor(private readonly container: HTMLElement) {
    let saved: SavedWalk | null = null;
    try {
      const loaded = parseSave(localStorage.getItem(STORAGE_KEY));
      saved = loaded?.returning ? renewTower(loaded) : loaded;
    } catch { this.canSave = false; }
    this.realm = saved?.realm ?? initialRealm();
    if (saved) {
      this.state = saved.state;
      this.preferences = saved.preferences;
      for (const id of saved.visitedRooms) this.visitedRooms.add(id);
      this.keepsakes.push(...saved.keepsakes);
      this.accessories.push(...saved.accessories);
      if (this.state.place === 'room') Object.assign(this.state, constrainRoomPosition(this.state.room, this.state.x, this.state.z, this.realm));
      this.hasSave = true;
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.domElement.setAttribute('aria-label', '白い霧の中に続く塔と螺旋階段。WとSで上り下り、入口でE。');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#e6e8e1');
    this.atmosphere = new Atmosphere(this.scene, this.sunlight);
    this.sunlight.shadow.mapSize.set(1024, 1024);
    this.sunlight.shadow.camera.left = -8;
    this.sunlight.shadow.camera.right = 8;
    this.sunlight.shadow.camera.top = 10;
    this.sunlight.shadow.camera.bottom = -8;
    this.sunlight.shadow.camera.near = 0.5;
    this.sunlight.shadow.camera.far = 45;
    this.sunlight.shadow.normalBias = 0.035;
    this.sunlight.shadow.bias = -0.00015;
    this.scene.add(this.sunlight, this.sunlight.target, this.character.group);
    this.world = new TowerWorld(this.scene, this.realm);
    this.world.setKeepsakes(this.keepsakes);
    this.world.setAccessories(this.accessories);
    this.character.setAccessories(this.accessories);
    this.cameraDirection = this.state.direction;
    this.roomBlend = this.state.place === 'stairs' ? 0 : 1;
    this.applyQuality();
    container.append(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    window.addEventListener('pagehide', this.pageHideHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    // Persist the first seed immediately, also completing migrations or a
    // pending return exactly once if the page was reloaded during a fall.
    this.save();
    this.raf = requestAnimationFrame(this.tick);
  }

  start(): void { this.running = true; this.input.clear(); }
  pause(): void { this.running = false; this.lookMode = 'walk'; this.reading = null; this.input.clear(); this.velocity = 0; this.save(); }

  get looking(): boolean { return this.lookMode !== 'walk' || this.lookBlend > 0.025; }

  get falling(): boolean { return this.fall !== null; }
  get whiteout(): number { return this.fall ? whiteoutAt(this.fall.elapsed) : 0; }
  get canJump(): boolean { return this.running && !this.fall && !this.transition && this.reading === null && this.state.place === 'stairs' && this.realm.home !== null && this.realm.cycle < MAX_CYCLE; }

  markHome(): void {
    if (!this.canHandleItems || this.state.place === 'stairs' || this.realm.home === this.state.room) return;
    this.realm.home = this.state.room;
    this.tell(`ROOM ${roomNumber(this.state.room)} を、自分の家にしました。`);
    this.save();
  }

  jump(): void {
    if (!this.canJump) return;
    this.fall = { elapsed: 0, steps: this.state.steps, returned: false };
    this.lookMode = 'walk';
    this.lookBlend = 0;
    this.velocity = 0;
    this.tea = false;
    this.notice = '';
    this.input.clear();
    this.save();
  }

  private advanceFall(dt: number): void {
    if (!this.fall || !this.running) return;
    this.fall.elapsed += dt;
    if (this.fall.elapsed >= RETURN_AT && !this.fall.returned) {
      const renewed = renewTower(this.savedWalk());
      this.state = renewed.state;
      Object.assign(this.realm, renewed.realm);
      this.keepsakes.splice(0, this.keepsakes.length, ...renewed.keepsakes);
      this.visitedRooms.clear();
      for (const room of renewed.visitedRooms) this.visitedRooms.add(room);
      this.fall.returned = true;
      this.world.rebuild();
      this.roomBlend = 1;
      this.firstFrame = true;
      this.input.clear();
      this.save();
    }
    if (this.fall.elapsed >= RETURN_END) {
      this.fall = null;
      this.tell('おかえりなさい。家の外には、知らない部屋が続いている。');
    }
  }

  setLook(mode: LookMode): void {
    if (!this.running || this.transition || this.fall || this.reading !== null) return;
    if (this.state.place !== 'stairs' && (mode === 'up' || mode === 'down')) return;
    this.lookMode = mode === this.lookMode ? 'walk' : mode;
    if (this.lookMode !== 'walk') this.lookPreset = this.lookMode;
    this.velocity = 0;
    this.input.clear();
  }

  toggleFast(): void {
    if (this.preferences.pace === 'fast') {
      this.setPreferences({ ...this.preferences, pace: this.previousPace });
    } else {
      this.previousPace = this.preferences.pace;
      this.setPreferences({ ...this.preferences, pace: 'fast' });
    }
  }

  setPreferences(preferences: Preferences): void {
    this.preferences = preferences;
    this.applyQuality();
    this.save();
  }

  private get canHandleItems(): boolean {
    return this.running && !this.transition && !this.fall && !this.looking && this.reading === null;
  }

  private tell(message: string): void {
    this.notice = message;
    this.noticeTime = 5;
    this.input.clear();
    this.velocity = 0;
  }

  takeKeepsake(source: number): void {
    if (!this.canHandleItems || this.state.place === 'stairs') return;
    let item = this.keepsakes.find((entry) => entry.source === source);
    if (item ? item.room !== this.state.room : source !== itemSource(this.state.room, this.realm)) return;
    if (!item) { item = { source, room: null, lit: false }; this.keepsakes.push(item); }
    item.room = null;
    item.lit = false;
    if (itemKind(source) === 'cup') this.tea = false;
    this.world.setKeepsakes(this.keepsakes);
    this.tell(`${ITEM_NAMES[itemKind(source)]}を持ち物にしまいました。`);
    this.save();
  }

  takeAccessory(source: number): void {
    if (!this.canHandleItems || this.state.place === 'stairs' || source !== itemSource(this.state.room, this.realm)) return;
    const found = accessoryFind(this.state.room, this.accessories, this.realm);
    if (!found) return;
    this.accessories.push(found);
    this.world.setAccessories(this.accessories);
    this.tell(`${ACCESSORY_NAMES[accessoryKind(source)]}を拾いました。持ち物から身につけられます。`);
    this.save();
  }

  toggleAccessory(source: number): void {
    if (!this.canHandleItems) return;
    const item = this.accessories.find((entry) => entry.source === source);
    if (!item) return;
    const worn = !item.worn;
    const kind = accessoryKind(source);
    for (const other of this.accessories) if (accessoryKind(other.source) === kind) other.worn = false;
    item.worn = worn;
    this.character.setAccessories(this.accessories);
    this.tell(worn ? kind === 'hat' ? '帽子をかぶりました。' : '小さな花を、髪に飾りました。' : `${ACCESSORY_NAMES[kind]}をはずしました。`);
    this.save();
  }

  placeKeepsake(source: number): void {
    if (!this.canHandleItems || this.state.place === 'stairs') return;
    const item = this.keepsakes.find((entry) => entry.source === source);
    if (!item || !canPlace(item, this.state.room, this.keepsakes)) return;
    item.room = this.state.room;
    if (itemKind(source) === 'cup') this.tea = false;
    this.world.setKeepsakes(this.keepsakes);
    this.tell(itemKind(source) === 'postcard' ? '絵葉書を壁に飾りました。' : `${ITEM_NAMES[itemKind(source)]}を机に置きました。`);
    this.save();
  }

  toggleLantern(source: number): void {
    if (!this.canHandleItems || this.state.place === 'stairs') return;
    const item = this.keepsakes.find((entry) => entry.source === source);
    if (!item || item.room !== this.state.room || itemKind(source) !== 'lantern') return;
    item.lit = !item.lit;
    this.world.setKeepsakes(this.keepsakes);
    this.tell(item.lit ? '小さな灯りが、部屋を暖める。' : '灯りを消しました。');
    this.save();
  }

  readPostcard(source: number): void {
    if (!this.canHandleItems || itemKind(source) !== 'postcard') return;
    const item = this.keepsakes.find((entry) => entry.source === source);
    const indoors = this.state.place !== 'stairs';
    if (item ? item.room !== null && (!indoors || item.room !== this.state.room) : !indoors || source !== itemSource(this.state.room, this.realm)) return;
    this.reading = source;
    this.input.clear();
    this.velocity = 0;
  }

  closePostcard(): void { this.reading = null; this.input.clear(); }

  drinkTea(): void {
    if (!this.canHandleItems || this.state.place === 'stairs') return;
    if (!this.keepsakes.some((item) => itemKind(item.source) === 'cup' && (item.room === null || item.room === this.state.room))) return;
    if (this.state.place !== 'rest') {
      const from = this.character.group.position.clone();
      this.state.place = 'rest';
      this.state.x = SEAT.x;
      this.state.z = SEAT.z;
      this.transition = { from, to: this.playerPosition(), time: 0, duration: 1.1 };
    }
    this.tea = true;
    this.tell('お茶を淹れました。湯気がゆっくりほどけていく。');
    this.save();
  }

  finishTea(): void { if (this.canHandleItems) { this.tea = false; this.tell('もう少し、ここで休もう。'); } }

  private applyQuality(): void {
    const light = this.preferences.quality === 'light';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, light ? 1 : 1.75));
    this.renderer.shadowMap.enabled = !light;
    this.sunlight.castShadow = !light;
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  get action(): string | null {
    if (this.transition || this.fall || this.looking || this.reading !== null) return null;
    if (this.state.place === 'stairs') return canEnter(this.state.steps) ? '部屋に入る' : null;
    if (this.state.place === 'rest') return '立ち上がる';
    if (Math.hypot(this.state.x - SEAT.x, this.state.z - SEAT.z) < 1.03) return '腰をおろす';
    if (Math.hypot(this.state.x - 1.75, this.state.z) < 1.04) return '階段に戻る';
    return null;
  }

  interact(): void {
    if (!this.running || this.transition) return;
    const action = this.action;
    if (!action) return;
    const from = this.character.group.position.clone();
    if (this.state.place === 'stairs') {
      this.state.room = nearestRoom(this.state.steps);
      this.visitedRooms.add(this.state.room);
      this.state.steps = this.state.room * STEPS_PER_ROOM;
      this.state.place = 'room';
      this.state.x = 0.95;
      this.state.z = 0;
      const found = roomFind(this.state.room, this.keepsakes, this.realm);
      const accessory = accessoryFind(this.state.room, this.accessories, this.realm);
      this.tell(accessory ? `${ACCESSORY_NAMES[accessoryKind(accessory.source)]}を見つけた。Q で部屋のものを見てみよう。` : found ? `${ITEM_NAMES[itemKind(found.source)]}が置いてある。Q で部屋のものを見てみよう。` : '以前ここに置いたものは、そのまま残っている。');
    } else if (this.state.place === 'rest') {
      this.state.place = 'room';
      this.state.x = SEAT.x + 0.65;
      this.state.z = SEAT.z;
    } else if (action === '腰をおろす') {
      this.state.place = 'rest';
      this.state.x = SEAT.x;
      this.state.z = SEAT.z;
    } else {
      this.state.place = 'stairs';
      this.state.steps = this.state.room * STEPS_PER_ROOM;
    }
    this.velocity = 0;
    this.tea = false;
    this.transition = { from, to: this.playerPosition(), time: 0, duration: 1.1 };
    this.input.clear();
    this.save();
  }

  private playerPosition(): THREE.Vector3 {
    if (this.fall && !this.fall.returned) {
      const p = fallPose(this.fall.steps, this.fall.elapsed, this.origin);
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    if (this.state.place === 'stairs') {
      const p = stairPose(this.state.steps, this.origin);
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    return new THREE.Vector3(this.state.x, this.state.room * ROOM_HEIGHT - this.origin, this.state.z);
  }

  private move(dt: number): number {
    if (!this.running || this.transition || this.fall || this.state.place === 'rest' || this.reading !== null) return 0;
    const forward = Number(this.input.has('up')) - Number(this.input.has('down'));
    const side = Number(this.input.has('right')) - Number(this.input.has('left'));
    if (this.looking) {
      if (forward || side) this.lookMode = 'walk';
      return 0;
    }
    const pace = this.state.place === 'stairs' ? WALK_SPEED[this.preferences.pace] : Math.min(WALK_SPEED[this.preferences.pace], 1.4);
    if (this.state.place === 'stairs') {
      this.velocity = THREE.MathUtils.damp(this.velocity, forward * pace, forward ? 6 : 11, dt);
      if (forward) this.state.direction = forward;
      this.state.steps += this.velocity * dt / STEP_LENGTH;
      return Math.abs(this.velocity);
    }
    const length = Math.hypot(forward, side);
    if (!length) return 0;
    const dx = (-0.85 * forward + 0.527 * side) / length * pace * dt;
    const dz = (-0.527 * forward - 0.85 * side) / length * pace * dt;
    const { x, z } = constrainRoomPosition(this.state.room, this.state.x + dx, this.state.z + dz, this.realm);
    this.state.x = x;
    this.state.z = z;
    this.face(Math.atan2(dx, dz), dt);
    return pace;
  }

  private face(angle: number, dt: number): void {
    const current = this.character.group.rotation.y;
    const difference = Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
    this.character.group.rotation.y += difference * (1 - Math.exp(-dt * 8));
  }

  private updateCamera(dt: number): void {
    if (this.fall && !this.fall.returned) {
      const p = fallPose(this.fall.steps, this.fall.elapsed, this.origin);
      const radial = new THREE.Vector3(Math.cos(p.angle), 0, Math.sin(p.angle));
      const tangent = new THREE.Vector3(-Math.sin(p.angle), 0, Math.cos(p.angle));
      const target = this.playerPosition().add(new THREE.Vector3(0, 0.8, 0));
      const desired = target.clone().addScaledVector(radial, 3.4).addScaledVector(tangent, -3.8);
      desired.y += 1.5;
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
      this.target.lerp(target, 1 - Math.exp(-dt * 8));
      this.camera.fov = 59;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.target);
      return;
    }
    const indoors = this.state.place !== 'stairs';
    this.roomBlend = THREE.MathUtils.damp(this.roomBlend, indoors ? 1 : 0, 3.5, dt);
    this.cameraDirection = THREE.MathUtils.damp(this.cameraDirection, this.state.direction, 2.2, dt);
    const p = stairPose(this.state.steps, this.origin);
    const radial = new THREE.Vector3(Math.cos(p.angle), 0, Math.sin(p.angle));
    const tangent = new THREE.Vector3(-Math.sin(p.angle), 0, Math.cos(p.angle));
    const outside = radial.clone().multiplyScalar(7.1).addScaledVector(tangent, -5.2 * this.cameraDirection);
    outside.y = p.y + 3.35;
    const outsideTarget = new THREE.Vector3(p.x, p.y + 1.04, p.z).addScaledVector(tangent, 0.65 * this.cameraDirection);
    const roomY = this.state.room * ROOM_HEIGHT - this.origin;
    const inside = new THREE.Vector3(1.82, roomY + 2.39, 1.08);
    const insideTarget = new THREE.Vector3(-0.35 + this.state.x * 0.12, roomY + 0.8, -0.3 + this.state.z * 0.12);
    const desired = outside.clone();
    // Pass through the doorway instead of cutting through its side wall.
    const threshold = new THREE.Vector3(3.5, roomY + 2.2, 0);
    const insideDoor = new THREE.Vector3(1.3, roomY + 2.2, 0);
    if (this.roomBlend < 0.45) {
      desired.lerp(threshold, this.roomBlend / 0.45);
    } else if (this.roomBlend < 0.8) {
      desired.copy(threshold).lerp(insideDoor, (this.roomBlend - 0.45) / 0.35);
    } else {
      desired.copy(insideDoor).lerp(inside, (this.roomBlend - 0.8) / 0.2);
    }
    const target = outsideTarget.lerp(insideTarget, this.roomBlend);
    this.lookBlend = THREE.MathUtils.damp(this.lookBlend, this.lookMode === 'walk' ? 0 : 1, 4, dt);
    if (this.lookBlend > 0.0001) {
      let lookPosition: THREE.Vector3;
      let lookTarget: THREE.Vector3;
      if (indoors) {
        const window = roomWindow(this.state.room, this.realm);
        // Look through the room's real window, or through the door in a windowless room.
        if (window) {
          const direction = new THREE.Vector3(Math.cos(window.angle), 0, Math.sin(window.angle));
          lookPosition = direction.clone().multiplyScalar(0.7);
          lookPosition.y = roomY + 1.64;
          lookTarget = direction.multiplyScalar(16);
          lookTarget.y = roomY + 1.58;
        } else {
          lookPosition = new THREE.Vector3(-1.4, roomY + 1.65, -0.35);
          lookTarget = new THREE.Vector3(7, roomY + 1.45, 0);
        }
      } else if (this.lookPreset === 'down') {
        lookPosition = radial.clone().multiplyScalar(4.8).addScaledVector(tangent, -0.7 * this.state.direction);
        lookPosition.y = p.y + 3;
        lookTarget = radial.clone().multiplyScalar(3.1);
        lookTarget.y = p.y - 12;
      } else if (this.lookPreset === 'up') {
        lookPosition = radial.clone().multiplyScalar(4.8).addScaledVector(tangent, -1.2 * this.state.direction);
        lookPosition.y = p.y + 0.9;
        lookTarget = radial.clone().multiplyScalar(3.1);
        lookTarget.y = p.y + 14;
      } else {
        lookPosition = radial.clone().multiplyScalar(2.75).addScaledVector(tangent, -2 * this.state.direction);
        lookPosition.y = p.y + 1.85;
        lookTarget = radial.clone().multiplyScalar(18).addScaledVector(tangent, 12 * this.state.direction);
        lookTarget.y = p.y + 1.55;
      }
      desired.lerp(lookPosition, this.lookBlend);
      target.lerp(lookTarget, this.lookBlend);
    }
    if (this.firstFrame) {
      this.camera.position.copy(desired);
      this.target.copy(target);
      this.firstFrame = false;
    } else {
      const ease = 1 - Math.exp(-dt * 4.7);
      this.camera.position.lerp(desired, ease);
      this.target.lerp(target, ease);
    }
    // Smoothing must not cut the corner of the thick doorway. Reserve space
    // for the camera's near plane as it crosses either face of the wall.
    const radius = Math.hypot(this.camera.position.x, this.camera.position.z);
    if (this.roomBlend > 0.001 && this.roomBlend < 0.999 && radius > INNER_RADIUS - 0.12 && radius < TOWER_RADIUS + 0.12) {
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -0.42, 0.42);
      this.camera.position.y = Math.min(this.camera.position.y, roomY + 2.35);
    }
    const followFov = THREE.MathUtils.lerp(this.camera.aspect < 0.85 ? 59 : 49, 71, this.roomBlend);
    this.camera.fov = THREE.MathUtils.lerp(followFov, indoors ? 65 : 67, this.lookBlend);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
  }

  private tick = (time: number): void => {
    if (this.disposed) return;
    const elapsed = Math.max(0, (time - (this.lastTime || time)) / 1000);
    const dt = Math.min(elapsed, 0.05);
    this.lastTime = time;
    this.advanceFall(Math.min(elapsed, 0.25));
    const speed = this.move(dt);
    const fall = this.fall && !this.fall.returned ? this.fall : null;
    const renderedSteps = fall ? fall.steps - fallPose(fall.steps, fall.elapsed, 0).drop / STEP_HEIGHT : this.state.steps;
    const anchor = nearestRoom(renderedSteps);
    const shift = this.world.sync(anchor);
    this.origin = anchor * ROOM_HEIGHT;
    if (shift) {
      this.camera.position.y -= shift;
      this.target.y -= shift;
      if (this.transition) { this.transition.from.y -= shift; this.transition.to.y -= shift; }
    }
    let position = this.playerPosition();
    if (this.transition) {
      if (this.running) this.transition.time += dt;
      const t = Math.min(this.transition.time / this.transition.duration, 1);
      position = this.transition.from.clone().lerp(this.transition.to, t * t * (3 - 2 * t));
      if (t === 1) this.transition = null;
    }
    this.character.group.position.copy(position);
    if (fall) {
      this.face(Math.atan2(position.x, position.z), dt);
    } else if (this.state.place === 'stairs') {
      const p = stairPose(this.state.steps, this.origin);
      this.face(-p.angle + (this.state.direction < 0 ? Math.PI : 0), dt);
    } else if (this.state.place === 'rest') {
      this.face(Math.PI / 2, dt);
    }
    this.character.animate(this.running ? dt : 0, speed, this.state.place === 'rest', this.tea, Boolean(fall));
    this.updateCamera(dt);
    this.atmosphere.update(renderedSteps, position, this.camera, this.running ? dt : 0);
    this.world.illuminate(anchor, this.origin, this.state.place !== 'stairs', this.running ? dt : 0);
    this.renderer.render(this.scene, this.camera);
    if (this.running) {
      this.noticeTime = Math.max(0, this.noticeTime - dt);
      if (!this.noticeTime) this.notice = '';
      this.saveElapsed += dt;
      if (this.saveElapsed > 2) { this.save(); this.saveElapsed = 0; }
    }
    this.onFrame({
      state: this.state,
      placeLabel: this.state.place === 'stairs' ? this.atmosphere.name : ROOM_NAMES[roomKind(this.state.room, this.realm)],
      action: this.action,
      transitioning: Boolean(this.transition || this.fall),
      saving: this.canSave,
      lookMode: this.lookMode,
      looking: this.looking,
      visitedCount: this.visitedRooms.size,
      keepsakes: this.keepsakes,
      accessories: this.accessories,
      reading: this.reading,
      tea: this.tea,
      notice: this.notice,
      falling: this.falling,
      whiteout: this.whiteout,
    });
    this.raf = requestAnimationFrame(this.tick);
  };

  private savedWalk(): SavedWalk {
    return { version: 5, state: this.state, preferences: this.preferences, visitedRooms: [...this.visitedRooms], keepsakes: this.keepsakes, accessories: this.accessories, realm: this.realm, returning: Boolean(this.fall && !this.fall.returned) };
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedWalk()));
      this.canSave = true;
    } catch { this.canSave = false; }
  }

  /** Development-only inspection used by the browser checks. */
  debugSnapshot() {
    return {
      state: { ...this.state }, origin: this.origin, chunks: [...this.world.chunks.keys()],
      meshes: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      drawCalls: this.renderer.info.render.calls, action: this.action,
      camera: this.camera.position.toArray(), player: this.character.group.position.toArray(),
      transitioning: Boolean(this.transition || this.fall), running: this.running,
      falling: this.falling, whiteout: this.whiteout, fallTime: this.fall?.elapsed ?? null, realm: structuredClone(this.realm),
      lookMode: this.lookMode, looking: this.looking, cameraTarget: this.target.toArray(),
      visitedRooms: [...this.visitedRooms], pace: this.preferences.pace,
      keepsakes: this.keepsakes.map((item) => ({ ...item })), tea: this.tea, reading: this.reading,
      accessories: this.accessories.map((item) => ({ ...item })),
      roomAccessories: this.world.chunks.get(this.state.room)?.accessories.children.map((item) => item.userData.source) ?? [],
      roomDesign: roomDesign(this.state.room, this.realm), window: roomWindow(this.state.room, this.realm),
      builtRoomDesign: this.world.chunks.get(this.state.room)?.design,
      campfire: this.world.campfireSnapshot(this.state.room),
      roomItems: this.world.chunks.get(this.state.room)?.keepsakes.children.map((item) => item.userData.source) ?? [],
      atmosphere: { name: this.atmosphere.name, fog: this.atmosphere.fog.color.getHexString(), far: this.atmosphere.fog.far },
      roomSpacing: STEPS_PER_ROOM,
    };
  }

  debugTeleport(steps: number): void {
    if (this.fall) return;
    this.state = { ...initialState(), steps, room: nearestRoom(steps) };
    this.transition = null;
    this.velocity = 0;
    this.roomBlend = 0;
    this.lookMode = 'walk';
    this.lookBlend = 0;
    this.tea = false;
    this.reading = null;
    this.firstFrame = true;
    this.input.clear();
  }

  dispose(): void {
    this.save();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener('pagehide', this.pageHideHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.world.dispose();
    this.atmosphere.dispose();
    this.character.dispose();
    this.sunlight.shadow.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
