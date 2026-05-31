export class RoomManager {
    constructor() {
        this.rooms = {};
    }

    createRoom(socketId, data) {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.rooms[roomId] = {
            id: roomId,
            name: data.roomName || 'Sala LAN',
            host: socketId,
            maxPlayers: data.maxPlayers || 4,
            map: data.map || 'el_alto', // santa_cruz, el_alto, luna
            timeOfDay: data.timeOfDay || 'dia', // dia, noche
            players: [{ id: socketId, name: data.playerName, team: 'Eq.Rojo', ready: false }],
            status: 'waiting'
        };
        return this.rooms[roomId];
    }

    joinRoom(roomId, socketId, playerName, team = 'Eq.Azul') {
        const room = this.rooms[roomId];
        if (room && room.status === 'waiting' && room.players.length < room.maxPlayers) {
            room.players.push({ id: socketId, name: playerName, team: team, ready: false });
            return room;
        }
        return null;
    }

    getRoom(roomId) {
        return this.rooms[roomId];
    }

    getRoomByHost(hostId) {
        return Object.values(this.rooms).find(r => r.host === hostId);
    }

    getRoomByPlayer(playerId) {
        return Object.values(this.rooms).find(r => r.players.some(p => p.id === playerId));
    }

    removePlayerFromRooms(playerId) {
        for (let roomId in this.rooms) {
            let room = this.rooms[roomId];
            room.players = room.players.filter(p => p.id !== playerId);
            if (room.players.length === 0) {
                delete this.rooms[roomId]; // Clean up empty rooms
            }
        }
    }
}
