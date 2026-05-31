import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';
import { calcLaunchVelocity, simulateTrajectory } from '../config/LaunchConfig';

/**
 * AimingSystem
 * ─────────────────────────────────────────────────────────────────────────────
 * Mira de tensión con predicción corta.
 *
 *  1. RETÍCULA DINÁMICA  — cruz clampeada a 250px que indica ángulo y potencia.
 *  2. ESTELA FANTASMA    — puntos que se desvanecen, calculados con calcLaunchVelocity()
 *     y simulateTrajectory() de LaunchConfig: exactamente los mismos números que
 *     usará Projectile.js al disparar.
 *
 * Uso:
 *   this.aimingSystem = new AimingSystem(scene);
 *   // en update():
 *   this.aimingSystem.update(shooterSprite, pointer, weaponKey, windSpeed);
 *   // al disparar o cambiar turno:
 *   this.aimingSystem.hide();
 */
export class AimingSystem {

    static MAX_PULL_DISTANCE = 250;
    static DOT_SPACING       = 2;    // dibujar 1 de cada N pasos
    static DOT_MAX_RADIUS    = 3.5;
    static DOT_MIN_RADIUS    = 1.0;

    constructor(scene) {
        this.scene = scene;

        this.trailGfx  = scene.add.graphics().setDepth(20);
        this.crosshair = scene.add.graphics().setDepth(21);

        this.infoText = scene.add.text(0, 0, '', {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5, 1).setDepth(22).setAlpha(0);
    }

    // ─── API pública ──────────────────────────────────────────────────────────

    update(shooterSprite, pointer, weaponKey, windSpeed = 0) {
        const ox = shooterSprite.x;
        const oy = shooterSprite.y;

        // 1. Calcular velocidad inicial con el cerebro compartido
        const launch = calcLaunchVelocity(ox, oy, pointer.worldX, pointer.worldY, weaponKey);

        // 2. Spawn offset idéntico al de Projectile.js
        const spawnX = ox + Math.cos(launch.angle) * 45;
        const spawnY = oy + Math.sin(launch.angle) * 45;

        // 3. Simular trayectoria con los mismos vx/vy
        const gravity = (this.scene.mapConfig && this.scene.mapConfig.gravity) || 1.0;
        const allDots = simulateTrajectory(
            spawnX, spawnY,
            launch.vx, launch.vy,
            gravity,
            windSpeed,
            weaponKey,
            60   // pasos ≈ 1 segundo
        );

        // 4. Submuestrear para el dibujo (cada DOT_SPACING pasos)
        const dots = allDots.filter((_, i) => i % AimingSystem.DOT_SPACING === 0);

        // 5. Dibujar
        this._drawTrail(dots, weaponKey);

        // Posición de la retícula: clampeada a MAX_PULL_DISTANCE
        const clampedDist = Math.min(launch.dist, AimingSystem.MAX_PULL_DISTANCE);
        const crossX = ox + Math.cos(launch.angle) * clampedDist;
        const crossY = oy + Math.sin(launch.angle) * clampedDist;
        const power  = launch.speed; // px/frame, para colorear la retícula

        this._drawCrosshair(crossX, crossY, weaponKey, clampedDist / AimingSystem.MAX_PULL_DISTANCE);
        this._updateInfoText(crossX, crossY, launch, weaponKey);

        // Devolver datos en vivo para que GameScene los reenvíe a UIScene
        return {
            active: true,
            angle:  Math.round(Phaser.Math.RadToDeg(launch.angle)),
            speed:  launch.speed,
            vx:     launch.vx,
            vy:     launch.vy,
            wind:   windSpeed,
        };
    }

    hide() {
        this.trailGfx.clear();
        this.crosshair.clear();
        this.infoText.setAlpha(0);
    }

    destroy() {
        this.hide();
        this.trailGfx.destroy();
        this.crosshair.destroy();
        this.infoText.destroy();
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    _drawTrail(dots, weaponKey) {
        this.trailGfx.clear();
        if (!dots.length) return;

        const colors = {
            BAZOOKA:  { r: 255, g: 230, b: 50  },
            GRENADE:  { r: 80,  g: 255, b: 130 },
            DYNAMITE: { r: 255, g: 80,  b: 80  },
        };
        const c = colors[weaponKey] || colors.BAZOOKA;
        const hex = Phaser.Display.Color.GetColor(c.r, c.g, c.b);

        dots.forEach((dot, idx) => {
            const alpha  = Phaser.Math.Linear(0.88, 0.0, dot.t);
            const radius = Phaser.Math.Linear(AimingSystem.DOT_MAX_RADIUS, AimingSystem.DOT_MIN_RADIUS, dot.t);

            this.trailGfx.fillStyle(hex, alpha);
            this.trailGfx.fillCircle(dot.x, dot.y, radius);

            if (idx > 0) {
                const prev = dots[idx - 1];
                this.trailGfx.lineStyle(1, hex, Phaser.Math.Linear(0.3, 0, dot.t));
                this.trailGfx.lineBetween(prev.x, prev.y, dot.x, dot.y);
            }
        });
    }

    _drawCrosshair(cx, cy, weaponKey, pullRatio) {
        this.crosshair.clear();

        const SIZE = 14, GAP = 5, THICK = 2;
        let color = pullRatio < 0.4 ? 0x00ff88 : pullRatio < 0.75 ? 0xffdd00 : 0xff4444;

        this.crosshair.lineStyle(THICK, color, 0.92);
        this.crosshair.lineBetween(cx - SIZE, cy, cx - GAP, cy);
        this.crosshair.lineBetween(cx + GAP,  cy, cx + SIZE, cy);
        this.crosshair.lineBetween(cx, cy - SIZE, cx, cy - GAP);
        this.crosshair.lineBetween(cx, cy + GAP,  cx, cy + SIZE);

        const circleR = 6 + pullRatio * 8;
        this.crosshair.strokeCircle(cx, cy, circleR);
        this.crosshair.fillStyle(color, 1);
        this.crosshair.fillCircle(cx, cy, 2);
    }

    _updateInfoText(cx, cy, launch, weaponKey) {
        if (weaponKey === 'DYNAMITE') { this.infoText.setAlpha(0); return; }

        const pct = Math.round((launch.dist / AimingSystem.MAX_PULL_DISTANCE) * 100);
        const deg = Math.round(Phaser.Math.RadToDeg(launch.angle));
        this.infoText.setText(`${Math.min(pct, 100)}%  ${deg}°`);
        this.infoText.setPosition(cx, cy - 22);
        this.infoText.setAlpha(0.85);
    }
}
