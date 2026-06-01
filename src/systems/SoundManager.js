/**
 * SoundManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Maneja todos los sonidos del juego usando los archivos de audio reales
 * cargados en PreloadScene.
 *
 * Claves de audio (cargadas en PreloadScene):
 *   sfx_bazooka_disparo      → bazoka.flac          (explosión de bazuca)
 *   sfx_bazooka_trayectoria  → sonido_trayectoria_bazoka.wav  (loop en vuelo)
 *   sfx_granada              → granada.mp3           (explosión de granada)
 *   sfx_dinamita_explosion   → dinamita.wav          (explosión de dinamita)
 *   sfx_salto                → salto_act.mp3
 *   sfx_turno_notificacion   → notificacion_turno.wav
 *
 * FLUJO DE AUDIO:
 *   Bazuca  : playShoot() → trayectoria en loop → impacto → playExplosion() detiene loop + suena explosión
 *   Granada : playShoot() → silencio → timer 3000ms en Projectile.js → playExplosion() suena explosión
 *   Dinamita: playShoot() → silencio → timer 4000ms en Projectile.js → playExplosion() suena explosión
 */

export class SoundManager {
    /**
     * @param {Phaser.Scene} scene
     */
    constructor(scene) {
        this.scene = scene;

        // Sonido de trayectoria de bazuca (loop mientras el proyectil vuela)
        this._bazookaTravelSound = null;

        // Leer volumen y estado inicial del registry
        this._syncVolume();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API PÚBLICA — sonidos de gameplay
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Sonido al disparar.
     * Bazuca: inicia loop de trayectoria.
     * Granada y Dinamita: sin sonido de disparo.
     */
    playShoot(weaponKey = 'BAZOOKA') {
        if (!this._enabled()) return;
        switch (weaponKey) {
            case 'BAZOOKA':
                this._startBazookaTravel();
                break;
            case 'GRENADE':
                // Sin sonido de lanzamiento — la explosión llega sola después del fuse (3000ms)
                break;
            case 'DYNAMITE':
                // Sin sonido de lanzamiento — la explosión llega sola después del fuse (4000ms)
                break;
        }
    }

    /**
     * Sonido de explosión.
     * Llamado desde Projectile.js en el método explode().
     * Bazuca: detiene el loop de trayectoria e inmediatamente suena la explosión.
     * Granada: suena la explosión (ya sincronizada por el fuse de 3000ms).
     * Dinamita: suena la explosión (ya sincronizada por el fuse de 4000ms).
     */
    playExplosion(weaponKey = 'BAZOOKA') {
        if (!this._enabled()) return;
        switch (weaponKey) {
            case 'BAZOOKA':
                this._stopBazookaTravel();           // Corta trayectoria
                this._play('sfx_bazooka_disparo');   // Suena explosión de inmediato
                break;
            case 'GRENADE':
                this._play('sfx_granada');
                break;
            case 'DYNAMITE':
                this._play('sfx_dinamita_explosion');
                break;
            default:
                this._play('sfx_bazooka_disparo');
                break;
        }
    }

    /** Salto del personaje */
    playJump() {
        if (!this._enabled()) return;
        this._play('sfx_salto');
    }

    /** Recibir daño — sin archivo dedicado aún */
    playDamage() {
        // Agregar clave cuando se tenga el archivo
    }

    /** Muerte de jugador — sin archivo dedicado aún */
    playDeath() {
        // Agregar clave cuando se tenga el archivo
    }

    /** Inicio de turno */
    playTurnStart() {
        if (!this._enabled()) return;
        this._play('sfx_turno_notificacion');
    }

    /** Fin de turno — reutiliza notificación con menor volumen */
    playTurnEnd() {
        if (!this._enabled()) return;
        this._play('sfx_turno_notificacion', { volume: 0.5 });
    }

    /** Cambio de arma — sin archivo dedicado aún */
    playWeaponSwitch() {
        // Agregar clave cuando se tenga el archivo
    }

    /** Fin de partida — sin archivo dedicado aún */
    playGameOver() {
        // Agregar clave cuando se tenga el archivo
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MÚSICA DE FONDO
    // ─────────────────────────────────────────────────────────────────────────

    startMusic() {
        // Descomentar cuando tengas el archivo de música:
        // this._play('sfx_musica_fondo', { loop: true, volume: 0.4 });
    }

    stopMusic() {
        // this.scene.sound.stopByKey('sfx_musica_fondo');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTROL DE VOLUMEN — sincronizado con PauseScene
    // ─────────────────────────────────────────────────────────────────────────

    /** Llamar cada vez que el registry cambie SOUND_ENABLED o SOUND_VOLUME */
    _syncVolume() {
        const vol = this.scene.registry.get('SOUND_VOLUME') ?? 1.0;
        this.scene.sound.volume = vol;
    }

    _enabled() {
        this._syncVolume();
        return this.scene.registry.get('SOUND_ENABLED') !== false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRAYECTORIA DE BAZUCA (loop mientras el proyectil está en vuelo)
    // ─────────────────────────────────────────────────────────────────────────

    _startBazookaTravel() {
        this._stopBazookaTravel(); // Evita duplicados si hay un proyectil previo activo
        this._bazookaTravelSound = this.scene.sound.add('sfx_bazooka_trayectoria', {
            loop: true,
            volume: 0.6
        });
        this._bazookaTravelSound.play();
    }

    _stopBazookaTravel() {
        if (this._bazookaTravelSound) {
            this._bazookaTravelSound.stop();
            this._bazookaTravelSound.destroy();
            this._bazookaTravelSound = null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER — reproducir un sonido con opciones opcionales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {string} key   - Clave del audio cargado en PreloadScene
     * @param {object} opts  - Opciones de Phaser Sound (volume, loop, etc.)
     */
    _play(key, opts = {}) {
        if (!this.scene.cache.audio.exists(key)) {
            console.warn(`[SoundManager] Audio no encontrado en cache: "${key}"`);
            return;
        }
        this.scene.sound.play(key, { volume: 0.8, ...opts });
    }
}