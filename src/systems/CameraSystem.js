/**
 * CameraSystem.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centraliza TODA la lógica de cámara de Bolivia Tactics 2D:
 *   - Intro panorámica al iniciar partida
 *   - Seguir al jugador activo durante su turno
 *   - Seguir el proyectil mientras vuela  ← NUEVO
 *   - Volver suavemente al jugador activo tras la explosión
 *
 * USO en GameScene:
 *   import { CameraSystem } from '../systems/CameraSystem';
 *   this.cameraSystem = new CameraSystem(this);
 *   this.cameraSystem.init(mapConfig, myPlayer);   // en create()
 *   this.cameraSystem.followProjectile(projectileSprite); // al disparar
 *   this.cameraSystem.returnToPlayer(playerSprite);       // tras explosión
 */

import { GAME_CONFIG } from '../config/GameConfig';

export class CameraSystem {
    /**
     * @param {Phaser.Scene} scene - La escena principal (GameScene)
     */
    constructor(scene) {
        this.scene   = scene;
        this.cam     = scene.cameras.main;
        this.mapConfig   = null;
        this.activePlayer = null;   // Sprite del jugador activo actualmente
        this._followingProjectile = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INICIALIZACIÓN (llamar una vez en GameScene.create, al final)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Configura límites del mundo y lanza la intro cinematográfica del mapa.
     * @param {object} mapConfig  - Resultado de getMapConfig()
     * @param {Player} myPlayer   - Entidad del jugador local
     */
    init(mapConfig, myPlayer) {
        this.mapConfig    = mapConfig;
        this.activePlayer = myPlayer ? myPlayer.sprite : null;

        // Limitar la cámara al mundo
        this.cam.setBounds(
            0, 0,
            GAME_CONFIG.MAP.DEFAULT_WIDTH,
            GAME_CONFIG.MAP.DEFAULT_HEIGHT
        );

        if (mapConfig.biome === 'SANTA_CRUZ') {
            this._introSantaCruz();
        } else {
            this._introDefault();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CAMBIO DE TURNO — llamar desde el evento 'turnStarted'
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * La cámara empieza a seguir al jugador cuyo turno comienza.
     * @param {Phaser.GameObjects.Sprite} playerSprite
     */
    followPlayer(playerSprite) {
        if (!playerSprite) return;
        this.activePlayer = playerSprite;
        this._followingProjectile = false;
        this.cam.stopFollow();
        this.cam.startFollow(playerSprite, true, 0.08, 0.08);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SEGUIR PROYECTIL — llamar justo después de crear el Projectile
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Hace que la cámara persiga el proyectil mientras vuela.
     * Cuando el proyectil explota (o desaparece), vuelve automáticamente
     * al jugador activo con un suave tween.
     *
     * @param {Phaser.GameObjects.Sprite} projectileSprite - sprite del proyectil
     * @param {string} weaponType - 'BAZOOKA' | 'GRENADE' | 'DYNAMITE'
     */
    followProjectile(projectileSprite, weaponType = 'BAZOOKA') {
        if (!projectileSprite) return;

        this._followingProjectile = true;

        // La dinamita no vuela lejos — no hace falta seguirla,
        // pero sí hacer un pequeño zoom out para ver dónde cae
        if (weaponType === 'DYNAMITE') {
            this.scene.tweens.add({
                targets: this.cam,
                zoom: this.cam.zoom * 0.85,
                duration: 400,
                ease: 'Sine.easeOut',
            });
            return; // La cámara no sigue a la dinamita, solo hace zoom out
        }

        // Zoom out suave para dar sensación de vuelo
        const zoomOut = Math.max(this.cam.zoom * 0.75, 0.45);
        this.scene.tweens.add({
            targets: this.cam,
            zoom: zoomOut,
            duration: 300,
            ease: 'Sine.easeOut',
        });

        // Seguir el sprite con lerp rápido (proyectil va rápido)
        this.cam.startFollow(projectileSprite, true, 0.15, 0.15);

        // Guardar referencia para el return
        this._trackedProjectile = projectileSprite;

        // Vigilar en cada frame si el proyectil ya no existe
        const checkDestroyed = () => {
            if (!this._followingProjectile) return; // Ya se canceló externamente
            if (!projectileSprite || !projectileSprite.active) {
                // El proyectil explotó o fue destruido
                this._onProjectileGone();
            }
        };

        this.scene.events.on('update', checkDestroyed, this);

        // Guardar el listener para poder quitarlo
        this._projectileUpdateListener = checkDestroyed;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VOLVER AL JUGADOR — se llama automáticamente tras la explosión
    // (también se puede llamar manualmente si necesitas)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Devuelve la cámara suavemente al jugador activo.
     * Se llama automáticamente cuando el proyectil desaparece.
     * @param {Phaser.GameObjects.Sprite} [playerSprite] - opcional, si ya cambió
     */
    returnToPlayer(playerSprite) {
        const target = playerSprite || this.activePlayer;
        this._followingProjectile = false;

        // Quitar listener de update del proyectil
        if (this._projectileUpdateListener) {
            this.scene.events.off('update', this._projectileUpdateListener, this);
            this._projectileUpdateListener = null;
        }

        if (!target) return;

        // Primero dejar de seguir el proyectil
        this.cam.stopFollow();

        // Zoom de regreso al valor normal del mapa
        const targetZoom = this.mapConfig.biome === 'SANTA_CRUZ' ? 0.85 : 1.0;
        this.scene.tweens.add({
            targets: this.cam,
            zoom: targetZoom,
            duration: 600,
            ease: 'Sine.easeInOut',
        });

        // Pan suave hacia el jugador, luego iniciar follow
        this.cam.pan(
            target.x,
            target.y,
            500,            // duración del pan en ms
            'Sine.easeInOut',
            false,
            (cam, progress) => {
                if (progress === 1) {
                    // Una vez centrado, activar follow normal
                    this.cam.startFollow(target, true, 0.08, 0.08);
                }
            }
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    _onProjectileGone() {
        // Quitar listener
        if (this._projectileUpdateListener) {
            this.scene.events.off('update', this._projectileUpdateListener, this);
            this._projectileUpdateListener = null;
        }

        // ⚠️ CRÍTICO: detener el follow AHORA MISMO antes de cualquier delay.
        // Si no, Phaser sigue intentando seguir el sprite destruido y manda
        // la cámara a (0,0) → pantalla negra.
        this.cam.stopFollow();

        // Breve pausa para que el jugador vea la explosión, luego vuelve
        this.scene.time.delayedCall(700, () => {
            this.returnToPlayer();
        });
    }

    _introSantaCruz() {
        // Vista panorámica del cañón
        this.cam.setZoom(0.55);
        this.cam.centerOn(
            GAME_CONFIG.MAP.DEFAULT_WIDTH / 2,
            GAME_CONFIG.MAP.DEFAULT_HEIGHT * 0.55
        );
        this.cam.setDeadzone(120, 80);

        // Tras 2.5s, zoom in hacia el jugador
        this.scene.time.delayedCall(2500, () => {
            this.scene.tweens.add({
                targets: this.cam,
                zoom: 0.85,
                duration: 1200,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    if (this.activePlayer) {
                        this.cam.startFollow(this.activePlayer, true, 0.07, 0.07);
                    }
                }
            });
        });
    }

    _introDefault() {
        if (this.activePlayer) {
            this.cam.startFollow(this.activePlayer, true, 0.08, 0.08);
        }
    }
}