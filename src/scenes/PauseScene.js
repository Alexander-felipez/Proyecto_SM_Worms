import Phaser from 'phaser';

/**
 * PauseScene
 * ─────────────────────────────────────────────────────────────────────────────
 * Overlay modal de pausa. Se lanza ENCIMA de GameScene (que queda pausada).
 * Controles: Continuar | Sonido ON/OFF + Volumen | Salir al Menú
 */
export class PauseScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PauseScene' });
    }

    create() {
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        // ── Fondo oscuro semitransparente ────────────────────────────────────
        const overlay = this.add.rectangle(0, 0, W, H, 0x000000, 0.62).setOrigin(0);

        // Cerrar al hacer clic fuera del panel
        overlay.setInteractive();
        overlay.on('pointerdown', () => this._resume());

        // ── Panel central ────────────────────────────────────────────────────
        const PW = 360, PH = 340;
        const PX = W / 2, PY = H / 2;

        const panelGfx = this.add.graphics();
        panelGfx.fillStyle(0x060a1c, 0.92);
        panelGfx.fillRoundedRect(PX - PW / 2, PY - PH / 2, PW, PH, 14);
        panelGfx.lineStyle(2, 0x00ffff, 0.7);
        panelGfx.strokeRoundedRect(PX - PW / 2, PY - PH / 2, PW, PH, 14);

        // ── Título ───────────────────────────────────────────────────────────
        this.add.text(PX, PY - 135, '⏸  PAUSA', {
            fontSize: '26px', fontFamily: 'Chakra Petch, monospace',
            color: '#00ffff', fontStyle: 'bold',
            shadow: { offsetX: 0, offsetY: 0, color: '#00ffff', blur: 12, fill: true }
        }).setOrigin(0.5);

        // ── Separador ───────────────────────────────────────────────────────
        const sepGfx = this.add.graphics();
        sepGfx.lineStyle(1, 0x334455, 0.8);
        sepGfx.lineBetween(PX - 140, PY - 108, PX + 140, PY - 108);

        // ── Botón: Continuar ─────────────────────────────────────────────────
        this._makeButton(PX, PY - 68, '▶  CONTINUAR', '#00ff88', 0x00ff88, () => this._resume());

        // ── Control de Sonido ────────────────────────────────────────────────
        const soundEnabled = this.registry.get('SOUND_ENABLED') !== false;
        const vol          = this.registry.get('SOUND_VOLUME') ?? 1;

        this._soundLabel = this.add.text(PX, PY - 10, '', {
            fontSize: '15px', fontFamily: 'Chakra Petch, monospace', color: '#aaccee'
        }).setOrigin(0.5);
        this._refreshSoundLabel();

        // Toggle ON/OFF
        this._makeButton(PX - 75, PY + 38, 'ON/OFF', '#ffdd00', 0xffdd00, () => {
            const cur = this.registry.get('SOUND_ENABLED') !== false;
            this.registry.set('SOUND_ENABLED', !cur);
            this._applySoundSettings();
            this._refreshSoundLabel();
        }, 120, 36, '13px');

        // Volumen − / +
        this._makeButton(PX + 30, PY + 38, '−', '#aaaacc', 0x8888bb, () => {
            const v = Math.max(0, (this.registry.get('SOUND_VOLUME') ?? 1) - 0.2);
            this.registry.set('SOUND_VOLUME', parseFloat(v.toFixed(1)));
            this._applySoundSettings();
            this._refreshSoundLabel();
        }, 44, 36, '18px');

        this._makeButton(PX + 82, PY + 38, '+', '#aaaacc', 0x8888bb, () => {
            const v = Math.min(1, (this.registry.get('SOUND_VOLUME') ?? 1) + 0.2);
            this.registry.set('SOUND_VOLUME', parseFloat(v.toFixed(1)));
            this._applySoundSettings();
            this._refreshSoundLabel();
        }, 44, 36, '18px');

        // ── Separador ───────────────────────────────────────────────────────
        sepGfx.lineBetween(PX - 140, PY + 72, PX + 140, PY + 72);

        // ── Botón: Salir al Menú ─────────────────────────────────────────────
        this._makeButton(PX, PY + 108, '✕  SALIR AL MENÚ', '#ff4444', 0xff4444, () => this._exitToMenu());

        // ── Tecla ESC para reanudar ──────────────────────────────────────────
        this.input.keyboard.once('keydown-ESC', () => this._resume());
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    _makeButton(x, y, label, textColor, borderColor, callback, w = 220, h = 44, fontSize = '16px') {
        const gfx = this.add.graphics();

        const draw = (hover) => {
            gfx.clear();
            gfx.fillStyle(hover ? 0x111e3a : 0x000000, hover ? 0.9 : 0.5);
            gfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
            gfx.lineStyle(hover ? 2 : 1.2, borderColor, hover ? 1 : 0.65);
            gfx.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
        };
        draw(false);

        this.add.text(x, y, label, {
            fontSize, fontFamily: 'Chakra Petch, monospace',
            color: textColor, fontStyle: 'bold'
        }).setOrigin(0.5);

        const zone = this.add.rectangle(x, y, w, h, 0x000000, 0.01)
            .setInteractive({ useHandCursor: true });

        zone.on('pointerover',  () => draw(true));
        zone.on('pointerout',   () => draw(false));
        zone.on('pointerdown',  () => callback());
    }

    _refreshSoundLabel() {
        const enabled = this.registry.get('SOUND_ENABLED') !== false;
        const vol     = this.registry.get('SOUND_VOLUME') ?? 1;
        const pct     = Math.round(vol * 100);
        const icon    = enabled ? '🔊' : '🔇';
        this._soundLabel.setText(`${icon}  SONIDO  ${enabled ? `VOL: ${pct}%` : 'SILENCIADO'}`);
        this._soundLabel.setColor(enabled ? '#aaccee' : '#556677');
    }

    _applySoundSettings() {
        const enabled = this.registry.get('SOUND_ENABLED') !== false;
        const vol     = this.registry.get('SOUND_VOLUME') ?? 1;
        // Aplicar a todos los sonidos activos de Phaser
        this.sound.setMute(!enabled);
        this.sound.setVolume(vol);
        // Propagar a otras escenas
        const gs = this.scene.get('GameScene');
        if (gs && gs.sound) {
            gs.sound.setMute(!enabled);
            gs.sound.setVolume(vol);
        }
    }

    _resume() {
        this.scene.resume('GameScene');
        this.scene.stop();
    }

    _exitToMenu() {
        // Destruir el juego Phaser completo y volver al menú HTML
        // igual que hace GameOverScene — gameManager.js escucha 'returnToMenu'
        this.scene.stop('PauseScene');
        this.scene.stop('UIScene');
        this.scene.stop('GameScene');
        this.game.events.emit('returnToMenu');
    }
}
