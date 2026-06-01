import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

/**
 * Player Entity
 * Representa un personaje jugable con físicas Matter.js, sistema de HP,
 * barra de vida visual, y lógica de muerte.
 */
export class Player {
    constructor(scene, x, y, id, name, isLocal, isHost, teamKey = 'RED') {
        this.scene = scene;
        this.id = id;
        this.name = name;
        this.isLocal = isLocal;
        this.isHost = isHost;
        this.teamKey = teamKey;
        this.alive = true;

        // --- Sistema de HP ---
        const cfg = GAME_CONFIG.PLAYER;
        this.maxHp = cfg.MAX_HP;
        this.hp = this.maxHp;
        
        // --- Inventario de Munición ---
        this.ammo = {
            BAZOOKA: Infinity,
            GRENADE: GAME_CONFIG.WEAPONS.GRENADE.ammo,
            DYNAMITE: GAME_CONFIG.WEAPONS.DYNAMITE.ammo,
        };

        // --- Estadísticas ---
        this.stats = {
            damageDealt: 0,
            damageTaken: 0,
            kills: 0,
        };

        // --- Obtener color de equipo ---
        const teamData = GAME_CONFIG.TEAMS[teamKey] || GAME_CONFIG.TEAMS.RED;

        // Cargar textura de gusanito específica de equipo
        const textureKey = `soldier_${teamKey.toLowerCase()}`;

        // Crear Sprite físico en Matter usando el gusanito procedural
        this.sprite = scene.matter.add.sprite(x, y, textureKey);
        this.sprite.setBody({
            type: 'rectangle', 
            width: 24,
            height: 32
        }, {
            restitution: 0.5, 
            friction: 0.15, 
            density: 0.05, 
            label: `player_${id}`,
            chamfer: { radius: 6 }, // Esquinas redondeadas (chamfer) para evitar atascarse en bordes
            collisionFilter: {
                group: -1,      // Grupo negativo: los jugadores nunca colisionan entre sí
                category: 0x0002,
                mask: 0x0001,   // Solo colisiona con categoría 0x0001 (terreno)
            }
        });

        // Etiqueta de Nombre Dinámica
        this.nameTag = scene.add.text(x, y - 30, name, { 
            fontSize: '14px', 
            fill: '#fff',
            fontFamily: 'monospace',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5);

        // --- Sprite del Arma ---
        this.weaponSprite = scene.add.sprite(x, y, 'bazookaWeapon').setOrigin(0.2, 0.5);
        this.weaponSprite.setDepth(5); // Delante del personaje
        this.weaponSprite.setVisible(false);

        // --- Barra de HP ---
        this.hpBarBg = scene.add.rectangle(x, y + cfg.HP_BAR_OFFSET_Y, cfg.HP_BAR_WIDTH + 2, cfg.HP_BAR_HEIGHT + 2, 0x000000, 0.7).setOrigin(0.5);
        this.hpBar = scene.add.rectangle(x, y + cfg.HP_BAR_OFFSET_Y, cfg.HP_BAR_WIDTH, cfg.HP_BAR_HEIGHT, 0x00ff00, 1).setOrigin(0.5);

        // Lógica de Redes: Si somos cliente (y existe socket), el host maneja las físicas
        if (!isHost && scene.socket) {
            scene.matter.body.setStatic(this.sprite.body, true);
            this.sprite.isSensor = true; // Se vuelve visual solamente, para copiar coordenadas
        }

        // Variables para Interpolación (Lerp) de red en clientes
        this.targetX = x;
        this.targetY = y;

        // --- Control de salto (anti salto infinito) ---
        this.canJump = true;
        // --- Bloqueo post-disparo ---
        this.hasFired = false;

        // Alta fricción estática para evitar resbalamiento en rampas
        this.sprite.setFriction(0.9, 0.05);
        this._jumpCollisionListener = (event) => {
            if (!this.alive || !this.sprite.body) return;
            for (const pair of event.pairs) {
                const { bodyA, bodyB } = pair;
                const isMe = bodyA === this.sprite.body || bodyB === this.sprite.body;
                const otherLabel = bodyA === this.sprite.body ? bodyB.label : bodyA.label;
                if (isMe && (otherLabel === 'terrain' || otherLabel === 'ground' || otherLabel === 'bridge' || otherLabel === 'tree' || otherLabel === 'decoration')) {
                    this.canJump = true;
                }
            }
        };
        scene.matter.world.on('collisionactive', this._jumpCollisionListener);
    }

    /**
     * Recibe daño y actualiza la barra de HP.
     * @param {number} amount - Cantidad de daño a recibir
     * @param {Player|null} attacker - Jugador que causó el daño (para estadísticas)
     * @returns {boolean} true si el jugador murió
     */
    takeDamage(amount, attacker = null) {
        if (!this.alive) return false;

        const actualDamage = Math.min(amount, this.hp);
        this.hp -= actualDamage;
        this.stats.damageTaken += actualDamage;

        // Estadísticas del atacante
        if (attacker && attacker !== this) {
            attacker.stats.damageDealt += actualDamage;
        }

        // Efecto visual de daño (flash rojo)
        this.sprite.setTint(0xff0000);

        // 🔊 Sonido de daño
        if (this.scene.soundManager) this.scene.soundManager.playDamage();
        this.scene.time.delayedCall(150, () => {
            if (this.alive && this.sprite.active) {
                this.sprite.clearTint();
            }
        });

        // Actualizar barra de HP visual
        this.updateHpBar();

        // Texto de daño flotante
        this.showDamageNumber(actualDamage);

        // ¿Murió?
        if (this.hp <= 0) {
            this.die();
            if (attacker && attacker !== this) {
                attacker.stats.kills += 1;
            }
            return true;
        }

        return false;
    }

    /**
     * Actualiza la barra de HP visual.
     */
    updateHpBar() {
        const cfg = GAME_CONFIG.PLAYER;
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        this.hpBar.width = cfg.HP_BAR_WIDTH * hpPercent;

        // Cambiar color según HP restante
        if (hpPercent > 0.6) {
            this.hpBar.fillColor = 0x00ff00; // Verde
        } else if (hpPercent > 0.3) {
            this.hpBar.fillColor = 0xffaa00; // Naranja
        } else {
            this.hpBar.fillColor = 0xff0000; // Rojo
        }
    }

    /**
     * Muestra un número de daño flotante que sube y desaparece.
     */
    showDamageNumber(amount) {
        const dmgText = this.scene.add.text(this.sprite.x, this.sprite.y - 50, `-${Math.round(amount)}`, {
            fontSize: '20px',
            fontStyle: 'bold',
            fill: '#ff4444',
            fontFamily: 'monospace',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 3, fill: true }
        }).setOrigin(0.5);

        this.scene.tweens.add({
            targets: dmgText,
            y: dmgText.y - 40,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => dmgText.destroy()
        });
    }

    /**
     * Muerte del jugador con animación.
     */
    die() {
        if (!this.alive) return;
        this.alive = false;

        // 🔊 Sonido de muerte
        if (this.scene.soundManager) this.scene.soundManager.playDeath();

        // Limpiar listener de salto
        if (this._jumpCollisionListener) {
            this.scene.matter.world.off('collisionactive', this._jumpCollisionListener);
        }

        // Animación de muerte
        this.scene.tweens.add({
            targets: this.sprite,
            alpha: 0,
            scale: 0.3,
            angle: 360,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
                // Partícula de "poof"
                if (this.scene.textures.exists('smoke-particle')) {
                    const deathEmitter = this.scene.add.particles(this.sprite.x, this.sprite.y, 'smoke-particle', {
                        speed: { min: 30, max: 80 },
                        angle: { min: 0, max: 360 },
                        scale: { start: 0.5, end: 0 },
                        alpha: { start: 0.8, end: 0 },
                        lifespan: 600,
                        gravityY: -20
                    });
                    deathEmitter.explode(8);
                }

                // Remover del mundo físico
                if (this.sprite.body) {
                    this.scene.matter.world.remove(this.sprite.body);
                }
                this.sprite.destroy();
                this.weaponSprite.destroy();
                this.nameTag.destroy();
                this.hpBar.destroy();
                this.hpBarBg.destroy();
            }
        });

        // Notificar al scene
        this.scene.events.emit('playerDied', this);
    }

    update(cursors, canAct = true) {
        if (!this.alive) return;

        // Interpolación (Lerp) suave para clientes
        if (!this.isHost && this.scene.socket) {
            // Interpola hacia el último target reportado por el host
            const lerpFactor = GAME_CONFIG.NETWORK.LERP_FACTOR;
            this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, lerpFactor);
            this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, lerpFactor);
        }

        // Actualizar posición de elementos visuales que siguen al sprite
        this.nameTag.setPosition(this.sprite.x, this.sprite.y - 30);
        this.hpBarBg.setPosition(this.sprite.x, this.sprite.y + GAME_CONFIG.PLAYER.HP_BAR_OFFSET_Y);
        this.hpBar.setPosition(this.sprite.x, this.sprite.y + GAME_CONFIG.PLAYER.HP_BAR_OFFSET_Y);

        // ═══════════════════════════════════════
        //  CONTROL VISUAL DEL ARMA
        // ═══════════════════════════════════════
        const weaponKey = this.scene.currentWeaponKey;
        if (canAct && (!this.scene.socket || this.isLocal) && weaponKey && weaponKey !== 'NONE' && this.scene.turnManager.canFire()) {
            this.weaponSprite.setVisible(true);
            
            // Cambiar textura según el arma
            if (weaponKey === 'BAZOOKA') {
                this.weaponSprite.setTexture('bazookaWeapon');
                this.weaponSprite.setOrigin(0.2, 0.5);
            } else if (weaponKey === 'GRENADE') {
                this.weaponSprite.setTexture('grenadeTexture');
                this.weaponSprite.setOrigin(0.5, 0.5);
            } else if (weaponKey === 'DYNAMITE') {
                this.weaponSprite.setTexture('dynamiteTexture');
                this.weaponSprite.setOrigin(0.5, 0.5);
            }

            // Apuntar siguiendo el cursor
            const pointer = this.scene.input.activePointer;
            const angle = Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, pointer.worldX, pointer.worldY);
            this.weaponSprite.setRotation(angle);

            // Voltear sprites si mira a la izquierda y ajustar arma
            if (Math.abs(angle) > Math.PI / 2) {
                this.sprite.setFlipX(true);
                this.weaponSprite.setFlipY(true);
                this.weaponSprite.setPosition(this.sprite.x - 5, this.sprite.y + 2);
            } else {
                this.sprite.setFlipX(false);
                this.weaponSprite.setFlipY(false);
                this.weaponSprite.setPosition(this.sprite.x + 5, this.sprite.y + 2);
            }
        } else {
            this.weaponSprite.setVisible(false);
        }

        // ═══════════════════════════════════════
        //  DETECCIÓN DE ESTADO PARA ANIMACIONES
        // ═══════════════════════════════════════
        const velY = this.sprite.body ? this.sprite.body.velocity.y : 0;
        const isOnGround = this.sprite.body ? (Math.abs(velY) < 0.5) : true;
        const wasInAir = this._wasInAir || false;

        // Control de inputs (solo si es TU jugador, tienes permisos, Y es tu turno)
        // hasFired bloquea movimiento desde el disparo hasta que el TurnManager cambie turno
        if (this.isLocal && canAct && !this.hasFired && (!this.scene.socket || this.isHost)) {
            let walking = false;
            let dir = 0;
            if (cursors.left.isDown) {
                this.sprite.setVelocityX(-GAME_CONFIG.PLAYER.MOVE_SPEED);
                if (!this.weaponSprite.visible) this.sprite.setFlipX(true);
                walking = true;
                dir = -1;
            } else if (cursors.right.isDown) {
                this.sprite.setVelocityX(GAME_CONFIG.PLAYER.MOVE_SPEED);
                if (!this.weaponSprite.visible) this.sprite.setFlipX(false);
                walking = true;
                dir = 1;
            } else {
                // Sin input: frenar horizontalmente al instante (sin deslizamiento)
                this.sprite.setVelocityX(0);
            }

            // --- Step-up Assist (Subir escalones <= 16px sin saltar) ---
            if (walking && this.scene.terrainManager) {
                const checkDist = 14;   // Justo adelante del gusanito (ancho 24px)
                const footX = this.sprite.x + dir * checkDist;
                const footY = this.sprite.y + 14;   // altura de los pies
                
                // Si hay un obstáculo sólido en los pies
                if (this.scene.terrainManager.isPointSolid(footX, footY)) {
                    const kneeY = this.sprite.y - 2; // altura de rodillas/cintura
                    // Y la zona superior está libre (obstáculo bajo de máx 16px)
                    if (!this.scene.terrainManager.isPointSolid(footX, kneeY)) {
                        // Assist: Desplazar ligeramente hacia arriba y dar impulso adelante
                        this.scene.matter.body.setPosition(this.sprite.body, {
                            x: this.sprite.x + dir * 1.5,
                            y: this.sprite.y - 5
                        });
                        this.sprite.setVelocityX(dir * GAME_CONFIG.PLAYER.MOVE_SPEED);
                    }
                }
            }
            
            // Efecto de polvo al caminar
            if (walking && Math.abs(this.sprite.body.velocity.y) < 0.1 && Math.random() < 0.15) {
                this.createDustPoof(1);
            }
            
            if (cursors.up.isDown && this.canJump) {
                this.canJump = false;
                this.sprite.setVelocityY(GAME_CONFIG.PLAYER.JUMP_FORCE);
                this.createDustPoof(6);

                // 🔊 Sonido de salto
                if (this.scene.soundManager) this.scene.soundManager.playJump();

                // 🪱 ANIMACIÓN DE SALTO — Estirar verticalmente
                this.scene.tweens.killTweensOf(this.sprite, 'scaleX');
                this.scene.tweens.killTweensOf(this.sprite, 'scaleY');
                this.sprite.setScale(0.75, 1.3);
            }

            // ═══════════════════════════════════════
            //  🪱 ANIMACIONES PROCEDURALES (SQUASH & STRETCH)
            // ═══════════════════════════════════════

            if (walking && isOnGround) {
                // 🐛 GATEO (Crawl Wobble) — ondulación sinusoidal rítmica
                const time = this.scene.time.now;
                const wobbleFreq = 0.012; // Velocidad del ciclo
                const wobbleX = 1 + Math.sin(time * wobbleFreq) * 0.12;
                const wobbleY = 1 - Math.sin(time * wobbleFreq) * 0.10;
                const wobbleAngle = Math.sin(time * wobbleFreq * 0.7) * 4;
                this.sprite.setScale(wobbleX, wobbleY);
                this.sprite.setAngle(wobbleAngle);
            } else if (!isOnGround) {
                // 🌬️ EN EL AIRE — ligero estiramiento vertical durante la caída
                const airScaleX = Phaser.Math.Linear(this.sprite.scaleX, 0.85, 0.1);
                const airScaleY = Phaser.Math.Linear(this.sprite.scaleY, 1.15, 0.1);
                this.sprite.setScale(airScaleX, airScaleY);
                this.sprite.setAngle(0);
            } else {
                // 🧘 QUIETO — restaurar forma suavemente
                const restoreX = Phaser.Math.Linear(this.sprite.scaleX, 1, 0.15);
                const restoreY = Phaser.Math.Linear(this.sprite.scaleY, 1, 0.15);
                this.sprite.setScale(restoreX, restoreY);
                const restoreAngle = Phaser.Math.Linear(this.sprite.angle, 0, 0.2);
                this.sprite.setAngle(restoreAngle);
            }

            // 💥 ATERRIZAJE (Landing Juice) — detecta transición aire→suelo
            if (wasInAir && isOnGround) {
                // Aplastamiento amortiguador
                this.scene.tweens.killTweensOf(this.sprite, 'scaleX');
                this.scene.tweens.killTweensOf(this.sprite, 'scaleY');
                this.scene.tweens.add({
                    targets: this.sprite,
                    scaleX: 1.3,
                    scaleY: 0.7,
                    duration: 80,
                    ease: 'Quad.easeOut',
                    yoyo: true,
                    onComplete: () => {
                        this.scene.tweens.add({
                            targets: this.sprite,
                            scaleX: 1,
                            scaleY: 1,
                            duration: 150,
                            ease: 'Back.easeOut'
                        });
                    }
                });
                // Bocanada de polvo al aterrizar
                this.createDustPoof(4);
            }
            
            // Si el jugador cae al agua (por debajo del waterLevel) o al vacío
            const waterLevel = this.scene.terrainManager ? this.scene.terrainManager.waterLevel : GAME_CONFIG.PLAYER.FALL_DEATH_Y;
            if (this.sprite.y > waterLevel) {
                this.deathCause = this.scene.hasWater === false ? 'void' : 'water';
                if (this.deathCause === 'water') {
                    // Disparar salpicadura reactiva en el waterLevel
                    this.scene.events.emit('waterSplash', { x: this.sprite.x, y: waterLevel, force: 1.8 });
                }
                this.takeDamage(this.hp);
            }
        } else if (this.hasFired) {
            // Post-disparo: clavar al jugador en su sitio (no resbala en rampas)
            this.sprite.setVelocityX(0);
        }

        // Guardar estado para el próximo frame
        this._wasInAir = !isOnGround;
    }

    setPosition(x, y) {
        if (this.isHost || !this.scene.socket) {
            // Hard set para el host/local
            this.sprite.setPosition(x, y);
        } else {
            // Actualizar el target para el lerp en clientes
            this.targetX = x;
            this.targetY = y;
        }
    }

    hasAmmo(weaponKey) {
        return this.ammo[weaponKey] > 0;
    }

    deductAmmo(weaponKey) {
        if (this.ammo[weaponKey] !== Infinity) {
            this.ammo[weaponKey]--;
        }
    }

    createDustPoof(count = 1) {
        if (!this.scene || !this.scene.textures.exists('smoke-particle')) return;
        const dust = this.scene.add.particles(this.sprite.x, this.sprite.y + 16, 'smoke-particle', {
            speed: { min: 10, max: 30 },
            angle: { min: 180, max: 360 },
            scale: { start: 0.15, end: 0 },
            alpha: { start: 0.4, end: 0 },
            lifespan: 300,
            frequency: -1,
        });
        dust.explode(count);
        this.scene.time.delayedCall(400, () => dust.destroy());
    }
}