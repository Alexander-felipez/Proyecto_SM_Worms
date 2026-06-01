/**
 * ChargeSystem.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestiona la carga de potencia con la tecla ENTER.
 *
 * Flujo:
 *   1. Jugador mantiene ENTER → currentPower sube de 0 a 1 en CHARGE_DURATION ms
 *   2. Al soltar ENTER        → emite 'chargeReleased' con { power, angle }
 *   3. GameScene escucha y llama fireProjectile con esos valores
 *
 * Integración:
 *   const chargeSystem = new ChargeSystem(scene);
 *   chargeSystem.enable();   // al inicio del turno
 *   chargeSystem.disable();  // al disparar o cambiar turno
 */
export class ChargeSystem {

    static CHARGE_DURATION = 1800; // ms para llegar al 100%
    static MIN_POWER       = 0.15; // Potencia mínima aunque se suelte muy rápido

    constructor(scene) {
        this.scene       = scene;
        this.isCharging  = false;
        this.currentPower = 0;
        this.enabled     = false;

        this._spaceDown = null;
        this._spaceUp   = null;
    }

    // ─── API pública ──────────────────────────────────────────────────────────

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        this.reset();

        this._spaceDown = this.scene.input.keyboard.on('keydown-ENTER', () => {
            if (!this.enabled || this.isCharging) return;
            this.isCharging   = true;
            this.currentPower = 0;
            this._chargeStart = this.scene.time.now;
        });

        this._spaceUp = this.scene.input.keyboard.on('keyup-ENTER', () => {
            if (!this.enabled || !this.isCharging) return;
            this._release();
        });
    }

    disable() {
        this.enabled    = false;
        this.isCharging = false;
        this.currentPower = 0;

        if (this._spaceDown) { this.scene.input.keyboard.off('keydown-ENTER', this._spaceDown); this._spaceDown = null; }
        if (this._spaceUp)   { this.scene.input.keyboard.off('keyup-ENTER',   this._spaceUp);   this._spaceUp   = null; }
    }

    reset() {
        this.isCharging   = false;
        this.currentPower = 0;
        this._chargeStart = null;
    }

    /**
     * Llamar desde GameScene.update() cada frame.
     * Retorna el currentPower (0-1) para que UIScene lo dibuje.
     */
    update() {
        if (!this.isCharging) return 0;

        const elapsed = this.scene.time.now - this._chargeStart;
        this.currentPower = Math.min(1, elapsed / ChargeSystem.CHARGE_DURATION);
        return this.currentPower;
    }

    // ─── Privado ──────────────────────────────────────────────────────────────

    _release() {
        const power = Math.max(ChargeSystem.MIN_POWER, this.currentPower);
        const angle = this._getCurrentAngle();

        this.isCharging   = false;
        this.currentPower = 0;

        // Emitir hacia GameScene
        this.scene.events.emit('chargeReleased', { power, angle });
    }

    _getCurrentAngle() {
        // El ángulo lo define el ratón en coordenadas de mundo
        const player = this.scene.turnManager && this.scene.turnManager.getCurrentPlayer();
        if (!player) return 0;

        const pointer = this.scene.input.activePointer;
        return Math.atan2(
            pointer.worldY - player.sprite.y,
            pointer.worldX - player.sprite.x
        );
    }
}
