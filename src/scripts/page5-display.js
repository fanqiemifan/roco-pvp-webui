(function () {
    'use strict';

    const THUMBNAIL_RESOURCE_BASE = '/resources/Thumbnail';
    const FALLBACK_IMG = '/assets/ui/back.png';
    const DEFAULT_TITLE = '使用率 · 胜率排行';

    const titleEl = document.getElementById('page5Title');
    const badgeEl = document.getElementById('page5Badge');
    const leftRowsEl = document.getElementById('page5RowsLeft');
    const rightRowsEl = document.getElementById('page5RowsRight');

    const unavailableThumbnailPaths = new Set();

    function basename(value) {
        return String(value || '').split('/').filter(Boolean).pop() || '';
    }

    function sanitizeFilenameSegment(value, fallback = '') {
        const normalized = String(value ?? '')
            .normalize('NFC')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
            .replace(/\s+/g, '')
            .replace(/\.+$/g, '')
            .trim();
        return normalized || fallback;
    }

    function buildThumbnailCandidates(row) {
        const thumbnailId = String(row && row.thumbnailId ? row.thumbnailId : '').trim();
        if (!thumbnailId) {
            return [];
        }
        const candidateNames = [
            row && row.cardName,
            row && row.displayName,
            row && row.name,
            row && row.filename ? basename(row.filename) : '',
        ]
            .map((value) => sanitizeFilenameSegment(value))
            .filter(Boolean);
        return Array.from(new Set(candidateNames)).map((name) => `${THUMBNAIL_RESOURCE_BASE}/${thumbnailId}_${name}.png`);
    }

    function applySpriteImage(imgEl, row) {
        const fallbackSrc = row && row.spritePath ? String(row.spritePath) : '';
        const thumbnailCandidates = buildThumbnailCandidates(row).filter((path) => !unavailableThumbnailPaths.has(path));
        const sourceQueue = [...thumbnailCandidates, ...(fallbackSrc ? [fallbackSrc] : [])];

        if (sourceQueue.length === 0) {
            imgEl.removeAttribute('src');
            imgEl.onerror = null;
            return;
        }

        const imageSignature = JSON.stringify(sourceQueue);
        if (imgEl.dataset.imageSignature === imageSignature) {
            return;
        }

        imgEl.dataset.imageSignature = imageSignature;
        let currentIndex = 0;

        const assignNext = () => {
            imgEl.dataset.currentSrc = sourceQueue[currentIndex];
            imgEl.src = sourceQueue[currentIndex];
        };

        imgEl.onerror = () => {
            const failedSrc = imgEl.dataset.currentSrc || '';
            if (failedSrc.startsWith(THUMBNAIL_RESOURCE_BASE)) {
                unavailableThumbnailPaths.add(failedSrc);
            }
            currentIndex += 1;
            if (currentIndex >= sourceQueue.length) {
                imgEl.onerror = null;
                imgEl.src = FALLBACK_IMG;
                return;
            }
            assignNext();
        };

        assignNext();
    }

    function formatPercent(value) {
        return `${value.toFixed(1)}%`;
    }

    function buildRow(row, index) {
        const el = document.createElement('div');
        el.className = 'page5-row' + (index === 0 ? ' is-top' : '');

        const rank = document.createElement('div');
        rank.className = 'page5-rank';
        rank.textContent = String(index + 1);

        const sprite = document.createElement('div');
        sprite.className = 'page5-sprite';
        sprite.innerHTML = '<img alt="" />';
        applySpriteImage(sprite.querySelector('img'), row);

        const count = document.createElement('div');
        count.className = 'page5-data page5-data-count';
        count.textContent = String(row.picks || 0);

        const usage = document.createElement('div');
        usage.className = 'page5-data';
        usage.textContent = formatPercent(row.usagePercent || 0);

        const wins = document.createElement('div');
        wins.className = 'page5-data page5-data-wins';
        wins.textContent = typeof row.winRate === 'number' ? formatPercent(row.winRate * 100) : '-';

        el.appendChild(rank);
        el.appendChild(sprite);
        el.appendChild(count);
        el.appendChild(usage);
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
        badgeEl.innerHTML = '';
        const inner = document.createElement('span');
        inner.textContent = scopeLabel;
        badgeEl.appendChild(inner);
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
