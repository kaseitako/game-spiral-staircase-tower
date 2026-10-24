import * as THREE from 'three';
import { AccessoryModels } from './accessories.ts';
import { accessoryKind } from './model.ts';
import type { Accessory } from './model.ts';

export class Character {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly teaCup = new THREE.Group();
  private readonly steam = new THREE.Group();
  private readonly adornments = new THREE.Group();
  private readonly accessories = new AccessoryModels();
  private teaTime = 0;
  private phase = 0;
  private gait = 0;
  private readonly resources: { dispose(): void }[] = [];

  constructor() {
    this.group.add(this.body);
    const coat = this.material('#95644c');
    const trousers = this.material('#626758');
    const boots = this.material('#434b41');
    const skin = this.material('#c4ad8b');
    const hair = this.material('#544e43');
    const scarf = this.material('#d0bea0');
    this.add(this.body, new THREE.CylinderGeometry(0.18, 0.27, 0.64, 7), coat, [0, 0.91, 0]);
    // A narrow, angular face and uneven short hair, rather than a rounded cap.
    this.add(this.body, new THREE.BoxGeometry(0.245, 0.28, 0.235), skin, [0, 1.405, 0.02]);
    this.add(this.body, new THREE.BoxGeometry(0.27, 0.10, 0.255), hair, [-0.005, 1.55, 0]);
    this.add(this.body, new THREE.BoxGeometry(0.26, 0.18, 0.065), hair, [0, 1.47, -0.10]);
    const fringe = this.add(this.body, new THREE.BoxGeometry(0.16, 0.075, 0.055), hair, [-0.055, 1.515, 0.12]);
    fringe.rotation.z = -0.14;
    this.add(this.body, new THREE.BoxGeometry(0.04, 0.15, 0.18), hair, [-0.12, 1.46, -0.005]);
    const eyes = this.material('#5a5144');
    for (const x of [-0.055, 0.055]) this.add(this.body, new THREE.BoxGeometry(0.018, 0.019, 0.012), eyes, [x, 1.435, 0.142]);
    this.body.add(this.adornments);
    this.add(this.body, new THREE.CylinderGeometry(0.12, 0.14, 0.12, 7), scarf, [0, 1.245, 0]);
    this.add(this.body, new THREE.BoxGeometry(0.075, 0.23, 0.035), scarf, [0.08, 1.12, 0.18]);
    this.add(this.body, new THREE.BoxGeometry(0.28, 0.37, 0.14), this.material('#72715a'), [0, 0.99, -0.22]);
    this.leftLeg.position.set(-0.105, 0.57, 0);
    this.rightLeg.position.set(0.105, 0.57, 0);
    this.leftArm.position.set(-0.22, 1.16, 0);
    this.rightArm.position.set(0.22, 1.16, 0);
    this.body.add(this.leftLeg, this.rightLeg, this.leftArm, this.rightArm);
    for (const leg of [this.leftLeg, this.rightLeg]) {
      this.add(leg, new THREE.BoxGeometry(0.12, 0.40, 0.14), trousers, [0, -0.21, 0]);
      this.add(leg, new THREE.BoxGeometry(0.13, 0.12, 0.25), boots, [0, -0.49, 0.047]);
    }
    for (const arm of [this.leftArm, this.rightArm]) {
      this.add(arm, new THREE.BoxGeometry(0.105, 0.37, 0.13), coat, [0, -0.16, 0]);
      this.add(arm, new THREE.BoxGeometry(0.09, 0.105, 0.10), skin, [0, -0.39, 0]);
    }
    const ceramic = this.material('#d9d1b4');
    this.add(this.teaCup, new THREE.CylinderGeometry(0.085, 0.075, 0.15, 8), ceramic, [0, 0.075, 0]);
    this.add(this.teaCup, new THREE.CylinderGeometry(0.073, 0.073, 0.008, 8), this.material('#806449'), [0, 0.153, 0]);
    this.add(this.teaCup, new THREE.TorusGeometry(0.05, 0.012, 4, 8), ceramic, [0.09, 0.08, 0]);
    const vapor = new THREE.MeshBasicMaterial({ color: '#f4efe1', transparent: true, opacity: 0.22, depthWrite: false });
    this.resources.push(vapor);
    for (let i = 0; i < 4; i++) {
      const puff = this.add(this.steam, new THREE.SphereGeometry(0.023, 5, 4), vapor, [0, 0.2 + i * 0.06, 0]);
      puff.castShadow = false;
    }
    this.teaCup.add(this.steam);
    this.teaCup.visible = false;
    this.body.add(this.teaCup);
  }

  setAccessories(items: Accessory[]): void {
    this.adornments.clear();
    const hat = items.some((item) => item.worn && accessoryKind(item.source) === 'hat');
    for (const item of items) {
      if (!item.worn) continue;
      const model = this.accessories.make(item.source);
      if (accessoryKind(item.source) === 'hat') {
        model.position.set(0, 1.55, 0);
        model.rotation.z = -0.05;
      } else {
        model.scale.setScalar(0.7);
        model.position.set(hat ? -0.20 : -0.13, hat ? 1.53 : 1.40, 0.04);
        model.rotation.set(0, -Math.PI / 3, 0.35);
      }
      this.adornments.add(model);
    }
  }

  private material(color: string): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
    this.resources.push(material);
    return material;
  }

  private add(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: number[]): THREE.Mesh {
    this.resources.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  animate(dt: number, speed: number, seated: boolean, drinking = false, falling = false): void {
    this.gait = THREE.MathUtils.damp(this.gait, speed, 10, dt);
    this.phase += speed * dt * 9;
    const swing = Math.sin(this.phase) * 0.45 * Math.min(this.gait * 1.5, 1);
    this.leftLeg.rotation.x = seated ? -Math.PI / 2.7 : swing;
    this.rightLeg.rotation.x = seated ? -Math.PI / 2.7 : -swing;
    this.leftArm.rotation.x = seated ? -0.4 : -swing * 0.7;
    this.rightArm.rotation.x = seated ? -0.4 : swing * 0.7;
    this.body.position.y = seated ? -0.03 : Math.abs(Math.sin(this.phase)) * 0.018 * this.gait;
    this.body.rotation.x = seated ? 0.04 : 0;
    this.leftArm.rotation.z = falling ? -0.9 : 0;
    this.rightArm.rotation.z = falling ? 0.9 : 0;
    if (falling) {
      this.leftLeg.rotation.x = 0.18;
      this.rightLeg.rotation.x = -0.12;
      this.body.rotation.x = -0.10;
    }
    this.teaCup.visible = seated && drinking;
    if (this.teaCup.visible) {
      this.teaTime += dt;
      const lift = (Math.sin(this.teaTime * 0.65) + 1) * 0.5;
      this.teaCup.position.set(0.14, 1.13 + lift * 0.12, 0.30);
      this.rightArm.rotation.x = -1.45 - lift * 0.3;
      this.leftArm.rotation.x = -1.2;
      this.steam.children.forEach((puff, i) => {
        const rise = (this.teaTime * 0.22 + i / 4) % 1;
        puff.position.set(Math.sin(this.teaTime + i) * 0.025, 0.18 + rise * 0.30, 0);
        puff.scale.setScalar((1 - rise) * 1.6 + 0.2);
      });
    }
  }

  dispose(): void {
    this.accessories.dispose();
    for (const resource of this.resources) resource.dispose();
  }
}
