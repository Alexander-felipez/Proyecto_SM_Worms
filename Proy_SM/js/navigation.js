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
            const menuView = document.getElementById('menu-view');
            const lobbyView = document.getElementById('lobby-view');
            const gameView = document.getElementById('game-container');

            const [menuHTML, lobbyHTML] = await Promise.all([
                fetch('/views/menu.html').then(r => r.text()),
                fetch('/views/lobby.html').then(r => r.text())
            ]);

            menuView.innerHTML = menuHTML;
            lobbyView.innerHTML = lobbyHTML;
        } catch (error) {
            console.error('Error al cargar las vistas:', error);
        }
    }

    setupEventListeners() {
        // Event listeners del menú
        document.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            
            if (action === 'local-game') {
                this.startLocalGame();
            } else if (action === 'create-lobby') {
                this.showView('lobby');
                this.setupLobby(true);
            } else if (action === 'join-lobby') {
                this.showView('lobby');
                this.setupLobby(false);
            }
        });

        // Event listeners del lobby
        document.addEventListener('click', (e) => {
            if (e.target.id === 'btn-back-lobby') {
                this.showView('menu');
                if (this.gameManager) this.gameManager.destroy();
            }
            if (e.target.id === 'btn-start-game') {
                this.startGameFromLobby();
            }
        });

        // Evento de retorno al menú desde el juego (GameOverScene)
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

    startLocalGame() {
        this.showView('game');
        this.gameManager = new GameManager('game-container', {
            isLocal: true,
            isMultiplayer: false,
            settings: {
                mapType: 'el_alto',
                timeOfDay: 'dia'
            }
        });
    }

    startGameFromLobby() {
        this.showView('game');
        const settings = {
            difficulty: document.getElementById('difficulty-select').value,
            gamemode: document.getElementById('gamemode-select').value,
            maxPlayers: document.getElementById('max-players-select').value,
            timeLimit: document.getElementById('time-limit-select').value,
            mapType: document.getElementById('map-select').value,
            timeOfDay: document.getElementById('time-of-day-select').value
        };
        
        this.gameManager = new GameManager('game-container', {
            isLocal: false,
            isMultiplayer: true,
            settings
        });
    }

    showView(viewName) {
        // Ocultar todas las vistas
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Mostrar la vista solicitada
        const viewMap = {
            'menu': 'menu-view',
            'lobby': 'lobby-view',
            'game': 'game-container'
        };

        const viewElement = document.getElementById(viewMap[viewName]);
        if (viewElement) {
            viewElement.classList.add('active');
        }

        this.currentView = viewName;
    }
}

// Inicializar la navegación cuando se carga la página
window.addEventListener('DOMContentLoaded', () => {
    new NavigationManager();
});
