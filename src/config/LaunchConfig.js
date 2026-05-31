import Phaser from 'phaser';
import { GAME_CONFIG } from './GameConfig';

/**
 * LaunchConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CEREBRO MATEMÁTICO COMPARTIDO entre AimingSystem y Projectile.
 *
 * Convierte (distancia ratón → velocidad inicial px/frame) de forma idéntica
 * para la simulación predictiva y para el disparo real en Matter.js.
 *
 * Modelo de potencia:
 *   dist 0   px  →  MIN_SPEED px/frame  (tiro mínimo)
 *   dist 250 px  →  MAX_SPEED px/frame  (tiro máximo)
 *   dist > 250   →  se clampa al máximo
 *
 * La dinamita no tiene velocidad propia: speed = 0, cae en vertical.
 */

// Velocidades en píxeles POR FRAME (a 60fps) ─ ajustadas por arma
const WEAPON_SPEEDS = {
    BAZOOKA:  { min: 6,  max: 22 },
    GRENADE:  { min: 4,  max: 16 },
    DYNAMITE: { min: 0,  max: 0  },
};

// La distancia máxima de "tensado" coincide con el tope visual de la retícula
const MAX_PULL_DISTANCE = 250;

/**
 * Calcula la velocidad inicial en px/frame para el eje X e Y.
 *
 * @param {number} shooterX   - X del jugador que dispara
 * @param {number} shooterY   - Y del jugador que dispara
 * @param {number} targetX    - X del cursor (worldX)
 * @param {number} targetY    - Y del cursor (worldY)
 * @param {string} weaponKey  - 'BAZOOKA' | 'GRENADE' | 'DYNAMITE'
 * @returns {{ vx: number, vy: number, speed: number, angle: number, dist: number }}
 */
export function calcLaunchVelocity(shooterX, shooterY, targetX, targetY, weaponKey) {
    const angle = Phaser.Math.Angle.Between(shooterX, shooterY, targetX, targetY);
    const dist  = Phaser.Math.Distance.Between(shooterX, shooterY, targetX, targetY);

    const cfg   = WEAPON_SPEEDS[weaponKey] || WEAPON_SPEEDS.BAZOOKA;
    const t     = Phaser.Math.Clamp(dist / MAX_PULL_DISTANCE, 0, 1);
    const speed = Phaser.Math.Linear(cfg.min, cfg.max, t);   // px/frame

    return {
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed,
        speed,
        angle,
        dist,
    };
}

/**
 * Simula la trayectoria del proyectil usando integración de Euler.
 * Devuelve array de puntos { x, y, t } para dibujar la estela predictiva.
 *
 * Esta función usa exactamente los mismos vx/vy que calcLaunchVelocity(),
 * garantizando que la línea de puntos coincida con el recorrido real.
 *
 * @param {number} ox         - X de spawn del proyectil (shooter + offset)
 * @param {number} oy         - Y de spawn del proyectil
 * @param {number} vx         - Velocidad inicial X en px/frame
 * @param {number} vy         - Velocidad inicial Y en px/frame
 * @param {number} gravity    - Factor de gravedad del mapa (ej: 1.0, 0.2)
 * @param {number} windSpeed  - Viento del TurnManager (fuerza por frame)
 * @param {string} weaponKey  - Para ajustar wind influence por peso del arma
 * @param {number} steps      - Pasos a simular (defecto: 60 ≈ 1 segundo)
 * @returns {{ x: number, y: number, t: number }[]}
 */
export function simulateTrajectory(ox, oy, vx, vy, gravity, windSpeed, weaponKey, steps = 60) {
    // Gravedad en px/frame² — Matter.js aplica gravity como px/frame² también
    // con valor por defecto 1 = ~0.5px/frame². Escalamos igual.
    const G_PER_FRAME = gravity * 0.5;

    // Influencia del viento: la bazooka (más ligera) se desvía más que la granada
    const windInfluence = {
        BAZOOKA:  1.0,
        GRENADE:  0.6,
        DYNAMITE: 0.0,
    }[weaponKey] ?? 1.0;

    const windPerFrame = windSpeed * windInfluence;

    let px = ox;
    let py = oy;
    let cvx = vx;
    let cvy = vy;

    const dots = [];

    for (let i = 0; i < steps; i++) {
        // Euler: aplicar aceleraciones
        cvx += windPerFrame;
        cvy += G_PER_FRAME;

        px += cvx;
        py += cvy;

        // Guardar punto (t normalizado 0→1)
        dots.push({ x: px, y: py, t: i / steps });

        // Detener si cae fuera del mapa
        if (py > GAME_CONFIG.MAP.DEFAULT_HEIGHT + 100) break;
    }

    return dots;
}

/**
 * Variante para el sistema de carga con Espacio.
 * Recibe el ángulo en radianes y la potencia normalizada (0-1).
 *
 * @param {number} angle      - Ángulo en radianes (desde el jugador al cursor)
 * @param {number} power      - Potencia normalizada 0→1
 * @param {string} weaponKey  - 'BAZOOKA' | 'GRENADE' | 'DYNAMITE'
 * @returns {{ vx, vy, speed, angle, dist: 0 }}
 */
export function calcLaunchVelocityFromPower(angle, power, weaponKey) {
    const cfg   = WEAPON_SPEEDS[weaponKey] || WEAPON_SPEEDS.BAZOOKA;
    const speed = Phaser.Math.Linear(cfg.min, cfg.max, Phaser.Math.Clamp(power, 0, 1));

    return {
        vx:    Math.cos(angle) * speed,
        vy:    Math.sin(angle) * speed,
        speed,
        angle,
        dist: power * MAX_PULL_DISTANCE, // dist sintética para compatibilidad con AimingSystem
    };
}
