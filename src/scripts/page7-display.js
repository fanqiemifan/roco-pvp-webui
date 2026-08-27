(function () {
    'use strict';

    // 页面布局常量：最多同时显示 4 行，行高 168、行间距 32，第一行距主标题 32
    const MAX_VISIBLE_ROWS = 4;
    const ROW_HEIGHT = 168;
    const ROW_GAP = 32;
    const ROWS_TOP = 214;

    const DEFAULT_TITLE = '对局推送';
    const DEFAULT_NOTICE = '温馨提示：排名选自选手历史最高非实时';
    const DEFAULT_AVATARS = {
        left: '/assets/ui/left-avatar.png',
        right: '/assets/ui/right-avatar.png'
    };
    const WIN_ICON = '/assets/ui/win-icon.DJfsgL3i.png';
    const FAIL_ICON = '/assets/ui/fail-icon.ChpzWjNv.png';
    const STAY_TUNED_ICON = '/assets/ui/icon-stay-tuned.DHbzz5us.png';
    const RANK_ICON = '/assets/ui/7.Wku3bA4b.png';
    const SPIRIT_INDEX_URL = '/resources/data/sprites.json';
    const THUMBNAIL_RESOURCE_BASE = '/resources/Thumbnail';

    // 复用 page3 的排名数字偏移：按显示位数设置数字距图标左侧的 x（10000+ 视为 6 位）
    const RANK_TEXT_LEFT_BY_LENGTH = { 1: 22, 2: 16, 3: 12, 4: 7, 5: 3, 6: -2 };

    const titleEl = document.getElementById('page7Title');
    const rowsEl = document.getElementById('page7Rows');
    const noticeEl = document.getElementById('page7Notice');

    let spriteLookup = null;
    let renderSignature = null;

    /* ---------- 通用工具 ---------- */

    function normalizeText(value) {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[·・.。_\-－—]/g, '');
    }

    function stripVariantName(value) {
        return String(value ?? '').trim().replace(/[-_－—]\d+$/, '');
    }

    function sanitizeFilenameSegment(value) {
        const normalized = String(value ?? '')
            .normalize('NFC')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
            .replace(/\s+/g, '')
            .replace(/\.+$/g, '')
            .trim();
        return normalized || '';
    }

    function toRootPath(value) {
        const text = String(value ?? '').trim();
        if (!text) {
            return '';
        }
        return text.startsWith('/') ? text : `/${text.replace(/^\/+/, '')}`;
    }

    function formatRankText(value) {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) {
            return '';
        }
        return Number(digits) > 10000 ? '10000+' : digits;
    }

    /* ---------- 精灵索引（用于把小局阵容的 spriteId 解析成图片） ---------- */

    function buildSpriteLookup(records) {
        const byName = new Map();
        const byBaseName = new Map();
        records.forEach((record) => {
            const displayName = String(record.displayName || '').trim();
            const cardName = stripVariantName(displayName);
            const nameKey = normalizeText(displayName);
            const baseKey = normalizeText(cardName);
            if (nameKey && !byName.has(nameKey)) {
                byName.set(nameKey, record);
            }
            if (baseKey && !byBaseName.has(baseKey)) {
                byBaseName.set(baseKey, record);
            }
        });
        return { byName, byBaseName };
    }

    async function loadSpriteIndex() {
        const response = await fetch(SPIRIT_INDEX_URL);
        if (!response.ok) {
            throw new Error(`精灵索引加载失败: ${response.status}`);
        }
        const payload = await response.json();
        const records = (Array.isArray(payload) ? payload : (payload.spirits || []))
            .map((record) => ({
                displayName: String(record.displayName || record.name || '').trim(),
                path: toRootPath(record.path),
                thumbnailId: String(record.thumbnailId || record['缩略图图片ID'] || '').trim(),
            }))
            .filter((record) => record.displayName);
        spriteLookup = buildSpriteLookup(records);
    }

    function resolveSprite(spriteId) {
        if (!spriteId || !spriteLookup) {
            return null;
        }
        const name = normalizeText(spriteId);
        const base = normalizeText(stripVariantName(spriteId));
        return spriteLookup.byName.get(name) || spriteLookup.byBaseName.get(base) || null;
    }

    /* ---------- 单个精灵卡（复用 page2 pestdiv2：缩略图优先 + 圆形底托，比例 80x80） ---------- */

    function buildPetCard(spriteId) {
        const card = document.createElement('div');
        card.className = 'page7-pet';

        const circle = document.createElement('div');
        circle.className = 'page7-pet-circle';
        card.appendChild(circle);

        const image = document.createElement('img');
        image.alt = '';
        card.appendChild(image);

        const record = resolveSprite(spriteId);
        if (!record) {
            return card;
        }

        // 候选图：缩略图（thumbnailId_名字.png）优先，失败后回退精灵原图
        const candidateNames = Array.from(new Set([
            stripVariantName(record.displayName),
            record.displayName,
            String(spriteId || '').trim(),
        ].map(sanitizeFilenameSegment).filter(Boolean)));

        const sources = record.thumbnailId
            ? candidateNames.map((name) => `${THUMBNAIL_RESOURCE_BASE}/${record.thumbnailId}_${name}.png`)
            : [];
        if (record.path) {
            sources.push(record.path);
        }

        if (!sources.length) {
            return card;
        }

        let currentIndex = 0;
        const assignNext = () => {
            const src = sources[currentIndex];
            card.classList.toggle('has-thumbnail', String(src || '').startsWith(THUMBNAIL_RESOURCE_BASE));
            image.src = src;
        };
        image.onerror = () => {
            currentIndex += 1;
            if (currentIndex >= sources.length) {
                image.onerror = null;
                card.classList.remove('has-thumbnail');
                return;
            }
            assignNext();
        };
        assignNext();

        return card;
    }

    /* ---------- 排位排名（复用 page3 rank div） ---------- */

    function buildRankIcon(rankValue) {
        const rank = document.createElement('div');
        rank.className = 'page7-rank';

        const icon = document.createElement('img');
        icon.src = RANK_ICON;
        icon.alt = '';
        rank.appendChild(icon);

        const txt = document.createElement('div');
        txt.className = 'page7-rank-txt';
        const text = formatRankText(rankValue);
        if (text) {
            txt.textContent = text;
            txt.style.left = `${RANK_TEXT_LEFT_BY_LENGTH[Math.min(text.length, 6)]}px`;
        } else {
            txt.hidden = true;
        }
        rank.appendChild(txt);
        return rank;
    }

    /* ---------- 头像 ---------- */

    function buildAvatar(side, avatarState) {
        const avatar = document.createElement('div');
        avatar.className = 'page7-avatar';

        const image = document.createElement('img');
        image.alt = `${side === 'left' ? '左侧' : '右侧'}选手头像`;
        const state = avatarState || {};
        if (state.exists && state.path) {
            const cacheBuster = state.mtime ? Math.floor(state.mtime) : Date.now();
            image.src = `${state.path}?t=${cacheBuster}`;
        } else {
            image.src = DEFAULT_AVATARS[side];
        }
        avatar.appendChild(image);
        return avatar;
    }

    /* ---------- 半区（left / right div） ---------- */

    function buildSide(side, match, game, avatars) {
        const sideEl = document.createElement('div');
        sideEl.className = `page7-side page7-side-${side}`;

        const winner = game ? game.winner : null;
        if (winner === side) {
            sideEl.classList.add('is-winner');
        }

        // 头像
        sideEl.appendChild(buildAvatar(side, avatars ? avatars[side] : null));

        // 选手名字
        const name = document.createElement('div');
        name.className = 'page7-name';
        name.textContent = (side === 'left' ? match.leftPlayer : match.rightPlayer) || (side === 'left' ? '左侧' : '右侧');
        sideEl.appendChild(name);

        // 排位排名图标
        sideEl.appendChild(buildRankIcon(side === 'left' ? match.leftRank : match.rightRank));

        // 精灵卡（该小局阵容，最多 6 张，每张 80x80 间隙 12px）
        const pets = document.createElement('div');
        pets.className = 'page7-pets';
        const slots = game ? (side === 'left' ? game.leftSlots : game.rightSlots) : null;
        (slots || []).forEach((slot) => {
            if (slot && slot.spriteId) {
                pets.appendChild(buildPetCard(slot.spriteId));
            }
        });
        sideEl.appendChild(pets);

        // 胜负图标：胜方 win-icon、败方 fail-icon，未分出胜负时不显示
        if (winner === 'left' || winner === 'right') {
            const result = document.createElement('div');
            result.className = 'page7-result';
            const icon = document.createElement('img');
            icon.src = winner === side ? WIN_ICON : FAIL_ICON;
            icon.alt = winner === side ? '胜' : '负';
            result.appendChild(icon);
            sideEl.appendChild(result);
        }

        return sideEl;
    }

    /* ---------- 行渲染 ---------- */

    // 参与展示的小局：已分出胜负，或已录入阵容（进行中/待开始的下一局）
    function getDisplayGames(match) {
        if (!match || !Array.isArray(match.games)) {
            return [];
        }
        return match.games.filter((game) => {
            if (game.status === 'completed') {
                return true;
            }
            const leftCount = Array.isArray(game.leftLineup) ? game.leftLineup.length : 0;
            const rightCount = Array.isArray(game.rightLineup) ? game.rightLineup.length : 0;
            return leftCount + rightCount > 0;
        });
    }

    function buildRow(index, game, gameNumber, match, avatars) {
        const row = document.createElement('div');
        row.className = 'page7-row';
        row.style.top = `${ROWS_TOP + index * (ROW_HEIGHT + ROW_GAP)}px`;

        // 对局序号：GAME1、GAME2…（空占位行也正常显示）
        const label = document.createElement('div');
        label.className = 'page7-row-label';
        label.textContent = `GAME${gameNumber}`;
        row.appendChild(label);

        const card = document.createElement('div');
        if (game && match) {
            card.className = 'page7-card';
            card.appendChild(buildSide('left', match, game, avatars));
            card.appendChild(buildSide('right', match, game, avatars));
        } else {
            // 空占位卡：icon-stay-tuned 居中
            card.className = 'page7-card page7-card-empty';
            const icon = document.createElement('img');
            icon.src = STAY_TUNED_ICON;
            icon.alt = '敬请期待';
            card.appendChild(icon);
        }
        row.appendChild(card);

        return row;
    }

    function renderRows(data) {
        const state = (data && data.state) || {};
        const match = (data && data.match) || null;
        const avatars = (data && data.avatars) || null;

        rowsEl.innerHTML = '';

        // 滑动窗口：超过 4 个小局时只显示最后 4 个（显示第 5 局时第 1 局消失）
        const games = getDisplayGames(match);
        const visibleGames = games.slice(-MAX_VISIBLE_ROWS);
        let nextNumber = visibleGames.length
            ? Number(visibleGames[visibleGames.length - 1].gameNumber) || visibleGames.length
            : 0;

        for (let index = 0; index < MAX_VISIBLE_ROWS; index += 1) {
            const game = visibleGames[index] || null;
            let gameNumber;
            if (game) {
                gameNumber = Number(game.gameNumber) || index + 1;
            } else {
                nextNumber += 1;
                gameNumber = nextNumber;
            }
            rowsEl.appendChild(buildRow(index, game, gameNumber, match, avatars));
        }
    }

    function applyAll(data) {
        const state = (data && data.state) || {};
        const match = (data && data.match) || null;
        const avatars = (data && data.avatars) || null;

        titleEl.textContent = String(state.title || '').trim() || DEFAULT_TITLE;
        noticeEl.textContent = String(state.notice || '').trim() || DEFAULT_NOTICE;

        renderRows(data);

        renderSignature = JSON.stringify({
            title: titleEl.textContent,
            notice: noticeEl.textContent,
            matchId: state.matchId || null,
            match: match ? {
                leftPlayer: match.leftPlayer,
                rightPlayer: match.rightPlayer,
                leftRank: match.leftRank,
                rightRank: match.rightRank,
                games: (match.games || []).map((game) => ({
                    gameNumber: game.gameNumber,
                    winner: game.winner,
                    status: game.status,
                    leftLineup: game.leftLineup,
                    rightLineup: game.rightLineup,
                })),
            } : null,
            avatars: avatars ? {
                left: avatars.left && avatars.left.exists ? `${avatars.left.path}?${avatars.left.mtime}` : '',
                right: avatars.right && avatars.right.exists ? `${avatars.right.path}?${avatars.right.mtime}` : '',
            } : null,
        });
    }

    async function loadData() {
        try {
            const data = await fetch('/api/page7', { credentials: 'same-origin' }).then((response) => response.json());
            if (renderSignature !== null) {
                // 先用同一份签名逻辑判断是否有变化，避免无差异重渲染导致图片闪烁
                const state = (data && data.state) || {};
                const match = (data && data.match) || null;
                const avatars = (data && data.avatars) || null;
                const nextSignature = JSON.stringify({
                    title: String(state.title || '').trim() || DEFAULT_TITLE,
                    notice: String(state.notice || '').trim() || DEFAULT_NOTICE,
                    matchId: state.matchId || null,
                    match: match ? {
                        leftPlayer: match.leftPlayer,
                        rightPlayer: match.rightPlayer,
                        leftRank: match.leftRank,
                        rightRank: match.rightRank,
                        games: (match.games || []).map((game) => ({
                            gameNumber: game.gameNumber,
                            winner: game.winner,
                            status: game.status,
                            leftLineup: game.leftLineup,
                            rightLineup: game.rightLineup,
                        })),
                    } : null,
                    avatars: avatars ? {
                        left: avatars.left && avatars.left.exists ? `${avatars.left.path}?${avatars.left.mtime}` : '',
                        right: avatars.right && avatars.right.exists ? `${avatars.right.path}?${avatars.right.mtime}` : '',
                    } : null,
                });
                if (renderSignature === nextSignature) {
                    return;
                }
            }
            applyAll(data);
        } catch (error) {
            console.error('page7 初始加载失败:', error);
        }
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }
        const socket = io({ transports: ['websocket', 'polling'] });

        socket.on('snapshot', (payload) => {
            if (payload && payload.page7) {
                void loadData();
            }
        });

        socket.on('page7:update', () => {
            void loadData();
        });

        socket.on('matches:update', () => {
            void loadData();
        });

        socket.on('avatar:update', () => {
            // 头像按赛事隔离：重新拉取后由签名比对决定是否重渲染
            void loadData();
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await loadSpriteIndex();
        } catch (error) {
            console.error('精灵索引加载失败:', error);
        }
        void loadData();
        connectSocket();
    });
})();
