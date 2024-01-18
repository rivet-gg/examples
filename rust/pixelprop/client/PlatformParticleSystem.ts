import * as BABYLON from "babylonjs";
import {float} from "./types";
import int = BABYLON.int;

export interface EmissionPlatform {
    emits?: boolean,
    origin: BABYLON.Vector3,
    spawnRange?: BABYLON.Vector3,
    direction?: BABYLON.Vector3,
    platformSize?: BABYLON.Vector2 // Radius of platform
}

export interface PlatformParticleSystemConfig {
    alpha: number,
    particlesPerEmitter: number,
    colorMin: BABYLON.Color3,
    colorMax: BABYLON.Color3,
    velocityMin: number,
    velocityMax: number,
    scaleMin: number,
    scaleMax: number,
    gravity: number
}

export class PlatformParticleSystem extends BABYLON.TransformNode {
    public particleSystem: BABYLON.SolidParticleSystem;
    private get particleCount(): number { return this.emissionConfig.particlesPerEmitter * this.emitters.length; }
    private lastUpdate: int = Date.now();
    private dt: float = 0; // Delta time of the last update
    private baseScales: number[] = [];

    public constructor(
        name: string,
        public emitters: EmissionPlatform[],
        public emissionConfig: PlatformParticleSystemConfig,
        scene: BABYLON.Scene
    ) {
        super(name, scene);

        // Set default values on emitters
        for (let emitter of this.emitters) {
            emitter.emits = emitter.emits == undefined ? true : emitter.emits;
            emitter.spawnRange = emitter.spawnRange || BABYLON.Vector3.Zero();
            emitter.direction = emitter.direction || BABYLON.Vector3.Zero();
            emitter.platformSize = emitter.platformSize || new BABYLON.Vector2(0, 0);
        }

        // Generate base scales for all particles
        for (let i = 0; i < this.particleCount; i++) {
            this.baseScales[i] = Math.random();
        }

        // Create the sps
        this.particleSystem = new BABYLON.SolidParticleSystem("Particle System", scene);

        // Build the mesh
        let box = BABYLON.MeshBuilder.CreateBox("Particle Box", {
            size: 1
        }, scene);
        this.particleSystem.addShape(box, this.particleCount);
        const mesh = this.particleSystem.buildMesh();
        box.dispose();
        mesh.parent = this;

        // Assign material
        const material = new BABYLON.StandardMaterial("Particle Material", scene);
        material.specularColor.set(0,0,0);
        material.alpha = this.emissionConfig.alpha;
        mesh.material = material;

        // Tune the system
        // this.particleSystem.billboard = true;
        // this.particleSystem.computeParticleRotation = false;
        // this.particleSystem.computeParticleColor = false;
        this.particleSystem.computeParticleTexture = false;

        // Assign functions to particle system
        this.particleSystem.updateParticle = (particle) => {
            // Respawn if fell below ground
            if (particle.position.z < 0) {
                this.recycleParticle(particle);
            }

            // Apply the gravity
            particle.velocity.z += this.emissionConfig.gravity * this.dt;
            const newVelocity = BABYLON.Tmp.Vector3[0].copyFrom(particle.velocity).scaleInPlace(this.dt); // Calculate temp velocity
            (particle.position).addInPlace(newVelocity);

            // Collide with the platforms
            for (let emitter of this.emitters) {
                if (
                    particle.position.x < emitter.origin.x + emitter.platformSize.x / 2 &&
                    particle.position.x > emitter.origin.x - emitter.platformSize.x / 2 &&
                    particle.position.y < emitter.origin.y + emitter.platformSize.y / 2 &&
                    particle.position.y > emitter.origin.y - emitter.platformSize.y / 2 &&
                    particle.position.z < emitter.origin.z && particle.position.z > emitter.origin.z - 10
                ) {
                    particle.position.z = emitter.origin.z; // Snap to the top of the platform
                    particle.velocity.z = 0; // Stop falling
                }
            }

            // Scale based on velocity
            const velocityWeight = 1 / 7;
            const scale = Math.lerp(this.emissionConfig.scaleMin, this.emissionConfig.scaleMax, this.baseScales[particle.idx]);
            particle.scale.x = Math.lerp(particle.scale.x, scale + Math.abs(particle.velocity.x) * velocityWeight, 5 * this.dt);
            particle.scale.y = Math.lerp(particle.scale.y, scale + Math.abs(particle.velocity.y) * velocityWeight, 5 * this.dt);
            particle.scale.z = Math.lerp(particle.scale.z, scale + Math.abs(particle.velocity.z) * velocityWeight, 5 * this.dt);

            return particle;
        };

        // Initialize all of the particles
        this.initParticles();
        this.particleSystem.setParticles();

        // Hook into update loop
        let updateIndex = 0;
        scene.registerBeforeRender(() => {
            // Calculate dt
            const now = Date.now();
            this.dt = (now - this.lastUpdate) / 1000;

            // Update particle system
            this.particleSystem.setParticles();

            // Recalculate the bounding box every few updates
            if (updateIndex % 100 == 0) {
                mesh.refreshBoundingInfo();
            }

            // Save last update
            this.lastUpdate = now;

            // Increment the update
            updateIndex++;
        });
    }

    initParticles() {
        // Recycle everything and add a delay to particles
        for (let p = 0; p < this.particleSystem.nbParticles; p++) {
            this.recycleParticle(this.particleSystem.particles[p]);
        }
    }

    recycleParticle(particle: BABYLON.SolidParticle) {
        // Choose an emitter that emits
        if (this.emitters.length == 0) {
            console.error("Not enough emitters.");
            return;
        }
        let emitter: EmissionPlatform;
        while (emitter == undefined || !emitter.emits) {
            emitter = this.emitters[Math.floor(Math.random() * this.emitters.length)];
        }

        // Position
        const spawnScale = (Math.random() - 0.5) * 2;
        particle.position.x = emitter.origin.x + emitter.spawnRange.x * spawnScale;
        particle.position.y = emitter.origin.y + emitter.spawnRange.y * spawnScale;
        particle.position.z = emitter.origin.z + emitter.spawnRange.z * spawnScale;

        // Velocity
        const velocityScale = Math.lerp(this.emissionConfig.velocityMin, this.emissionConfig.velocityMax, Math.random());
        particle.velocity.x = emitter.direction.x * velocityScale;
        particle.velocity.y = emitter.direction.y * velocityScale;
        particle.velocity.z = emitter.direction.z * velocityScale;

        // Remove scale
        particle.scale.set(0, 0, 0);

        // Color
        const t = Math.random();
        particle.color.r = Math.lerp(this.emissionConfig.colorMin.r, this.emissionConfig.colorMax.r, t);
        particle.color.g = Math.lerp(this.emissionConfig.colorMin.g, this.emissionConfig.colorMax.g, t);
        particle.color.b = Math.lerp(this.emissionConfig.colorMin.b, this.emissionConfig.colorMax.b, t);
        particle.color.a = 1;
    }
}
