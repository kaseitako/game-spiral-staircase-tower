import * as THREE from 'three';
import { accessoryColor, accessoryKind } from './model.ts';

/** Small shared meshes, reused for room finds and the traveller's accessories. */
export class AccessoryModels {
  private readonly geometries = [
    new THREE.CylinderGeometry(0.27, 0.28, 0.035, 8),
    new THREE.CylinderGeometry(0.15, 0.185, 0.17, 7),
    new THREE.CylinderGeometry(0.185, 0.19, 0.035, 7),
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.OctahedronGeometry(0.065),
    new THREE.IcosahedronGeometry(0.042, 0),
  ];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  make(source: number): THREE.Group {
    const group = new THREE.Group();
    const kind = accessoryKind(source);
    group.userData = { source, kind };
    const add = (geometry: number, color: string, position: number[], scale = [1, 1, 1]) => {
      let material = this.materials.get(color);
      if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }); this.materials.set(color, material); }
      const mesh = new THREE.Mesh(this.geometries[geometry], material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    if (kind === 'hat') {
      add(0, accessoryColor(source), [0, 0.02, 0], [1, 1, 0.86]);
      add(1, accessoryColor(source), [0, 0.11, 0], [1, 1, 0.88]);
      add(2, '#665d50', [0, 0.06, 0], [1, 1, 0.88]);
    } else {
      add(3, '#758567', [0, 0.12, 0], [0.014, 0.25, 0.014]);
      const leaf = add(4, '#889373', [-0.038, 0.12, 0], [0.8, 0.35, 0.28]);
      leaf.rotation.z = -0.5;
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        const petal = add(4, accessoryColor(source), [Math.sin(angle) * 0.065, 0.27 + Math.cos(angle) * 0.065, 0], [0.65, 1, 0.38]);
        petal.rotation.z = -angle;
      }
      add(5, '#bba366', [0, 0.27, 0.015], [0.68, 0.68, 0.5]);
    }
    return group;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
  }
}
