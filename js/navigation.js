// Sistema de Navegación entre Vistas
import { GameManager } from './gameManager.js';
import { SocketManager } from './socketManager.js';

class NavigationManager {
    constructor() {
        this.currentView = 'menu';
        this.gameManager = null;
        this.socketManager = new SocketManager();
        this.init();
    }

    async init() {
        await this.loadViews();
        this.setupEventListeners();
        this.showView('menu');
    }

    async loadViews() {
        try {
            const menuView          = document.getElementById('menu-view');
            const localConfigView   = document.getElementById('local-config-view');
            const lobbyView         = document.getElementById('lobby-view');

            const [menuHTML, localConfigHTML, lobbyHTML] = await Promise.all([
                fetch('/views/menu.html').then(r => r.text()),
                fetch('/views/config.html').then(r => r.text()),
                fetch('/views/lobby.html').then(r => r.text()),
            ]);

            menuView.innerHTML        = menuHTML;
            localConfigView.innerHTML = localConfigHTML;
            lobbyView.innerHTML       = lobbyHTML;

            // Activar los selector-btn del submenú una vez inyectado el HTML
            this._setupSelectorBtns();

        } catch (error) {
            console.error('Error al cargar las vistas:', error);
        }
    }

    // ─── Selector de botones (jugadores / tiempo) ────────────────────────────
    _setupSelectorBtns() {
        document.querySelectorAll('.config-selector').forEach(group => {
            group.addEventListener('click', (e) => {
                const btn = e.target.closest('.selector-btn');
                if (!btn) return;
                group.querySelectorAll('.selector-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // ─── Leer el valor activo de un grupo selector ───────────────────────────
    _getSelectorValue(groupId, fallback) {
        const group = document.getElementById(groupId);
        if (!group) return fallback;
        const active = group.querySelector('.selector-btn.active');
        return active ? active.dataset.value : fallback;
    }

    // ─── Event listeners globales ────────────────────────────────────────────
    setupEventListeners() {
        document.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;

            switch (action) {
                // Menú principal → submenú de config local
                case 'local-game':
                    this.showView('local-config');
                    break;

                // Submenú config → volver al menú principal
                case 'back-to-menu':
                    this.showView('menu');
                    break;

                // Submenú config → iniciar partida local
                case 'start-local-game':
                    this.startLocalGame();
                    break;

                // Menú principal → lobby
                case 'create-lobby':
                    this.showView('lobby');
                    this.setupLobby(true);
                    break;
                case 'join-lobby':
                    this.showView('lobby');
                    this.setupLobby(false);
                    break;
            }
        });

        // Botones del lobby (usan id, no data-action)
        document.addEventListener('click', (e) => {
            if (e.target.id === 'btn-back-lobby') {
                this.showView('menu');
                if (this.gameManager) this.gameManager.destroy();
            }
            if (e.target.id === 'btn-start-game') {
                this.startGameFromLobby();
            }
        });

        // Retorno al menú desde GameOverScene
        window.addEventListener('gameReturnToMenu', () => {
            this.gameManager = null;
            this.showView('menu');
        });
    }

    setupLobby(isHost) {
        const lobbyCode = document.getElementById('lobby-code');
        if (isHost) {
            const code = this.generateLobbyCode();
            lobbyCode.textContent = code;
            this.socketManager.createRoom(code);
        } else {
            lobbyCode.textContent = 'Ingresa el código...';
        }
    }

    generateLobbyCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // ─── Iniciar partida con los datos del submenú ───────────────────────────
    startLocalGame() {
        const map         = document.getElementById('local-map-select')?.value   || 'el_alto';
        const players     = parseInt(this._getSelectorValue('players-selector', '2'));
        const timeLimit   = parseInt(this._getSelectorValue('time-selector',    '120'));

        this.showView('game');

        this.gameManager = new GameManager('game-container', {
            isLocal:       true,
            isMultiplayer: false,
            map,
            players,
            timeLimit,
        });
    }

    startGameFromLobby() {
        this.showView('game');
        const settings = {
            difficulty:  document.getElementById('difficulty-select')?.value,
            gamemode:    document.getElementById('gamemode-select')?.value,
            maxPlayers:  document.getElementById('max-players-select')?.value,
            timeLimit:   document.getElementById('time-limit-select')?.value,
            map:         document.getElementById('map-select')?.value,
        };

        this.gameManager = new GameManager('game-container', {
            isLocal:       false,
            isMultiplayer: true,
            map:           settings.map,
            settings,
        });
    }

    // ─── Mostrar / ocultar vistas ────────────────────────────────────────────
    showView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

        const viewMap = {
            'menu':         'menu-view',
            'local-config': 'local-config-view',
            'lobby':        'lobby-view',
            'game':         'game-container',
        };

        const el = document.getElementById(viewMap[viewName]);
        if (el) el.classList.add('active');
        this.currentView = viewName;
    }
}

// Inicializar cuando carga la página
window.addEventListener('DOMContentLoaded', () => {
    new NavigationManager();
});