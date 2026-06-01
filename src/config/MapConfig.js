/**
 * MapConfig.js
 * Registro modular de mapas programáticos para Bolivia Tactics 2D.
 * Cada mapa define su terreno, decoraciones, colores y física de forma paramétrica.
 *
 * NOTA: getHeight recibe:
 *   - normalizedX: valor 0-1 normalizado dentro del rango de la isla
 *   - rawX: coordenada X absoluta en píxeles (para ruido/cráteres posicionales)
 *   - waterLevel: coordenada Y del nivel del agua
 */

export const MAP_CONFIGS = {
    EL_ALTO: {
        name: 'El Alto',
        biome: 'EL_ALTO',
        terrainColor: 0x8B7355,       // Tierra arcillosa/marrón
        crustColor: 0xd2b48c,         // Tierra clara en el borde superior
        skyColor: '#87CEEB',          // Celeste despejado
        hasWater: true,
        waterColor: 0x0066aa,
        gravity: 1.5,        // Alta altitud: gravedad mayor, disparos más cortos

        /**
         * Relieve empinado estilo cañón andino.
         * @param {number} normalizedX - Posición 0-1 dentro de la isla
         * @param {number} rawX - Coordenada X absoluta en píxeles
         * @param {number} waterLevel - Nivel Y del agua
         */
        getHeight: (normalizedX, rawX, waterLevel) => {
            // Arco principal: sube desde los bordes (0) al centro (1) y vuelve a bajar
            const arch = Math.sin(normalizedX * Math.PI) * 150;
            // Ruido de detalle para terreno accidentado
            const detail = Math.sin(rawX * 0.03) * 20 + Math.sin(rawX * 0.01) * 30;
            return waterLevel - arch + detail;
        },

        decorations: [
            { type: 'teleferico_tower', x: 400, height: 180 },
            { type: 'teleferico_tower', x: 1600, height: 180 },
            { type: 'cholet', x: 1000 },
        ]
    },

    SANTA_CRUZ: {
        name: 'Santa Cruz',
        biome: 'SANTA_CRUZ',
        terrainColor: 0x7a4a1e,       // Tierra arcillosa cruceña
        crustColor: 0x3a8f2a,         // Pasto verde tropical
        skyColor: '#1a0a00',          // Atardecer oscuro (gestionado por paralaje)
        hasWater: true,
        waterColor: 0x005f99,
        gravity: 2.0,        // Tierras bajas tropicales: gravedad máxima, disparos muy pesados

        /**
         * Terreno en forma de cañón: acantilados altos en los flancos (X≈0.18 y X≈0.82)
         * y una meseta central baja (X≈0.35–0.65). Crea un escenario táctico con
         * profundidad vertical de ~640 px en los acantilados y ~260 px en el valle.
         *
         * @param {number} normalizedX - Posición 0-1 dentro de la isla
         * @param {number} rawX       - Coordenada X absoluta en píxeles
         * @param {number} waterLevel - Nivel Y del agua
         */
        getHeight: (normalizedX, rawX, waterLevel) => {
            // ── Picos de acantilado en los flancos ──
            const leftPeak  = Math.max(0, 1 - Math.abs(normalizedX - 0.20) / 0.22);
            const rightPeak = Math.max(0, 1 - Math.abs(normalizedX - 0.80) / 0.22);
            const cliffHeight = Math.pow(Math.max(leftPeak, rightPeak), 1.6) * 640;

            // ── Meseta central baja y plana ──
            const centralFlat = (normalizedX > 0.38 && normalizedX < 0.62)
                ? 1
                : Math.max(0, 1 - Math.abs(normalizedX - (normalizedX < 0.5 ? 0.38 : 0.62)) / 0.12);
            const valleyHeight = centralFlat * 260;

            // ── Bordes de la isla (extremos caen al agua) ──
            const edgeDrop = Math.pow(Math.sin(normalizedX * Math.PI), 0.3) * 80;

            // ── Ruido orgánico fino ──
            const noise = Math.sin(rawX * 0.045) * 9 + Math.sin(rawX * 0.013) * 16;

            const totalHeight = Math.max(cliffHeight, valleyHeight) + edgeDrop;
            return waterLevel - totalHeight + noise;
        },

        /**
         * Decoraciones temáticas de Santa Cruz de la Sierra.
         * Los tipos nuevos son dibujados por métodos específicos en TerrainManager.
         */
        decorations: [
            // ── Acantilado Izquierdo ──
            { type: 'welcome_sign', x: 380 },
            { type: 'palm',         x: 260,  size: 90 },
            { type: 'palm',         x: 560,  size: 75 },
            { type: 'crane',        x: 680 },

            // ── Plataforma Central ──
            { type: 'el_aljibe_hut', x: 1600 },
            { type: 'palm',          x: 1450, size: 60 },
            { type: 'palm',          x: 1780, size: 65 },

            // ── Acantilado Derecho ──
            { type: 'radio_tower',   x: 2680 },
            { type: 'flag_bolivia',  x: 2870 },
            { type: 'palm',          x: 2500, size: 80 },
            { type: 'palm',          x: 2950, size: 70 },

            // ── Botes en el agua ──
            { type: 'boat', x: 1100 },
            { type: 'boat', x: 2100 },
        ],

        /**
         * Puentes de madera colgantes que conectan los acantilados con la meseta central.
         * Cada puente define los dos puntos de anclaje (x1,y1) y (x2,y2) y el ancho de tablón.
         */
        bridges: [
            { x1: 760,  y1: 1045, x2: 1330, y2: 1048, planks: 18 }, // Puente izquierdo
            { x1: 1870, y1: 1048, x2: 2380, y2: 1042, planks: 17 }, // Puente derecho
        ],

        /**
         * Cueva de los Tayos — elipse hueca transitable en el centro de la meseta.
         * cx/cy: centro de la elipse   rx/ry: semiejes horizontal/vertical
         */
        cave: { cx: 1600, cy: 1155, rx: 145, ry: 95 },
    },

    LUNA: {
        name: 'Luna',
        biome: 'LUNA',
        terrainColor: 0x555555,       // Gris oscuro
        crustColor: 0xaaaaaa,         // Regolito lunar gris claro
        skyColor: '#050510',          // Espacio negro
        hasWater: false,              // No hay agua en la Luna
        waterColor: 0x000000,
        gravity: 0.2,                 // Gravedad baja

        /**
         * Paisaje lunar con cráteres procedimentales.
         */
        getHeight: (normalizedX, rawX, waterLevel) => {
            // Arco base suave
            const arch = Math.sin(normalizedX * Math.PI) * 100;
            const noise = Math.sin(rawX * 0.02) * 15 + Math.sin(rawX * 0.05) * 8;

            let height = waterLevel - arch + noise;

            // Cráteres procedimentales — hundir el terreno localmente
            const craters = [
                { cx: 500, r: 80, depth: 40 },
                { cx: 1500, r: 100, depth: 55 }
            ];
            craters.forEach(c => {
                const dist = Math.abs(rawX - c.cx);
                if (dist < c.r) {
                    // Coseno suave: 1 en centro, 0 en borde
                    const factor = Math.cos((dist / c.r) * (Math.PI / 2));
                    height += factor * c.depth; // Suma Y = baja la tierra (cráter)
                }
            });

            return height;
        },

        decorations: [
            { type: 'lunar_dome', x: 1000 },
            { type: 'radar', x: 1200 },
            { type: 'lunar_rover', x: 350 }
        ]
    }
};

/**
 * Obtiene la configuración de un mapa por clave (case-insensitive).
 * Fallback a EL_ALTO si no se encuentra.
 */
export function getMapConfig(mapKey) {
    if (!mapKey) return MAP_CONFIGS.EL_ALTO;
    const key = mapKey.toUpperCase().replace(/[\s-]/g, '_');
    return MAP_CONFIGS[key] || MAP_CONFIGS.EL_ALTO;
}