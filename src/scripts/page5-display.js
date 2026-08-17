(function () {
    'use strict';

    const FALLBACK_IMG = '/assets/ui/back.png';
    const DEFAULT_TITLE = '登场 · 胜率排行';

    const titleEl = document.getElementById('page5Title');
    const badgeEl = document.getElementById('page5Badge');
    const leftRowsEl = document.getElementById('page5RowsLeft');
    const rightRowsEl = document.getElementById('page5RowsRight');

    function normalizeDisplayName(value) {
        return String(value || '').trim().replace(/[-_－—]\d+$/, '');
    }

    function getSpriteName(row) {
        return normalizeDisplayName(row && (row.cardName || row.displayName || row.name) || '');
    }

    function getCardNameLeft(nameLength) {
        switch (nameLength) {
            case 2:
                return 44;
            case 3:
                return 40;
            case 4:
                return 37;
            case 5:
                return 34;
            default:
                return nameLength <= 2 ? 44 : 37;
        }
    }

    // 复用 roco-pvp-page3 的 petsdiv（sprite-pet-card）128×128
    function buildPetCard(row) {
        const name = getSpriteName(row);
        const attr1 = row && row.attributeIcon1 ? String(row.attributeIcon1) : '';
        const attr2 = row && row.attributeIcon2 ? String(row.attributeIcon2) : '';
        const spriteSrc = row && row.spritePath ? String(row.spritePath) : FALLBACK_IMG;

        const card = document.createElement('div');
        card.className = 'sprite-pet-card';
        card.style.setProperty('--pet-card-size', '128px');
        card.style.setProperty('--pet-name-left', String(getCardNameLeft(name.length)));

        card.innerHTML = `
            <div class="sprite-pet-card-bg"></div>
            ${attr2 ? '<div class="sprite-pet-card-attr-circle"></div>' : ''}
            <img class="sprite-pet-card-sprite" alt="">
            ${attr1 ? '<img class="sprite-pet-card-attr sprite-pet-card-attr-1" alt="">' : ''}
            ${attr2 ? '<img class="sprite-pet-card-attr sprite-pet-card-attr-2" alt="">' : ''}
            <div class="sprite-pet-card-name-bg"></div>
            <span class="sprite-pet-card-name"></span>
        `;

        const spriteImage = card.querySelector('.sprite-pet-card-sprite');
        spriteImage.src = spriteSrc;
        spriteImage.alt = name;
        spriteImage.onerror = () => {
            spriteImage.onerror = null;
            spriteImage.src = FALLBACK_IMG;
        };

        if (attr1) {
            const icon = card.querySelector('.sprite-pet-card-attr-1');
            icon.src = attr1;
            icon.onerror = () => {
                icon.onerror = null;
                icon.remove();
            };
        }

        if (attr2) {
            const icon = card.querySelector('.sprite-pet-card-attr-2');
            icon.src = attr2;
            icon.onerror = () => {
                icon.onerror = null;
                icon.remove();
            };
        }

        const nameEl = card.querySelector('.sprite-pet-card-name');
        nameEl.textContent = name;

        return card;
    }

    // 胜率仅显示 2 位整数百分比，如 47%
    function formatWinRate(value) {
        if (typeof value !== 'number') {
            return '-';
        }
        return `${Math.round(value * 100)}%`;
    }

    function buildRow(row, index) {
        const el = document.createElement('div');
        el.className = 'page5-row';

        const rank = document.createElement('div');
        rank.className = 'page5-rank';
        rank.textContent = String(index + 1);

        const sprite = document.createElement('div');
        sprite.className = 'page5-sprite';
        sprite.appendChild(buildPetCard(row));

        const count = document.createElement('div');
        count.className = 'page5-data page5-data-count';
        count.textContent = String(row.picks || 0);

        const wins = document.createElement('div');
        wins.className = 'page5-data page5-data-wins';
        wins.textContent = formatWinRate(row.winRate);

        el.appendChild(rank);
        el.appendChild(sprite);
        el.appendChild(count);
        el.appendChild(wins);
        return el;
    }

    function renderRanking(data) {
        const rows = data && Array.isArray(data.rows) ? data.rows : [];
        leftRowsEl.innerHTML = '';
        rightRowsEl.innerHTML = '';

        rows.slice(0, 5).forEach((row, index) => {
            leftRowsEl.appendChild(buildRow(row, index));
        });
        rows.slice(5, 10).forEach((row, index) => {
            rightRowsEl.appendChild(buildRow(row, index + 5));
        });

        const tagLabel = data && data.tag ? data.tag : '';
        const playerLabel = data && data.player ? data.player : '';
        // 口径标签：赛事标签 · 选手（都有则组合，只有一个显示单值，都没有显示「全部」）
        let scopeLabel = '全部';
        if (tagLabel && playerLabel) {
            scopeLabel = `${tagLabel} · ${playerLabel}`;
        } else if (tagLabel) {
            scopeLabel = tagLabel;
        } else if (playerLabel) {
            scopeLabel = playerLabel;
        }
        badgeEl.textContent = scopeLabel;
    }

    function applyTitle(eventTitle) {
        const text = String(eventTitle || '').trim();
        titleEl.textContent = text || DEFAULT_TITLE;
    }

    async function fetchRanking(tag, player) {
        const query = new URLSearchParams();
        if (tag) {
            query.set('tag', tag);
        }
        if (player) {
            query.set('player', player);
        }
        try {
            const response = await fetch(`/api/stats/ranking?${query.toString()}`, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            renderRanking(data);
        } catch (error) {
            console.error('排行加载失败:', error);
        }
    }

    async function loadInitial() {
        try {
            const [stage, scoreboard] = await Promise.all([
                fetch('/api/stage', { credentials: 'same-origin' }).then((r) => r.json()),
                fetch('/api/scoreboard', { credentials: 'same-origin' }).then((r) => r.json()),
            ]);
            applyTitle(scoreboard && scoreboard.page5Title);
            await fetchRanking(stage && stage.page5Tag, stage && stage.page5Player);
        } catch (error) {
            console.error('page5 初始加载失败:', error);
        }
    }

    let refreshTimer = null;
    function scheduleRefresh(tag, player) {
        if (refreshTimer) {
            window.clearTimeout(refreshTimer);
        }
        refreshTimer = window.setTimeout(() => {
            void fetchRanking(tag, player);
        }, 250);
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }
        const socket = io({ transports: ['websocket', 'polling'] });

        socket.on('snapshot', (payload) => {
            const stage = payload && payload.stage ? payload.stage : null;
            const scoreboard = payload && payload.scoreboard ? payload.scoreboard : null;
            if (scoreboard) {
                applyTitle(scoreboard.page5Title);
            }
            if (stage) {
                void fetchRanking(stage.page5Tag, stage.page5Player);
            }
        });

        socket.on('stage:update', (payload) => {
            const stage = payload && payload.stage ? payload.stage : null;
            if (stage) {
                scheduleRefresh(stage.page5Tag, stage.page5Player);
            }
        });

        socket.on('scoreboardUpdate', (payload) => {
            const scoreboard = payload && payload.scoreboard ? payload.scoreboard : null;
            if (scoreboard) {
                applyTitle(scoreboard.page5Title);
            }
        });

        socket.on('matchesUpdate', (payload) => {
            const stage = payload && payload.stage ? payload.stage : null;
            scheduleRefresh(stage ? stage.page5Tag : undefined, stage ? stage.page5Player : undefined);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        void loadInitial();
        connectSocket();
    });
})();