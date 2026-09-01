(function () {
    'use strict';

    /**
     * 推流页面10（胜者结算画面）渲染脚本。
     *
     * 数据来源：GET /api/page10 -> { match, avatars }
     * - match：当前活跃比赛（含每个小局的胜负与阵容槽位）
     * - avatars：当前活跃比赛的左右选手头像
     *
     * 胜者取「最近一个已分胜负的小局」：
     * 例如 BO5 打到第 3 局，第 3 局已分胜负则取第 3 局胜者，第 3 局进行中则取第 2 局胜者。
     * 阵容精灵卡复用推流页面1 的 petsdiv3（缩略图优先，失败回退精灵原图）。
     */

    const SPIRIT_INDEX_URL = '/resources/data/sprites.json';
    const THUMBNAIL_RESOURCE_BASE = '/resources/Thumbnail';
    const DEFAULT_AVATARS = {
        left: '/assets/ui/left-avatar.png',
        right: '/assets/ui/right-avatar.png'
    };

    const nameEl = document.getElementById('page10Name');
    const avatarImgEl = document.getElementById('page10Avatar');
    const petsEl = document.getElementById('page10Pets');

    let spriteLookup = null;
    let renderSignature = null;

    /* ---------- 通用工具（与 page7-display.js 保持一致） ---------- */

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

    function basename(value) {
        return String(value || '').split('/').filter(Boolean).pop() || '';
    }

    /* ---------- 精灵索引（把小局阵容的 spriteId 解析成图片） ---------- */

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
                // sprites.json 原始字段为中文名（精灵名称/精灵名字2/缩略图图片ID），与 sprite-service 的解析保持一致
                displayName: String(record.displayName || record.name || record['精灵名字2'] || record['精灵名称'] || '').trim(),
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

    /* ---------- petsdiv3 渲染（复用推流页面1 的结构与候选图逻辑） ---------- */

    function buildPetSlot(slotData) {
        const slotEl = document.createElement('div');
        const spriteId = slotData && slotData.spriteId ? String(slotData.spriteId).trim() : '';
        if (!spriteId) {
            slotEl.className = 'petsdiv3 is-empty';
            return slotEl;
        }

        const record = resolveSprite(spriteId);
        const isDead = Boolean(slotData.healthEnabled && Number(slotData.healthPercent) <= 0);
        slotEl.className = `petsdiv3 is-active${isDead ? ' is-dead' : ''}`;

        const imgEl = document.createElement('img');
        imgEl.alt = record ? record.displayName : spriteId;
        slotEl.appendChild(imgEl);

        // 候选名：索引显示名 / 去变体后缀名 / 原始 spriteId / 文件名
        const candidateNames = Array.from(new Set([
            record ? record.displayName : '',
            record ? stripVariantName(record.displayName) : '',
            spriteId,
            record ? basename(record.path) : '',
        ].map(sanitizeFilenameSegment).filter(Boolean)));

        // 候选图：缩略图（thumbnailId_名字.png）优先，失败后回退精灵原图
        const sources = record && record.thumbnailId
            ? candidateNames.map((name) => `${THUMBNAIL_RESOURCE_BASE}/${record.thumbnailId}_${name}.png`)
            : [];
        if (record && record.path) {
            sources.push(record.path);
        }

        if (!sources.length) {
            return slotEl;
        }

        let currentIndex = 0;
        const assignNext = () => {
            imgEl.src = sources[currentIndex];
        };
        imgEl.onerror = () => {
            currentIndex += 1;
            if (currentIndex >= sources.length) {
                imgEl.onerror = null;
                return;
            }
            assignNext();
        };
        assignNext();

        return slotEl;
    }

    /* ---------- 胜者解析：最近一个已分胜负的小局 ---------- */

    function getLatestCompletedGame(match) {
        if (!match || !Array.isArray(match.games)) {
            return null;
        }
        const completed = match.games.filter((game) => (
            game && game.status === 'completed' && (game.winner === 'left' || game.winner === 'right')
        ));
        return completed.length ? completed[completed.length - 1] : null;
    }

    /* ---------- 渲染 ---------- */

    function applyAll(data) {
        const match = data && data.match ? data.match : null;
        const avatars = data && data.avatars ? data.avatars : null;
        const game = getLatestCompletedGame(match);
        const side = game ? game.winner : null;

        // 主标题：获胜选手名字
        let playerName = '待定';
        if (match && side) {
            playerName = (side === 'left' ? match.leftPlayer : match.rightPlayer) || '待定';
        }
        nameEl.textContent = playerName;

        // 头像：优先当前比赛头像，无头像时回退默认占位图
        const avatarState = side && avatars ? avatars[side] : null;
        if (avatarState && avatarState.exists && avatarState.path) {
            const cacheBuster = avatarState.mtime ? Math.floor(avatarState.mtime) : Date.now();
            avatarImgEl.src = `${avatarState.path}?t=${cacheBuster}`;
        } else {
            avatarImgEl.src = side ? DEFAULT_AVATARS[side] : DEFAULT_AVATARS.left;
        }

        // 获胜方阵容：取该小局获胜一侧的槽位
        petsEl.innerHTML = '';
        if (game && side) {
            const slots = side === 'left' ? game.leftSlots : game.rightSlots;
            (slots || []).forEach((slot) => {
                petsEl.appendChild(buildPetSlot(slot));
            });
        }

        renderSignature = buildSignature(data);
    }

    // 渲染签名：比赛/小局胜负/阵容槽位/头像 任一变化才重渲染
    function buildSignature(data) {
        const match = data && data.match ? data.match : null;
        const avatars = data && data.avatars ? data.avatars : null;
        return JSON.stringify({
            matchId: match ? match.id : null,
            leftPlayer: match ? match.leftPlayer : '',
            rightPlayer: match ? match.rightPlayer : '',
            games: match && Array.isArray(match.games)
                ? match.games.map((game) => ({
                    gameNumber: game.gameNumber,
                    winner: game.winner,
                    status: game.status,
                    leftSlots: game.leftSlots || [],
                    rightSlots: game.rightSlots || [],
                }))
                : [],
            avatars: avatars
                ? {
                    left: avatars.left && avatars.left.exists ? `${avatars.left.path}?${avatars.left.mtime}` : '',
                    right: avatars.right && avatars.right.exists ? `${avatars.right.path}?${avatars.right.mtime}` : '',
                }
                : null,
        });
    }

    async function loadData() {
        try {
            const data = await fetch('/api/page10', { credentials: 'same-origin' }).then((response) => response.json());
            if (renderSignature !== null && renderSignature === buildSignature(data)) {
                return;
            }
            applyAll(data);
        } catch (error) {
            console.error('page10 初始加载失败:', error);
        }
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }

        const socket = io({ transports: ['websocket', 'polling'] });

        socket.on('snapshot', () => {
            void loadData();
        });

        socket.on('matches:update', () => {
            void loadData();
        });

        socket.on('avatar:update', () => {
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
