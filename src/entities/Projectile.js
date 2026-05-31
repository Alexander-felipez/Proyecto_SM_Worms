import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';
import { calcLaunchVelocity } from '../config/LaunchConfig';

/**
 * Projectile Entity
 * Maneja el disparo, vuelo, colisión y explosión con daño real.
 */
export class Projectile {
    constructor(scene, startX, startY, targetX, targetY, owner = null, weaponType = 'BAZOOKA', precalcLaunch = null) {
        this.scene = scene;
        this.owner = owner; // Player que disparó
        this.hasExploded = false;
        this.weaponKey = weaponType;

        // Datos del arma actual
        const weaponCfg = GAME_CONFIG.WEAPONS[weaponType] || GAME_CONFIG.WEAPONS.BAZOOKA;
        this.damage = weaponCfg.damage;
        this.explosionRadius = weaponCfg.radius;

        let angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
        
        // Determinar textura y físicas según tipo de arma
        let textureKey = 'projTexture';
        let physicsConfig = {
            restitution: 0.2, 
            friction: 0.01, 
            density: 0.1, 
            label: 'projectile'
        };

        if (weaponType === 'GRENADE') {
            textureKey = 'grenadeTexture';
            physicsConfig.restitution = 0.6; // Rebota bastante
            physicsConfig.friction = 0.1;
        } else if (weaponType === 'DYNAMITE') {
            textureKey = 'dynamiteTexture';
            physicsConfig.restitution = 0.05; // Cae y apenas rebota
            physicsConfig.friction = 0.95;    // Queda quieta en colinas
            physicsConfig.density = 0.4;      // Pesada
        } else {
            // Bazooka
            // Creamos la textura del misil on-the-fly si no existe
            if (!scene.textures.exists('projTexture')) {
                const projGfx = scene.make.graphics({x: 0, y: 0, add: false});
                projGfx.fillStyle(weaponCfg.color, 1);
                projGfx.fillCircle(8, 8, weaponCfg.projectileSize);
                projGfx.generateTexture('projTexture', 16, 16);
                projGfx.destroy();
            }
        }

        // Posición de spawn (la dinamita se suelta justo a los pies del jugador)
        let spawnX = startX + Math.cos(angle) * 45;
        let spawnY = startY + Math.sin(angle) * 45;
        if (weaponType === 'DYNAMITE') {
            spawnX = startX + (owner && owner.sprite.flipX ? -25 : 25);
            spawnY = startY - 15;
            angle = owner && owner.sprite.flipX ? Math.PI : 0; // Caer ligeramente empujada
        }

        // Crear Sprite Físico
        this.sprite = scene.matter.add.sprite(spawnX, spawnY, textureKey);
        this.sprite.setBody({ type: 'circle', radius: 8 }, physicsConfig);
        
        // Estelas de proyectil específicas
        this.trail = null;
        this.fuseSpark = null;

        if (weaponType === 'BAZOOKA') {
            this.trail = scene.add.particles(0, 0, 'fire-particle', {
                follow: this.sprite,
                speed: 5,
                scale: { start: 0.4, end: 0 },
                alpha: { start: 0.6, end: 0 },
                blendMode: 'ADD',
                lifespan: 200,
                frequency: 30,
            });
        } else if (weaponType === 'GRENADE') {
            // Humo verde/blanco de granada táctica
            this.trail = scene.add.particles(0, 0, 'smoke-particle', {
                follow: this.sprite,
                speed: { min: 5, max: 15 },
                scale: { start: 0.2, end: 0.6 },
                alpha: { start: 0.4, end: 0 },
                tint: 0xaaffaa,
                lifespan: 400,
                frequency: 40,
            });
        } else if (weaponType === 'DYNAMITE') {
            // Chispas de la mecha encendida en la punta superior
            this.fuseSpark = scene.add.particles(0, 0, 'fire-particle', {
                speed: { min: 20, max: 50 },
                scale: { start: 0.3, end: 0 },
                lifespan: 150,
                frequency: 15,
                gravityY: -100,
                blendMode: 'ADD'
            });
        }

        // ── VELOCIDAD INICIAL ────────────────────────────────────────────────────
        // Si viene un launch precalculado (disparo por Espacio), lo usa directamente.
        // Si no, calcula desde la posición del ratón (disparo por clic).
        const launch = precalcLaunch || calcLaunchVelocity(startX, startY, targetX, targetY, weaponType);

        if (weaponType === 'DYNAMITE') {
            this.sprite.setVelocity(0, 0);
        } else {
            this.sprite.setVelocity(launch.vx, launch.vy);
        }
        
        // Colisión o cuenta regresiva
        this.collisionCallback = null;
        if (weaponType === 'BAZOOKA') {
            this.collisionCallback = (event) => {
                event.pairs.forEach((pair) => {
                    const { bodyA, bodyB } = pair;
                    if ((bodyA === this.sprite.body || bodyB === this.sprite.body) && 
                        (bodyA.label === 'terrain' || bodyB.label === 'terrain' || bodyA.label.startsWith('player') || bodyB.label.startsWith('player'))) {
                        this.explode();
                    }
                });
            };
            scene.matter.world.on('collisionstart', this.collisionCallback);
        } else {
            // Granada y Dinamita usan temporizador
            scene.time.delayedCall(weaponCfg.fuse, () => {
                if (!this.hasExploded) {
                    this.explode();
                }
            });
        }

        // Viento y actualización en cada frame
        this.affectedByWind = (weaponType !== 'DYNAMITE');
        
        this.updateListener = () => {
            if (this.sprite && this.sprite.active && !this.hasExploded) {
                // 1. Viento
                if (this.affectedByWind && GAME_CONFIG.WIND.ENABLED) {
                    const wind = (this.scene.turnManager && this.scene.turnManager.windSpeed) || 0;
                    this.sprite.applyForce({ x: wind, y: 0 });
                }

                // 2. Dinamita: Actualizar posición de la mecha encendida (chispas)
                if (this.fuseSpark) {
                    const angleRad = this.sprite.rotation;
                    // La mecha está en el extremo superior de la dinamita (-y en coordenadas locales)
                    const ox = Math.sin(angleRad) * 7;
                    const oy = -Math.cos(angleRad) * 7;
                    this.fuseSpark.setPosition(this.sprite.x + ox, this.sprite.y + oy);
                }

                // 3. Colisión con Agua (salpicadura y auto-destrucción silenciosa)
                if (this.scene.hasWater && this.scene.terrainManager && this.sprite.y >= this.scene.terrainManager.waterLevel) {
                    const velY = this.sprite.body ? Math.abs(this.sprite.body.velocity.y) : 5;
                    const splashForce = Phaser.Math.Clamp(velY / 8, 0.8, 2.5);
                    this.scene.events.emit('waterSplash', { x: this.sprite.x, y: this.scene.terrainManager.waterLevel, force: splashForce });
                    this.cleanup(); // desaparecer bajo el agua sin detonar la explosión en seco
                }
            }
        };
        scene.events.on('update', this.updateListener);

        // Auto-destruir de seguridad
        scene.time.delayedCall(7000, () => {
            if (!this.hasExploded) {
                this.cleanup();
            }
        });
    }
    
    cleanup() {
        if (this.hasExploded) return;
        this.hasExploded = true;
        
        this.scene.events.off('update', this.updateListener);
        if (this.collisionCallback) {
            this.scene.matter.world.off('collisionstart', this.collisionCallback);
        }
        
        if (this.trail) this.trail.destroy();
        if (this.fuseSpark) this.fuseSpark.destroy();
        if (this.sprite && this.sprite.active) this.sprite.destroy();
    }

    explode() {
        if (this.hasExploded) return;
        this.hasExploded = true;

        let x = this.sprite.x;
        let y = this.sprite.y;

        this.scene.events.off('update', this.updateListener);
        if (this.collisionCallback) {
            this.scene.matter.world.off('collisionstart', this.collisionCallback);
        }
        
        if (this.trail) this.trail.destroy();
        if (this.fuseSpark) this.fuseSpark.destroy();
        this.sprite.destroy();

        const expCfg = GAME_CONFIG.EXPLOSION;

        // 1. Game Feel (Sacudida de pantalla más fuerte según el radio de explosión)
        const shakeMultiplier = this.explosionRadius / 60;
        this.scene.cameras.main.shake(expCfg.CAMERA_SHAKE_DURATION, expCfg.CAMERA_SHAKE_INTENSITY * shakeMultiplier);
        
        // 2. Partículas Visuales Premium (Fuego, Humo Denso y Escombros)
        const fireEmitter = this.scene.add.particles(x, y, 'fire-particle', {
            speed: { min: 100, max: 250 * shakeMultiplier }, 
            angle: { min: 0, max: 360 }, 
            scale: { start: 1.2 * shakeMultiplier, end: 0 },
            blendMode: 'ADD', 
            lifespan: 400, 
            gravityY: 0
        });
        fireEmitter.explode(22);
        this.scene.time.delayedCall(600, () => fireEmitter.destroy()); // Liberar memoria

        const smokeEmitter = this.scene.add.particles(x, y, 'smoke-particle', {
            speed: { min: 30, max: 95 * shakeMultiplier }, 
            angle: { min: 180, max: 360 }, 
            scale: { start: 0.8, end: 3.5 * shakeMultiplier },
            alpha: { start: 0.65, end: 0 }, 
            tint: 0x3d2b1f, 
            lifespan: 1500, 
            gravityY: -80
        });
        smokeEmitter.explode(18);
        this.scene.time.delayedCall(2000, () => smokeEmitter.destroy()); // Liberar memoria

        // Lluvia Premium de Escombros Físicos (Debris) con Gravedad y Colores de Tierra Arcillosa
        const debrisColor = this.scene.mapConfig ? this.scene.mapConfig.terrainColor : 0x7a4a1e;
        const debrisEmitter = this.scene.add.particles(x, y, 'fire-particle', {
            speed: { min: 100, max: 300 * shakeMultiplier },
            angle: { min: 200, max: 340 }, // Hacia arriba y a los lados
            scale: { start: 0.5 * shakeMultiplier, end: 0.1 },
            alpha: { start: 0.9, end: 0.1 },
            tint: debrisColor,
            lifespan: { min: 700, max: 1200 },
            gravityY: 550, // Gravedad intensa para simular caída real
        });
        debrisEmitter.explode(25);
        this.scene.time.delayedCall(1500, () => debrisEmitter.destroy()); // Liberar memoria
        
        let flash = this.scene.add.circle(x, y, this.explosionRadius, 0xffeebb, 0.95);
        this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2.2, duration: expCfg.FLASH_DURATION, onComplete: () => flash.destroy() });
        
        // 3. Destrucción Lógica del Entorno
        if (this.scene.terrainManager) {
            this.scene.terrainManager.destroyTerrain(x, y, this.explosionRadius);
        }

        // 4. DAÑO A JUGADORES
        if (this.scene.playersLookup) {
            for (let id in this.scene.playersLookup) {
                let playerEntity = this.scene.playersLookup[id];
                if (!playerEntity.alive) continue;

                let dist = Phaser.Math.Distance.Between(x, y, playerEntity.sprite.x, playerEntity.sprite.y);
                
                if (dist < this.explosionRadius) {
                    let damageMultiplier = 1 - (dist / this.explosionRadius);
                    let finalDamage = this.damage * damageMultiplier;
                    
                    finalDamage = Math.max(5, Math.round(finalDamage));
                    playerEntity.takeDamage(finalDamage, this.owner);
                }
            }
        }
        
        // 5. Onda Expansiva Física
        let bodies = this.scene.matter.world.getAllBodies();
        bodies.forEach(body => {
            if(!body.isStatic && body.label !== 'projectile') {
                let dist = Phaser.Math.Distance.Between(x, y, body.position.x, body.position.y);
                if (dist < expCfg.SHOCKWAVE_RADIUS) {
                    let angle = Phaser.Math.Angle.Between(x, y, body.position.x, body.position.y);
                    let force = (expCfg.SHOCKWAVE_RADIUS - dist) * expCfg.SHOCKWAVE_FORCE * shakeMultiplier;
                    this.scene.matter.body.applyForce(body, body.position, {
                        x: Math.cos(angle) * force, y: Math.sin(angle) * force
                    });
                }
            }
        });

        // 6. Notificar explosión
        this.scene.events.emit('explosionOccurred', { x, y, radius: this.explosionRadius });
    }
}
