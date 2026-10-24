import * as THREE from 'three';
import { STEPS_PER_ROOM } from './model.ts';

const layers = [
  { name: '白い靄の中', fog: '#e6e8e1', sky: '#d6dedb', light: '#fff5dc', ambient: '#fffdf3', ground: '#6f7769', near: 11, far: 31, sun: 2.6, fill: 2.8, clouds: 0.10, sunY: 17 },
  { name: '淡い金色の光', fog: '#dfc6a8', sky: '#c7b3a0', light: '#ffd09a', ambient: '#f4ddc1', ground: '#796958', near: 12, far: 34, sun: 2.8, fill: 2.4, clouds: 0.17, sunY: 6 },
  { name: '青い薄暮', fog: '#8295ae', sky: '#566c90', light: '#afc9ef', ambient: '#c1d3eb', ground: '#414c63', near: 10, far: 30, sun: 0.8, fill: 1.8, clouds: 0.08, sunY: 10 },
  { name: '雲の通り道', fog: '#c4d1d4', sky: '#9db8c6', light: '#eef4e8', ambient: '#dfebef', ground: '#667d78', near: 15, far: 35, sun: 1.9, fill: 2.6, clouds: 0.65, sunY: 14 },
] as const;

/** Four rooms between each full palette; descending retraces the same colours. */
export function atmosphereAt(steps: number) {
  const height = steps / (STEPS_PER_ROOM * 4);
  const band = Math.floor(height);
  const a = ((band % layers.length) + layers.length) % layers.length;
  const b = (a + 1) % layers.length;
  const fraction = height - band;
  const mix = fraction * fraction * (3 - 2 * fraction);
  return { a, b, mix, name: layers[mix < 0.5 ? a : b].name };
}

export class Atmosphere {
  readonly fog = new THREE.Fog(layers[0].fog, 11, 31);
  readonly fill = new THREE.HemisphereLight(layers[0].ambient, layers[0].ground, 2.8);
  private readonly skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color(layers[0].fog) }, zenith: { value: new THREE.Color(layers[0].sky) } },
    vertexShader: 'varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; varying vec3 direction;
      void main() {
        float height = normalize(direction).y;
        gl_FragColor = vec4(mix(horizon, zenith, smoothstep(-0.08, 0.85, height)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private readonly skyGeometry = new THREE.SphereGeometry(60, 16, 12);
  private readonly sky = new THREE.Mesh(this.skyGeometry, this.skyMaterial);
  private readonly cloudGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly cloudMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color('#f0f2e8') }, amount: { value: 0.1 } },
    vertexShader: 'varying vec2 uvCloud; void main() { uvCloud = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 tint; uniform float amount; varying vec2 uvCloud;
      void main() {
        vec2 p = (uvCloud - 0.5) * vec2(2.4, 3.8);
        float cloud = exp(-dot(p, p) * 2.8);
        cloud += 0.6 * exp(-dot(p - vec2(0.45, 0.08), p - vec2(0.45, 0.08)) * 5.0);
        float edge = smoothstep(0.0, 0.16, uvCloud.x) * smoothstep(0.0, 0.16, 1.0 - uvCloud.x);
        gl_FragColor = vec4(tint, min(cloud * edge, 1.0) * amount * 0.55);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private readonly clouds = new THREE.Group();
  private readonly scratch = new THREE.Color();
  private elapsed = 0;
  private readonly sunlight: THREE.DirectionalLight;
  name: string = layers[0].name;

  constructor(scene: THREE.Scene, sunlight: THREE.DirectionalLight) {
    this.sunlight = sunlight;
    this.sky.renderOrder = -10;
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Mesh(this.cloudGeometry, this.cloudMaterial);
      cloud.scale.set(18 + (i % 3) * 4, 5 + (i % 2) * 3, 1);
      this.clouds.add(cloud);
    }
    scene.fog = this.fog;
    scene.add(this.sky, this.clouds, this.fill);
  }

  update(steps: number, position: THREE.Vector3, camera: THREE.Camera, dt: number): void {
    const { a, b, mix, name } = atmosphereAt(steps);
    const from = layers[a];
    const to = layers[b];
    this.name = name;
    this.elapsed += dt;
    const color = (target: THREE.Color, key: 'fog' | 'sky' | 'light' | 'ambient' | 'ground') =>
      target.set(from[key]).lerp(this.scratch.set(to[key]), mix);
    color(this.fog.color, 'fog');
    this.skyMaterial.uniforms.horizon.value.copy(this.fog.color);
    color(this.skyMaterial.uniforms.zenith.value, 'sky');
    color(this.fill.color, 'ambient');
    color(this.fill.groundColor, 'ground');
    color(this.sunlight.color, 'light');
    this.fog.near = THREE.MathUtils.lerp(from.near, to.near, mix);
    this.fog.far = THREE.MathUtils.lerp(from.far, to.far, mix);
    this.fill.intensity = THREE.MathUtils.lerp(from.fill, to.fill, mix);
    this.sunlight.intensity = THREE.MathUtils.lerp(from.sun, to.sun, mix);
    this.sunlight.position.copy(position).add(new THREE.Vector3(11, THREE.MathUtils.lerp(from.sunY, to.sunY, mix), 8));
    this.sunlight.target.position.copy(position);
    this.sky.position.copy(camera.position);
    this.cloudMaterial.uniforms.tint.value.copy(this.fog.color).lerp(this.scratch.set('#ffffff'), 0.35);
    this.cloudMaterial.uniforms.amount.value = THREE.MathUtils.lerp(from.clouds, to.clouds, mix);
    this.clouds.children.forEach((cloud, i) => {
      const angle = i * 2.39996 + this.elapsed * 0.006;
      const radius = 22 + (i % 3) * 5;
      cloud.position.set(Math.cos(angle) * radius, position.y + Math.sin(i * 4.3) * 15, Math.sin(angle) * radius);
      cloud.quaternion.copy(camera.quaternion);
    });
  }

  dispose(): void {
    this.sky.removeFromParent();
    this.clouds.removeFromParent();
    this.fill.removeFromParent();
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
    this.cloudGeometry.dispose();
    this.cloudMaterial.dispose();
  }
}
