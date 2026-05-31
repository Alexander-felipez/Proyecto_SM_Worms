/**
 * GameConfig.js
 * Configuración central del juego Bolivia Tactics 2D.
 * Todas las constantes de balance, físicas y gameplay viven aquí.
 */

export const GAME_CONFIG = {
    // --- JUGADOR ---
    PLAYER: {
        MAX_HP: 100,
        MOVE_SPEED: 3,
        JUMP_FORCE: -8,
        FALL_DEATH_Y: 1320,      // Y donde el jugador "cae al agua" y muere
        HP_BAR_WIDTH: 40,
        HP_BAR_HEIGHT: 5,
        HP_BAR_OFFSET_Y: -40,    // Offset encima del sprite
    },

    // --- TURNOS ---
    TURN: {
        DURATION: 120000,          // 2 minutos por turno
        PAUSE_BETWEEN: 2500,      // Pausa cinemática entre turnos (ms)
        CAMERA_PAN_DURATION: 800, // Duración del pan de cámara al siguiente jugador
    },

    // --- ARMAS ---
    WEAPONS: {
        BAZOOKA: {
            name: 'Bazooka',
            damage: 35,
            radius: 60,
            speed: 0.05,
            ammo: Infinity,
            color: 0xffff00,
            projectileSize: 8,
        },
        GRENADE: {
            name: 'Granada',
            damage: 50,
            radius: 80,
            speed: 0.035,
            ammo: 3,
            color: 0x33cc33,
            projectileSize: 7,
            fuse: 3000,
        },
        DYNAMITE: {
            name: 'Dinamita',
            damage: 80,
            radius: 100,
            speed: 0.005,
            ammo: 1,
            color: 0xff3333,
            projectileSize: 9,
            fuse: 4000,
        },
    },

    // --- VIENTO ---
    WIND: {
        MIN: -0.0002,
        MAX: 0.0002,
        ENABLED: true,
    },

    // --- RED / SYNC ---
    NETWORK: {
        SYNC_RATE: 3,             // Cada cuántos frames de update() se envía sync
        LERP_FACTOR: 0.3,        // Suavizado de interpolación en clientes
    },

    // --- BIOMAS ---
    BIOMES: {
        SANTA_CRUZ: {
            name: 'Santa Cruz Tropical',
            bgColorDay: '#4CAF50',
            bgColorNight: '#1a3c28',
            gravity: 1,
            terrainColor: 0xddbb77,
        },
        EL_ALTO: {
            name: 'La Paz - El Alto',
            bgColorDay: '#87CEEB',
            bgColorNight: '#1c2b39',
            gravity: 1,
            terrainColor: 0x8B7355,
        },
        LUNA: {
            name: 'Luna / Espacio',
            bgColorDay: '#050510',
            bgColorNight: '#050510',
            gravity: 0.2,
            terrainColor: 0x888888,
        },
        SALAR: {
            name: 'Salar de Uyuni',
            bgColorDay: '#E8E8FF',
            bgColorNight: '#1a1a3e',
            gravity: 1,
            terrainColor: 0xF0F0FF,
        },
    },

    // --- EXPLOSIÓN ---
    EXPLOSION: {
        SHOCKWAVE_RADIUS: 150,    // Radio de la onda expansiva física
        SHOCKWAVE_FORCE: 0.001,   // Fuerza base de la onda expansiva
        CAMERA_SHAKE_DURATION: 300,
        CAMERA_SHAKE_INTENSITY: 0.015,
        FLASH_DURATION: 250,
    },

    // --- MAPA ---
    MAP: {
        DEFAULT_WIDTH: 3200,
        DEFAULT_HEIGHT: 1400,
    },

    // --- EQUIPOS ---
    TEAMS: {
        RED: { name: 'Eq. Rojo', color: 0xff4444, tint: 0xff6666 },
        BLUE: { name: 'Eq. Azul', color: 0x4444ff, tint: 0x6666ff },
        GREEN: { name: 'Eq. Verde', color: 0x44ff44, tint: 0x66ff66 },
    },
};
