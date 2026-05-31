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

        // --- Estadísticas ---
        this.stats = {
            damageDealt: 0,
            damageTaken: 0,
            kills: 0,
        };

        // --- Obtener color de equipo ---
        const teamData = GAME_CONFIG.TEAMS[teamKey] || GAME_CONFIG.TEAMS.RED;

        // Crear Sprite físico en Matter usando el Asset 'soldier' procedural
        this.sprite = scene.matter.add.sprite(x, y, 'soldier');
        this.sprite.setBody({
            type: 'rectangle', 
            width: 32, 
            height: 32
        }, {
            restitution: 0.5, 
            friction: 0.1, 
            density: 0.05, 
            label: `player_${id}`
        });

        // Aplicar tint de equipo al sprite
        this.sprite.setTint(teamData.tint);

        // Etiqueta de Nombre Dinámica
        this.nameTag = scene.add.text(x, y - 30, name, { 
            fontSize: '14px', 
            fill: '#fff',
            fontFamily: 'monospace',
            shadow: { offsetX: 1, offsetY: 1, color: '#000', blur: 2, fill: true }
        }).setOrigin(0.5);

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
        this.scene.time.delayedCall(150, () => {
            if (this.alive && this.sprite.active) {
                const teamData = GAME_CONFIG.TEAMS[this.teamKey] || GAME_CONFIG.TEAMS.RED;
                this.sprite.setTint(teamData.tint);
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

        // Control de inputs (solo si es TU jugador, tienes permisos, Y es tu turno)
        if (this.isLocal && canAct && (!this.scene.socket || this.isHost)) {
            if (cursors.left.isDown) {
                this.sprite.setVelocityX(-GAME_CONFIG.PLAYER.MOVE_SPEED);
            } else if (cursors.right.isDown) {
                this.sprite.setVelocityX(GAME_CONFIG.PLAYER.MOVE_SPEED);
            }
            
            if (cursors.up.isDown && this.sprite.body.velocity.y > -0.1 && this.sprite.body.velocity.y < 0.1) {
                this.sprite.setVelocityY(GAME_CONFIG.PLAYER.JUMP_FORCE); // Salto
            }
            
            // Si el jugador cae al agua (debajo de la pantalla)
            if (this.sprite.y > GAME_CONFIG.PLAYER.FALL_DEATH_Y) {
                // MUERTE POR CAÍDA AL AGUA (Comportamiento Clásico de Worms)
                this.takeDamage(this.hp); // Muerte instantánea
            }
        }
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
}
