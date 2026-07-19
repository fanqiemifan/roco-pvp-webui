(function () {
    'use strict';

    const MAX_SLOTS = 6;
    const DEFAULT_BEST_OF = 7;

    const state = {
        panels: {
            left: null,
            right: null
        },
        scoreboard: null,
        matches: null,
        sprites: new Map(),
        historyScrollTimer: null,
        recentGamesScrollTimer: null
    };

    function clamp(value, min, max, fallback) {
        if (value === null || value === undefined || value === '') {
            return fallback;
        }
        const number = Number(value);
        if (Number.isNaN(number)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, number));
    }

    function normalizeBestOf(value) {
        const number = Number(value);
        return [1, 3, 5, 7].includes(number) ? number : DEFAULT_BEST_OF;
    }

    function getDisplayName(sprite) {
        if (!sprite || typeof sprite !== 'object') {
            return '';
        }
        return String(
            sprite.displayName
            || sprite.chineseName
            || sprite.name
            || sprite.filename
            || ''
        ).trim().replace(/[-_－—]\d+$/, '');
    }

    function basename(value) {
        return String(value || '').split('/').filter(Boolean).pop() || '';
    }

    function buildSpriteLookup(records) {
        const lookup = new Map();

        (Array.isArray(records) ? records : []).forEach(sprite => {
            if (!sprite || typeof sprite !== 'object') {
                return;
            }

            const keys = new Set([
                sprite.id,
                sprite.filename,
                sprite.displayName,
                sprite.name,
                sprite.chineseName,
                basename(sprite.id),
                basename(sprite.filename),
                basename(sprite.path),
                ...(Array.isArray(sprite.aliases) ? sprite.aliases : [])
            ]);

            keys.forEach(key => {
                if (typeof key === 'string' && key.trim()) {
                    lookup.set(key.trim(), sprite);
                }
            });
        });

        return lookup;
    }

    function getActiveMatch(store) {
        if (!store || !Array.isArray(store.matches) || store.matches.length === 0) {
            return null;
        }

        if (store.activeMatchId) {
            const activeMatch = store.matches.find(match => match && match.id === store.activeMatchId);
            if (activeMatch) {
                return activeMatch;
            }
        }

        return store.matches.find(match => match && (match.status === 'pending' || match.status === 'in_progress')) || null;
    }

    function getCurrentGame(match) {
        if (!match || !Array.isArray(match.games) || match.games.length === 0) {
            return null;
        }

        return (
            match.games.find(game => game && game.status === 'in_progress')
            || match.games.find(game => game && game.status === 'pending')
            || match.games[match.games.length - 1]
            || null
        );
    }

    function resolveSlotSprite(slotData) {
        if (!slotData) {
            return null;
        }

        if (slotData.sprite && slotData.sprite.path) {
            return slotData.sprite;
        }

        const spriteId = typeof slotData.spriteId === 'string' ? slotData.spriteId : '';
        if (!spriteId) {
            return null;
        }

        return state.sprites.get(spriteId) || state.sprites.get(basename(spriteId)) || null;
    }

    function buildSlotsFromSnapshots(snapshots) {
        const slots = Array.from({ length: MAX_SLOTS }, (_, index) => {
            const slotData = Array.isArray(snapshots) ? snapshots[index] : null;
            return {
                sprite: resolveSlotSprite(slotData)
            };
        });

        return slots;
    }

    function getStatusMeta(match, currentGame) {
        if (!match || !currentGame) {
            return {
                chip: 'MATCH READY',
                text: '等待选择对局',
                badge: '等待主舞台选择'
            };
        }

        if (currentGame.status === 'in_progress') {
            return {
                chip: 'MATCH LIVE',
                text: '当前对局进行中',
                badge: '主舞台进行中'
            };
        }

        if (match.status === 'completed' || currentGame.status === 'completed') {
            return {
                chip: 'MATCH DONE',
                text: '当前系列赛已结束',
                badge: '主舞台已结束'
            };
        }

        return {
            chip: 'MATCH PENDING',
            text: '等待开始本次对局',
            badge: '主舞台等待页'
        };
    }

    function formatMatchMeta(match, currentGame) {
        if (!match) {
            return '等待后台选择系列赛';
        }

        const bestOf = normalizeBestOf(match.bestOf);
        const gameNumber = currentGame && Number.isFinite(Number(currentGame.gameNumber))
            ? Number(currentGame.gameNumber)
            : 1;
        const statusText = currentGame && currentGame.status === 'in_progress'
            ? '进行中'
            : match.status === 'completed'
                ? '已结束'
                : '待开始';

        return `BO${bestOf} · 第 ${gameNumber} 局${statusText}`;
    }

    function formatDateTime(value) {
        if (!value) {
            return '';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return new Intl.DateTimeFormat('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date);
    }

    function getCompletedMatches(store) {
        if (!store || !Array.isArray(store.matches)) {
            return [];
        }

        return store.matches
            .filter(match => match && match.status === 'completed')
            .sort((left, right) => {
                const leftTime = new Date(left.completedAt || left.updatedAt || left.createdAt || 0).getTime();
                const rightTime = new Date(right.completedAt || right.updatedAt || right.createdAt || 0).getTime();
                return rightTime - leftTime;
            });
    }

    function getCompletedGames(match) {
        if (!match || !Array.isArray(match.games)) {
            return [];
        }

        return match.games.filter(game => game && game.winner && game.status === 'completed');
    }

    function getLastLineupGame(match) {
        if (!match || !Array.isArray(match.games)) {
            return null;
        }

        for (let index = match.games.length - 1; index >= 0; index -= 1) {
            const game = match.games[index];
            if (!game) {
                continue;
            }

            const hasLeft = Array.isArray(game.leftSlots) && game.leftSlots.some(slot => slot && slot.spriteId);
            const hasRight = Array.isArray(game.rightSlots) && game.rightSlots.some(slot => slot && slot.spriteId);
            if (hasLeft || hasRight) {
                return game;
            }
        }

        return null;
    }

    function createMiniRoster(slots) {
        const roster = document.createElement('div');
        roster.className = 'mini-roster';

        Array.from({ length: MAX_SLOTS }, (_, index) => slots[index] || { sprite: null }).forEach(slotData => {
            const slotEl = document.createElement('div');
            const sprite = slotData && slotData.sprite ? slotData.sprite : null;

            slotEl.className = `mini-roster-slot${sprite && sprite.path ? '' : ' mini-roster-slot-empty'}`;
            if (sprite && sprite.path) {
                const image = document.createElement('img');
                image.src = sprite.path;
                image.alt = getDisplayName(sprite);
                slotEl.appendChild(image);
            }

            roster.appendChild(slotEl);
        });

        return roster;
    }

    function renderGameTrack(match, currentGame) {
        const track = document.getElementById('gameTrack');
        track.innerHTML = '';

        if (!match) {
            const chip = document.createElement('span');
            chip.className = 'game-chip game-chip-active';
            chip.textContent = '等待创建系列赛';
            track.appendChild(chip);
            return;
        }

        const bestOf = normalizeBestOf(match.bestOf);
        for (let index = 0; index < bestOf; index += 1) {
            const gameNumber = index + 1;
            const game = Array.isArray(match.games) ? match.games[index] : null;
            const chip = document.createElement('span');
            chip.className = 'game-chip';

            if (game && game.winner === 'left') {
                chip.classList.add('game-chip-done');
                chip.textContent = `G${gameNumber} 左胜`;
            } else if (game && game.winner === 'right') {
                chip.classList.add('game-chip-done');
                chip.textContent = `G${gameNumber} 右胜`;
            } else if (currentGame && Number(currentGame.gameNumber) === gameNumber && currentGame.status === 'in_progress') {
                chip.classList.add('game-chip-active');
                chip.textContent = `G${gameNumber} 进行中`;
            } else if (currentGame && Number(currentGame.gameNumber) === gameNumber && currentGame.status === 'pending') {
                chip.classList.add('game-chip-active');
                chip.textContent = `G${gameNumber} 待开始`;
            } else {
                chip.textContent = `G${gameNumber}`;
            }

            track.appendChild(chip);
        }
    }

    function createSeriesGameCard(gameNumber, game, currentGame, match) {
        const card = document.createElement('article');
        const gameStatus = game?.status || (currentGame && Number(currentGame.gameNumber) === gameNumber ? currentGame.status : 'pending');
        const winner = game?.winner || '';
        const isCurrent = currentGame && Number(currentGame.gameNumber) === gameNumber;

        card.className = `series-game-card${isCurrent ? ' series-game-card-current' : ''}${winner ? ` series-game-card-${winner}` : ''}`;

        const top = document.createElement('div');
        top.className = 'series-game-top';

        const index = document.createElement('div');
        index.className = 'series-game-index';
        index.textContent = `G${gameNumber}`;

        const status = document.createElement('div');
        status.className = 'series-game-status';

        if (winner === 'left') {
            status.classList.add('is-left');
            status.textContent = '左侧胜';
        } else if (winner === 'right') {
            status.classList.add('is-right');
            status.textContent = '右侧胜';
        } else if (gameStatus === 'in_progress') {
            status.classList.add('is-live');
            status.textContent = '进行中';
        } else {
            status.classList.add('is-pending');
            status.textContent = '待开始';
        }

        top.append(index, status);

        const body = document.createElement('div');
        body.className = 'series-game-body';

        const left = document.createElement('strong');
        left.className = `series-game-player${winner === 'left' ? ' is-win' : winner === 'right' ? ' is-lose' : ''}`;
        left.textContent = match?.leftPlayer || '左侧选手';

        const center = document.createElement('span');
        center.className = 'series-game-center';
        center.textContent = winner
            ? winner === 'left'
                ? '击败右侧'
                : '击败左侧'
            : gameStatus === 'in_progress'
                ? '正在交战'
                : '等待开局';

        const right = document.createElement('strong');
        right.className = `series-game-player series-game-player-right${winner === 'right' ? ' is-win' : winner === 'left' ? ' is-lose' : ''}`;
        right.textContent = match?.rightPlayer || '右侧选手';

        body.append(left, center, right);
        card.append(top, body);
        return card;
    }

    function renderSeriesGames(activeMatch, currentGame) {
        const list = document.getElementById('seriesGamesList');
        list.innerHTML = '';

        if (!activeMatch) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '当前还没有活动中的系列赛。';
            list.appendChild(empty);
            return;
        }

        const bestOf = normalizeBestOf(activeMatch.bestOf);
        for (let index = 0; index < bestOf; index += 1) {
            const gameNumber = index + 1;
            const game = Array.isArray(activeMatch.games) ? activeMatch.games[index] : null;
            list.appendChild(createSeriesGameCard(gameNumber, game, currentGame, activeMatch));
        }
    }

    function createRecentGameCard(game, match) {
        const card = document.createElement('article');
        card.className = 'recent-game-card';

        const top = document.createElement('div');
        top.className = 'recent-game-top';

        const index = document.createElement('div');
        index.className = 'recent-game-index';
        index.textContent = `G${Number(game.gameNumber) || 1}`;

        const winner = document.createElement('div');
        winner.className = 'recent-game-winner';
        winner.textContent = game.winner === 'left'
            ? `${match.leftPlayer || '左侧'} 胜`
            : `${match.rightPlayer || '右侧'} 胜`;

        top.append(index, winner);

        const body = document.createElement('div');
        body.className = 'recent-game-body';

        const leftSlots = buildSlotsFromSnapshots(game.leftSlots);
        const rightSlots = buildSlotsFromSnapshots(game.rightSlots);

        [
            {
                key: 'left',
                name: match.leftPlayer || '左侧',
                result: game.winner === 'left' ? '本局胜' : '本局负',
                slots: leftSlots
            },
            {
                key: 'right',
                name: match.rightPlayer || '右侧',
                result: game.winner === 'right' ? '本局胜' : '本局负',
                slots: rightSlots
            }
        ].forEach(side => {
            const sideEl = document.createElement('section');
            sideEl.className = `recent-side${game.winner === side.key ? ' is-win' : ''}`;

            const sideTop = document.createElement('div');
            sideTop.className = 'recent-side-top';

            const name = document.createElement('strong');
            name.textContent = side.name;

            const result = document.createElement('span');
            result.className = 'recent-side-result';
            result.textContent = side.result;

            sideTop.append(name, result);
            sideEl.append(sideTop, createMiniRoster(side.slots));
            body.appendChild(sideEl);
        });

        card.append(top, body);
        return card;
    }

    function renderRecentGames(activeMatch) {
        const list = document.getElementById('recentGamesList');
        list.innerHTML = '';

        const games = getCompletedGames(activeMatch);
        if (games.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '当前系列赛还没有已结束的小局。';
            list.appendChild(empty);
            clearRecentGamesAutoScroll();
            return;
        }

        games.forEach(game => {
            list.appendChild(createRecentGameCard(game, activeMatch));
        });

        setupRecentGamesAutoScroll();
    }

    function clearRecentGamesAutoScroll() {
        if (state.recentGamesScrollTimer) {
            window.clearInterval(state.recentGamesScrollTimer);
            state.recentGamesScrollTimer = null;
        }

        const list = document.getElementById('recentGamesList');
        if (list) {
            list.style.transform = 'translateY(0)';
        }
    }

    function setupRecentGamesAutoScroll() {
        const viewport = document.getElementById('recentGamesViewport');
        const list = document.getElementById('recentGamesList');

        clearRecentGamesAutoScroll();

        if (!viewport || !list) {
            return;
        }

        const cards = Array.from(list.querySelectorAll('.recent-game-card'));
        if (cards.length <= 2) {
            viewport.style.height = '';
            return;
        }

        const gap = 12;
        const visibleCount = 2;
        const windowHeights = [];

        for (let index = 0; index <= cards.length - visibleCount; index += 1) {
            const windowCards = cards.slice(index, index + visibleCount);
            windowHeights.push(
                windowCards.reduce((sum, card) => sum + card.offsetHeight, 0) + gap * (windowCards.length - 1)
            );
        }

        const offsets = [0];
        for (let index = 1; index < cards.length - visibleCount + 1; index += 1) {
            offsets.push(offsets[index - 1] + cards[index - 1].offsetHeight + gap);
        }

        let currentIndex = 0;
        viewport.style.height = `${Math.max(...windowHeights)}px`;

        state.recentGamesScrollTimer = window.setInterval(() => {
            currentIndex = (currentIndex + 1) % offsets.length;
            list.style.transform = `translateY(-${offsets[currentIndex]}px)`;
        }, 3800);
    }

    function clearHistoryAutoScroll() {
        if (state.historyScrollTimer) {
            window.clearInterval(state.historyScrollTimer);
            state.historyScrollTimer = null;
        }

        const list = document.getElementById('historyList');
        if (list) {
            list.style.transform = 'translateY(0)';
        }
    }

    function setupHistoryAutoScroll() {
        const viewport = document.getElementById('historyListViewport');
        const list = document.getElementById('historyList');

        clearHistoryAutoScroll();

        if (!viewport || !list) {
            return;
        }

        const cards = Array.from(list.querySelectorAll('.history-card'));
        if (cards.length <= 3) {
            viewport.style.height = '';
            return;
        }

        const gap = 14;
        const pageSize = 3;
        const pageOffsets = [0];
        const pageHeights = [];

        for (let start = 0; start < cards.length; start += pageSize) {
            const pageCards = cards.slice(start, start + pageSize);
            const pageHeight = pageCards.reduce((sum, card) => sum + card.offsetHeight, 0) + gap * (pageCards.length - 1);
            pageHeights.push(pageHeight);

            if (start > 0) {
                const previousCards = cards.slice(start - pageSize, start);
                const previousOffset = pageOffsets[pageOffsets.length - 1];
                const previousHeight = previousCards.reduce((sum, card) => sum + card.offsetHeight, 0) + gap * previousCards.length;
                pageOffsets.push(previousOffset + previousHeight);
            }
        }

        let currentPage = 0;

        viewport.style.height = `${Math.max(...pageHeights)}px`;
        state.historyScrollTimer = window.setInterval(() => {
            currentPage = (currentPage + 1) % pageOffsets.length;
            list.style.transform = `translateY(-${pageOffsets[currentPage]}px)`;
        }, 4200);
    }

    function renderStage() {
        const activeMatch = getActiveMatch(state.matches);
        const currentGame = getCurrentGame(activeMatch);
        const scoreboard = state.scoreboard || {};
        const statusMeta = getStatusMeta(activeMatch, currentGame);

        document.getElementById('leftPlayerName').textContent = activeMatch?.leftPlayer || scoreboard.leftName || '左侧选手';
        document.getElementById('rightPlayerName').textContent = activeMatch?.rightPlayer || scoreboard.rightName || '右侧选手';
        document.getElementById('leftPlayerScore').textContent = String(activeMatch?.leftScore ?? scoreboard.leftScore ?? '0');
        document.getElementById('rightPlayerScore').textContent = String(activeMatch?.rightScore ?? scoreboard.rightScore ?? '0');
        document.getElementById('versusMeta').textContent = formatMatchMeta(activeMatch, currentGame);
        document.getElementById('statusChip').textContent = statusMeta.chip;
        document.getElementById('statusText').textContent = statusMeta.text;

        renderGameTrack(activeMatch, currentGame);
        renderSeriesGames(activeMatch, currentGame);
        renderRecentGames(activeMatch);
    }

    function createHistoryCard(match, isFirst) {
        const card = document.createElement('article');
        card.className = `history-card${isFirst ? ' history-card-emphasis' : ''}`;

        const top = document.createElement('div');
        top.className = 'history-top';

        const time = document.createElement('span');
        time.textContent = formatDateTime(match.completedAt || match.updatedAt || match.createdAt) || '已完赛';

        const mode = document.createElement('span');
        mode.textContent = `BO${normalizeBestOf(match.bestOf)}`;
        top.append(time, mode);

        const scoreline = document.createElement('div');
        scoreline.className = 'history-scoreline';

        const leftName = document.createElement('strong');
        leftName.textContent = match.leftPlayer || '左侧';

        const score = document.createElement('div');
        score.className = 'history-score';
        score.textContent = `${match.leftScore ?? 0} : ${match.rightScore ?? 0}`;

        const rightName = document.createElement('strong');
        rightName.textContent = match.rightPlayer || '右侧';

        scoreline.append(leftName, score, rightName);

        const lastLineup = document.createElement('div');
        lastLineup.className = 'history-last-lineup';

        const game = getLastLineupGame(match);
        const lineupSides = document.createElement('div');
        lineupSides.className = 'history-lineup-sides';

        [
            {
                name: match.leftPlayer || '左侧',
                slots: buildSlotsFromSnapshots(game ? game.leftSlots : [])
            },
            {
                name: match.rightPlayer || '右侧',
                slots: buildSlotsFromSnapshots(game ? game.rightSlots : [])
            }
        ].forEach(side => {
            const sideEl = document.createElement('section');
            sideEl.className = 'history-lineup-side';

            const selectedSlots = side.slots.filter(slotData => slotData && slotData.sprite && slotData.sprite.path);
            if (selectedSlots.length === 0) {
                sideEl.textContent = `${side.name} 暂无精灵`;
            } else {
                selectedSlots.forEach(slotData => {
                    const image = document.createElement('img');
                    image.src = slotData.sprite.path;
                    image.alt = getDisplayName(slotData.sprite);
                    sideEl.appendChild(image);
                });
            }

            lineupSides.appendChild(sideEl);
        });

        lastLineup.appendChild(lineupSides);
        card.append(top, scoreline, lastLineup);
        return card;
    }

    function renderHistory() {
        const historyList = document.getElementById('historyList');
        const completedMatches = getCompletedMatches(state.matches);

        historyList.innerHTML = '';

        if (completedMatches.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '当前还没有可展示的历史对局结果。';
            historyList.appendChild(empty);
            clearHistoryAutoScroll();
            return;
        }

        completedMatches.forEach((match, index) => {
            historyList.appendChild(createHistoryCard(match, index === 0));
        });

        setupHistoryAutoScroll();
    }

    function renderAll() {
        renderStage();
        renderHistory();
    }

    function applySnapshot(payload) {
        const panels = payload && Array.isArray(payload.panels) ? payload.panels : [];
        state.panels.left = panels.find(panel => panel && panel.position === 'left') || null;
        state.panels.right = panels.find(panel => panel && panel.position === 'right') || null;
        state.scoreboard = payload ? payload.scoreboard || null : null;
        state.matches = payload ? payload.matches || null : null;
        renderAll();
    }

    async function loadInitialState() {
        const [imagesResponse, scoreboardResponse, matchesResponse, spritesResponse] = await Promise.all([
            fetch('/api/images'),
            fetch('/api/scoreboard'),
            fetch('/api/matches'),
            fetch('/api/sprites')
        ]);

        const [imagesData, scoreboardData, matchesData, spritesData] = await Promise.all([
            imagesResponse.json(),
            scoreboardResponse.json(),
            matchesResponse.json(),
            spritesResponse.json()
        ]);

        state.sprites = buildSpriteLookup(spritesData.sprites || []);
        applySnapshot({
            panels: imagesData.images || [],
            scoreboard: scoreboardData,
            matches: matchesData
        });
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            console.error('Socket.IO 客户端未加载');
            return;
        }

        const socket = io({
            transports: ['websocket', 'polling']
        });

        socket.on('snapshot', payload => {
            applySnapshot(payload || {});
        });

        socket.on('panel:update', payload => {
            if (payload && payload.panel && payload.panel.position) {
                state.panels[payload.panel.position] = payload.panel;
                renderStage();
            }
        });

        socket.on('scoreboard:update', payload => {
            state.scoreboard = payload ? payload.scoreboard || null : null;
            renderStage();
        });

        socket.on('matches:update', payload => {
            state.matches = payload ? payload.matches || null : null;
            renderAll();
        });

        socket.on('connect_error', error => {
            console.error('Socket.IO 连接失败:', error);
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await loadInitialState();
            connectSocket();
        } catch (error) {
            console.error('初始化直播等待页失败:', error);
        }
    });
})();
