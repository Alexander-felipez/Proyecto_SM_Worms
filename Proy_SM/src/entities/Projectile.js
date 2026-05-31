import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

/**
 * Projectile Entity
 * Maneja el disparo, vuelo, colisión y explosión con daño real.
 */
export class Projectile {
    constructor(scene, startX, startY, targetX, targetY, owner = null) {
        this.scene = scene;
        this.owner = owner; // Player que disparó (para stats)
        this.hasExploded = false;

        // Datos del arma actual (por ahora siempre Bazooka)
        const weaponCfg = GAME_CONFIG.WEAPONS.BAZOOKA;
        this.damage = weaponCfg.damage;
        this.explosionRadius = weaponCfg.radius;

        let angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
        
        // Creamos la textura del misil on-the-fly si no existe
        if (!scene.textures.exists('projTexture')) {
            const projGfx = scene.make.graphics({x: 0, y: 0, add: false});
            projGfx.fillStyle(weaponCfg.color, 1);
            projGfx.fillCircle(8, 8, weaponCfg.projectileSize);
            projGfx.generateTexture('projTexture', 16, 16);
            projGfx.destroy();
        }

        // Crear Sprite Físico
        this.sprite = scene.matter.add.sprite(startX + Math.cos(angle)*40, startY + Math.sin(angle)*40, 'projTexture');
        this.sprite.setBody({ type: 'circle', radius: 8 }, {
            restitution: 0.2, 
            friction: 0.01, 
            density: 0.1, 
            label: 'projectile'
        });
        
        // Trail visual (estela del proyectil)
        this.trail = scene.add.particles(0, 0, 'fire-particle', {
            follow: this.sprite,
            speed: 5,
            scale: { start: 0.4, end: 0 },
            alpha: { start: 0.6, end: 0 },
            blendMode: 'ADD',
            lifespan: 200,
            frequency: 30,
        });

        // Disparar
        let speed = weaponCfg.speed;
        this.sprite.applyForce({
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        });
        
        // Registrar detector de colisiones único para ESTE proyectil
        this.collisionCallback = (event) => {
            event.pairs.forEach((pair) => {
                const { bodyA, bodyB } = pair;
                if ((bodyA === this.sprite.body || bodyB === this.sprite.body)) {
                    let otherBody = (bodyA === this.sprite.body) ? bodyB : bodyA;
                    
                    // Inmunidad inicial: Evitar que choque con quien lo disparó instantáneamente
                    if (this.owner && otherBody.label === `player_${this.owner.id}`) {
                        return; // Omitir colisión con el propio tirador
                    }

                    if (otherBody.label === 'terrain' || otherBody.label.startsWith('player')) {
                        this.explode();
                    }
                }
            });
        };
        scene.matter.world.on('collisionstart', this.collisionCallback);

        // Auto-destruir si se sale del mapa (timeout de seguridad)
        scene.time.delayedCall(5000, () => {
            if (!this.hasExploded) {
                this.cleanup();
            }
        });
    }
    
    /**
     * Limpia el proyectil sin explotar (fuera de mapa, etc.)
     */
    cleanup() {
        if (this.hasExploded) return;
        this.hasExploded = true;
        this.scene.matter.world.off('collisionstart', this.collisionCallback);
        if (this.trail) this.trail.destroy();
        if (this.sprite && this.sprite.active) this.sprite.destroy();
        
        // Notificar que se perdió el proyectil para continuar el turno
        this.scene.events.emit('projectileLost');
    }

    explode() {
        if (this.hasExploded) return;
        this.hasExploded = true;

        let x = this.sprite.x;
        let y = this.sprite.y;

        // Limpiar basura (eventos y el propio objeto físico)
        this.scene.matter.world.off('collisionstart', this.collisionCallback);
        if (this.trail) this.trail.destroy();
        
        // Detener el seguimiento de cámara antes de destruir el objeto físico para evitar que la pantalla se ponga negra (Errores NaN)
        if (this.scene.cameras.main) {
            this.scene.cameras.main.stopFollow();
        }
        
        this.sprite.destroy();

        const expCfg = GAME_CONFIG.EXPLOSION;

        // 1. Sensación (Game Feel)
        this.scene.cameras.main.shake(expCfg.CAMERA_SHAKE_DURATION, expCfg.CAMERA_SHAKE_INTENSITY);
        
        // 2. Partículas Visuales
        const fireEmitter = this.scene.add.particles(x, y, 'fire-particle', {
            speed: { min: 100, max: 200 }, angle: { min: 0, max: 360 }, scale: { start: 1, end: 0 },
            blendMode: 'ADD', lifespan: 300, gravityY: 0
        });
        fireEmitter.explode(15);
        
        const smokeEmitter = this.scene.add.particles(x, y, 'smoke-particle', {
            speed: { min: 20, max: 60 }, angle: { min: 180, max: 360 }, scale: { start: 1, end: 3 },
            alpha: { start: 0.5, end: 0 }, tint: 0x444444, lifespan: 1500, gravityY: -50
        });
        smokeEmitter.explode(10);
        
        let flash = this.scene.add.circle(x, y, this.explosionRadius, 0xffeebb, 0.9);
        this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2.5, duration: expCfg.FLASH_DURATION, onComplete: () => flash.destroy() });
        
        // 3. Destrucción Lógica del Entorno
        if (this.scene.terrainManager) {
            this.scene.terrainManager.destroyTerrain(x, y, this.explosionRadius);
        }

        // 4. DAÑO A JUGADORES (NUEVO)
        if (this.scene.playersLookup) {
            for (let id in this.scene.playersLookup) {
                let playerEntity = this.scene.playersLookup[id];
                if (!playerEntity.alive) continue;

                let dist = Phaser.Math.Distance.Between(x, y, playerEntity.sprite.x, playerEntity.sprite.y);
                
                if (dist < this.explosionRadius) {
                    // Daño escalado por distancia (más cerca = más daño)
                    let damageMultiplier = 1 - (dist / this.explosionRadius);
                    let finalDamage = this.damage * damageMultiplier;
                    
                    // Mínimo 5 de daño si estás en rango
                    finalDamage = Math.max(5, Math.round(finalDamage));
                    
                    playerEntity.takeDamage(finalDamage, this.owner);
                }
            }
        }
        
        // 5. Consecuencias Físicas (Onda Expansiva)
        let bodies = this.scene.matter.world.getAllBodies();
        bodies.forEach(body => {
            if(!body.isStatic && body.label !== 'projectile') {
                let dist = Phaser.Math.Distance.Between(x, y, body.position.x, body.position.y);
                if (dist < expCfg.SHOCKWAVE_RADIUS) {
                    let angle = Phaser.Math.Angle.Between(x, y, body.position.x, body.position.y);
                    let force = (expCfg.SHOCKWAVE_RADIUS - dist) * expCfg.SHOCKWAVE_FORCE;
                    this.scene.matter.body.applyForce(body, body.position, {
                        x: Math.cos(angle) * force, y: Math.sin(angle) * force
                    });
                }
            }
        });

        // 6. Notificar que hubo una explosión (para el TurnManager)
        this.scene.events.emit('explosionOccurred', { x, y, radius: this.explosionRadius });
    }
}
