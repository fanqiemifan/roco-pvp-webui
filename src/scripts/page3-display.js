(function () {
    'use strict';

    const MAX_SLOTS = 6;
    const DEFAULT_BEST_OF = 7;
    const DEFAULT_AVATARS = {
        left: '/assets/ui/left-avatar.png',
        right: '/assets/ui/right-avatar.png'
    };

    const panelStates = {
        left: { signatures: new Array(MAX_SLOTS).fill(null) },
        right: { signatures: new Array(MAX_SLOTS).fill(null) }
    };

    let scoreboardSignature = null;
    let avatarSignature = null;
    let nextGameSignature = null;

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

    function normalizeDisplayName(value) {
        return String(value || '').trim().replace(/[-_－—]\d+$/, '');
    }

    function getSpriteDisplayName(sprite) {
        if (!sprite || typeof sprite !== 'object') {
            return '';
        }
        return normalizeDisplayName(
            sprite.cardName || sprite.displayName || sprite.chineseName || sprite.name || sprite.filename || ''
        );
    }

    function getSlotSignature(slotData) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;
        return JSON.stringify({
            id: sprite ? sprite.id || sprite.path || getSpriteDisplayName(sprite) : null,
            name: getSpriteDisplayName(sprite),
            path: sprite && sprite.path ? sprite.path : '',
            opacityEnabled: !!(slotData && slotData.opacityEnabled),
            effectiveOpacity: clamp(slotData && slotData.effectiveOpacity, 0, 1, 1),
            saturation: clamp(slotData && slotData.saturation, 0, 3, 1),
            healthEnabled: !!(slotData && slotData.healthEnabled),
            healthPercent: clamp(slotData && slotData.healthPercent, 0, 100, 100),
            energyValue: clamp(slotData && slotData.energyValue, 0, 10, 10)
        });
    }

    function getInitial(name, fallback) {
        const text = String(name || '').trim();
        if (!text) {
            return fallback;
        }
        return text[0].toUpperCase();
    }

    function getSpriteAttributeIcons(sprite) {
        const icons = [];

        if (sprite && sprite.attributeIcon1) {
            icons.push(sprite.attributeIcon1);
        }
        if (sprite && sprite.attributeIcon2) {
            icons.push(sprite.attributeIcon2);
        }

        return icons;
    }

    function getSpriteCardNameLeft(nameLength) {
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

    function buildSlotCard(slotEl, sprite, spiritName, imageSrc) {
        const attributeIcons = getSpriteAttributeIcons(sprite);
        const attributeIcon1 = attributeIcons[0] || '';
        const attributeIcon2 = attributeIcons[1] || '';
        const card = document.createElement('div');
        card.className = `sprite-pet-card${attributeIcon2 ? ' sprite-pet-card-has-attr2' : ''}`;
        card.style.setProperty('--pet-card-size', `${slotEl.clientWidth || 108}px`);
        card.style.setProperty('--pet-name-left', String(getSpriteCardNameLeft(spiritName.length)));

        card.innerHTML = `
            <div class="sprite-pet-card-bg"></div>
            ${attributeIcon2 ? '<div class="sprite-pet-card-attr-circle"></div>' : ''}
            <img class="sprite-pet-card-sprite" alt="">
            ${attributeIcon1 ? '<img class="sprite-pet-card-attr sprite-pet-card-attr-1" alt="">' : ''}
            ${attributeIcon2 ? '<img class="sprite-pet-card-attr sprite-pet-card-attr-2" alt="">' : ''}
            <div class="sprite-pet-card-name-bg"></div>
            <span class="sprite-pet-card-name"></span>
        `;

        const spriteImage = card.querySelector('.sprite-pet-card-sprite');
        spriteImage.src = imageSrc;
        spriteImage.alt = spiritName;

        if (attributeIcon1) {
            const attr1 = card.querySelector('.sprite-pet-card-attr-1');
            attr1.src = attributeIcon1;
        }

        if (attributeIcon2) {
            const attr2 = card.querySelector('.sprite-pet-card-attr-2');
            attr2.src = attributeIcon2;
        }

        const nameEl = card.querySelector('.sprite-pet-card-name');
        nameEl.textContent = spiritName;

        slotEl.innerHTML = '';
        slotEl.appendChild(card);
    }

    function renderEmptySlot(slotEl) {
        slotEl.className = 'page3-spirit-slot';
        slotEl.innerHTML = '';
    }

    function renderSlot(slotEl, slotData, mtime) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;
        if (!sprite || !sprite.path) {
            renderEmptySlot(slotEl);
            return;
        }

        const spiritName = getSpriteDisplayName(sprite);
        const healthPercent = clamp(slotData && slotData.healthPercent, 0, 100, 100);
        const healthEnabled = !!(slotData && slotData.healthEnabled);
        const isDone = healthEnabled && healthPercent <= 0;
        const cacheBuster = mtime ? Math.floor(mtime) : Date.now();
        const imageSrc = `${sprite.path}${sprite.path.includes('?') ? '&' : '?'}t=${cacheBuster}`;

        slotEl.className = `page3-spirit-slot is-active${isDone ? ' is-done' : ''}`;
        buildSlotCard(slotEl, sprite, spiritName, imageSrc);
    }

    function renderPanel(position, panelData) {
        const selected = panelData && Array.isArray(panelData.selected) ? panelData.selected : [];
        const slotEls = document.querySelectorAll(`.page3-spirit-slot[data-side="${position}"]`);

        slotEls.forEach((slotEl, index) => {
            const slotData = selected[index] || null;
            const nextSignature = getSlotSignature(slotData);
            if (panelStates[position].signatures[index] === nextSignature) {
                return;
            }

            renderSlot(slotEl, slotData, panelData ? panelData.mtime : null);
            panelStates[position].signatures[index] = nextSignature;
        });
    }

    function scaleNameFont(value) {
        return Math.round(clamp(value, 12, 160, 64) * 0.5625);
    }

    function scaleScoreFont(value) {
        return Math.round(clamp(value, 12, 160, 64) * 0.75);
    }

    function renderScoreboard(scoreboard) {
        const data = scoreboard || {};
        const nextSignature = JSON.stringify({
            leftName: data.leftName || '',
            leftScore: data.leftScore || '0',
            rightName: data.rightName || '',
            rightScore: data.rightScore || '0',
            bestOf: normalizeBestOf(data.bestOf),
            scoreboardEnabled: data.scoreboardEnabled !== false,
            nameFontSize: scaleNameFont(data.nameFontSize),
            scoreFontSize: scaleScoreFont(data.scoreFontSize)
        });

        if (scoreboardSignature === nextSignature) {
            return;
        }

        scoreboardSignature = nextSignature;

        const scoreboardEl = document.getElementById('page3Scoreboard');
        scoreboardEl.classList.toggle('is-hidden', data.scoreboardEnabled === false);
        scoreboardEl.style.setProperty('--page3-name-size', `${clamp(scaleNameFont(data.nameFontSize), 24, 42, 36)}px`);
        scoreboardEl.style.setProperty('--page3-score-size', `${clamp(scaleScoreFont(data.scoreFontSize), 32, 60, 48)}px`);

        const leftName = data.leftName || '';
        const rightName = data.rightName || '';

        document.getElementById('page3LeftName').textContent = leftName;
        document.getElementById('page3RightName').textContent = rightName;
        document.getElementById('page3LeftScore').textContent = data.leftScore || '0';
        document.getElementById('page3RightScore').textContent = data.rightScore || '0';
        document.getElementById('page3BestOf').textContent = `BO${normalizeBestOf(data.bestOf)}`;
        document.getElementById('page3LeftAvatar').textContent = getInitial(leftName, 'L');
        document.getElementById('page3RightAvatar').textContent = getInitial(rightName, 'R');
    }

    function renderAvatar(side, avatarState) {
        const imageEl = document.getElementById(side === 'left' ? 'page3LeftAvatarImage' : 'page3RightAvatarImage');
        const textEl = document.getElementById(side === 'left' ? 'page3LeftAvatar' : 'page3RightAvatar');
        const avatar = avatarState || {};
        const defaultPath = DEFAULT_AVATARS[side];

        if (avatar.exists && avatar.path) {
            const cacheBuster = avatar.mtime ? Math.floor(avatar.mtime) : Date.now();
            imageEl.src = `${avatar.path}?t=${cacheBuster}`;
            imageEl.style.display = 'block';
            textEl.style.display = 'none';
            return;
        }

        imageEl.src = defaultPath;
        imageEl.style.display = 'block';
        textEl.style.display = 'none';
    }

    function renderAvatars(avatars) {
        const data = avatars || {};
        const nextSignature = JSON.stringify({
            leftPath: data.left && data.left.exists ? data.left.path : '',
            leftMtime: data.left && data.left.exists ? data.left.mtime : null,
            rightPath: data.right && data.right.exists ? data.right.path : '',
            rightMtime: data.right && data.right.exists ? data.right.mtime : null
        });

        if (avatarSignature === nextSignature) {
            return;
        }

        avatarSignature = nextSignature;
        renderAvatar('left', data.left);
        renderAvatar('right', data.right);
    }

    function applySnapshot(payload) {
        const panels = payload && Array.isArray(payload.panels) ? payload.panels : [];
        renderScoreboard(payload ? payload.scoreboard : null);
        renderAvatars(payload ? payload.avatars : null);
        renderNextGame(payload ? payload.nextgame : null);
        renderPanel('left', panels.find(panel => panel && panel.position === 'left'));
        renderPanel('right', panels.find(panel => panel && panel.position === 'right'));
    }

    // 设置下场对局选手名字：超过 5 个字时开启横向滚动
    function setNextGameName(nameEl, text) {
        const inner = nameEl.querySelector('.page3-nextgame-name-inner');
        if (inner) {
            inner.textContent = text;
        } else {
            nameEl.textContent = text;
        }
        nameEl.classList.toggle('is-scrolling', String(text || '').length > 5);
    }

    function renderNextGame(payload) {
        const data = payload || {};
        const state = data.state || {};
        const match = data.match || null;
        const avatars = data.avatars || {};

        const nextSignature = JSON.stringify({
            visible: Boolean(state.visible),
            matchId: state.matchId || '',
            leftName: match ? match.leftPlayer || '' : '',
            rightName: match ? match.rightPlayer || '' : '',
            leftAvatar: avatars.left && avatars.left.exists ? (avatars.left.path || '') : '',
            leftMtime: avatars.left && avatars.left.exists ? avatars.left.mtime : null,
            rightAvatar: avatars.right && avatars.right.exists ? (avatars.right.path || '') : '',
            rightMtime: avatars.right && avatars.right.exists ? avatars.right.mtime : null,
        });

        if (nextGameSignature === nextSignature) {
            return;
        }
        nextGameSignature = nextSignature;

        const el = document.getElementById('page3NextGame');
        const isVisible = Boolean(state.visible) && Boolean(match);

        el.hidden = !isVisible;
        if (!isVisible) {
            return;
        }

        setNextGameName(document.getElementById('page3NextLeftName'), match.leftPlayer || '');
        setNextGameName(document.getElementById('page3NextRightName'), match.rightPlayer || '');

        const leftImg = document.getElementById('page3NextLeftAvatarImage');
        const rightImg = document.getElementById('page3NextRightAvatarImage');
        const leftAvatar = avatars.left || {};
        const rightAvatar = avatars.right || {};

        if (leftAvatar.exists && leftAvatar.path) {
            const cacheBuster = leftAvatar.mtime ? Math.floor(leftAvatar.mtime) : Date.now();
            leftImg.src = `${leftAvatar.path}?t=${cacheBuster}`;
        } else {
            leftImg.src = DEFAULT_AVATARS.left;
        }

        if (rightAvatar.exists && rightAvatar.path) {
            const cacheBuster = rightAvatar.mtime ? Math.floor(rightAvatar.mtime) : Date.now();
            rightImg.src = `${rightAvatar.path}?t=${cacheBuster}`;
        } else {
            rightImg.src = DEFAULT_AVATARS.right;
        }
    }

    async function loadInitialState() {
        const [imagesResponse, scoreboardResponse, avatarsResponse, nextgameResponse] = await Promise.all([
            fetch('api/images'),
            fetch('api/scoreboard'),
            fetch('api/avatars'),
            fetch('api/nextgame')
        ]);

        const [imagesData, scoreboardData, avatarsData, nextgameData] = await Promise.all([
            imagesResponse.json(),
            scoreboardResponse.json(),
            avatarsResponse.json(),
            nextgameResponse.json()
        ]);

        applySnapshot({
            panels: imagesData.images || [],
            scoreboard: scoreboardData,
            avatars: avatarsData,
            nextgame: nextgameData
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
                renderPanel(payload.panel.position, payload.panel);
            }
        });

        socket.on('scoreboard:update', payload => {
            renderScoreboard(payload ? payload.scoreboard : null);
        });

        socket.on('avatar:update', payload => {
            renderAvatars(payload ? payload.avatars : null);
        });

        socket.on('nextgame:update', payload => {
            renderNextGame(payload || null);
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
            console.error('初始化推流页面3失败:', error);
        }
    });
})();
