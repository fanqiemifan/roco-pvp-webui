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
    const lastRenderedSlots = {
        left: new Array(MAX_SLOTS).fill(null),
        right: new Array(MAX_SLOTS).fill(null)
    };
    const exitLayer = document.getElementById('page3LineupExitLayer');

    let scoreboardSignature = null;
    let avatarSignature = null;
    let nextGameSignature = null;
    let matchPhaseSignature = null;
    let page3SpriteSource = 'sprite';
    const panelDataCache = { left: null, right: null };
    let lineupAnimationTimer = null;
    let lineupAnimationMode = null;

    const LINEUP_ANIMATION_MS = 760;

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
        const imageCandidates = getSpriteImageCandidates(sprite)
            .map((src) => `${src}${src.includes('?') ? '&' : '?'}t=${cacheBuster}`);

        slotEl.className = `page3-spirit-slot is-active${isDone ? ' is-done' : ''}`;
        if (lineupAnimationMode === 'enter') {
            slotEl.classList.add('is-lineup-entering');
        }
        buildSlotCard(slotEl, sprite, spiritName, imageCandidates[0] || '');
        const spriteImage = slotEl.querySelector('.sprite-pet-card-sprite');
        if (page3SpriteSource === 'thumbnail' && slotEl.dataset.side === 'right') {
            spriteImage.classList.add('is-page3-thumbnail-flipped');
        }
        let imageIndex = 0;
        spriteImage.onerror = () => {
            imageIndex += 1;
            if (imageIndex < imageCandidates.length) {
                spriteImage.src = imageCandidates[imageIndex];
            } else {
                spriteImage.onerror = null;
            }
        };
    }

    function renderPanel(position, panelData) {
        panelDataCache[position] = panelData || null;
        const selected = panelData && Array.isArray(panelData.selected) ? panelData.selected : [];
        const slotEls = document.querySelectorAll(`.page3-spirit-slot[data-side="${position}"]`);

        slotEls.forEach((slotEl, index) => {
            const slotData = selected[index] || null;
            const nextSignature = getSlotSignature(slotData);

            // 面板清空可能先于 matches:update 到达。先复制到独立退场层，
            // 原阵容可以立即按业务状态清空，动画不受影响。
            if (!slotData && slotEl.classList.contains('is-active') && lineupAnimationMode !== 'exit') {
                animateLineup('exit');
                panelStates[position].signatures[index] = nextSignature;
                return;
            }

            if (panelStates[position].signatures[index] === nextSignature) {
                return;
            }

            if (!slotData && lineupAnimationMode === 'exit') {
                renderEmptySlot(slotEl);
                panelStates[position].signatures[index] = nextSignature;
                return;
            }

            renderSlot(slotEl, slotData, panelData ? panelData.mtime : null);
            panelStates[position].signatures[index] = nextSignature;
            if (slotData && slotEl.classList.contains('is-active')) {
                lastRenderedSlots[position][index] = slotEl.cloneNode(true);
            } else if (!slotData) {
                lastRenderedSlots[position][index] = null;
            }
        });
    }

    function sanitizeFilenameSegment(value) {
        return String(value || '')
            .normalize('NFC')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
            .replace(/\s+/g, '')
            .replace(/\.+$/g, '')
            .trim();
    }

    function getSpriteImageCandidates(sprite) {
        const fallback = sprite && sprite.path ? String(sprite.path) : '';
        if (page3SpriteSource !== 'thumbnail' || !sprite || !sprite.thumbnailId) {
            return fallback ? [fallback] : [];
        }
        const names = [sprite.cardName, sprite.displayName, sprite.chineseName, sprite.name]
            .map(sanitizeFilenameSegment)
            .filter(Boolean);
        const thumbnails = Array.from(new Set(names)).map((name) =>
            `/resources/Thumbnail/${sanitizeFilenameSegment(sprite.thumbnailId)}_${name}.png`
        );
        return [...thumbnails, ...(fallback ? [fallback] : [])];
    }

    function getMatchPhase(payload) {
        const store = payload && payload.matches;
        const matches = store && Array.isArray(store.matches) ? store.matches : [];
        const activeMatch = matches.find(match => match && match.id === store.activeMatchId);
        if (!activeMatch) {
            return 'none';
        }

        const currentGame = Array.isArray(activeMatch.games)
            ? activeMatch.games.find(game => game && game.status !== 'completed')
            : null;
        return currentGame && currentGame.status === 'in_progress' ? 'in_progress' : 'waiting';
    }

    function finishLineupAnimation() {
        if (lineupAnimationTimer) {
            window.clearTimeout(lineupAnimationTimer);
            lineupAnimationTimer = null;
        }
        lineupAnimationMode = null;
        if (exitLayer) {
            exitLayer.innerHTML = '';
        }
        panelStates.left.signatures.fill(getSlotSignature(null));
        panelStates.right.signatures.fill(getSlotSignature(null));
    }

    function buildExitLayer() {
        if (!exitLayer) {
            return;
        }
        exitLayer.innerHTML = '';
        ['left', 'right'].forEach(side => {
            lastRenderedSlots[side].forEach((savedSlot, index) => {
                if (!savedSlot) {
                    return;
                }
                const clone = savedSlot.cloneNode(true);
                clone.dataset.side = side;
                clone.dataset.slot = String(index);
                clone.classList.remove('is-lineup-entering', 'is-lineup-exiting');
                clone.classList.add('page3-lineup-exit-slot');
                const sourceSlot = document.querySelector(`.page3-spirit-slot[data-side="${side}"][data-slot="${index}"]`);
                const left = sourceSlot ? sourceSlot.offsetLeft : 0;
                const top = sourceSlot ? sourceSlot.offsetTop : 0;
                const width = sourceSlot ? sourceSlot.offsetWidth : 108;
                const height = sourceSlot ? sourceSlot.offsetHeight : 108;
                clone.style.left = `${left}px`;
                clone.style.top = `${top}px`;
                clone.style.width = `${width}px`;
                clone.style.height = `${height}px`;
                exitLayer.appendChild(clone);
            });
        });
    }

    function animateLineup(mode) {
        if (lineupAnimationTimer) {
            window.clearTimeout(lineupAnimationTimer);
            lineupAnimationTimer = null;
        }
        lineupAnimationMode = mode;

        if (mode === 'exit') {
            buildExitLayer();
        } else if (exitLayer) {
            exitLayer.innerHTML = '';
        }

        const slots = document.querySelectorAll('.page3-spirit-slot');
        slots.forEach(slotEl => {
            const side = slotEl.dataset.side;
            const slot = Number(slotEl.dataset.slot || 0);
            const delayIndex = side === 'right' ? MAX_SLOTS - 1 - slot : slot;
            slotEl.style.setProperty('--page3-lineup-delay', `${delayIndex * 72}ms`);
            slotEl.classList.remove('is-lineup-entering', 'is-lineup-exiting');
            void slotEl.offsetWidth;
            if (mode === 'enter') {
                slotEl.classList.add('is-lineup-entering');
            }
        });

        if (mode === 'exit' && exitLayer) {
            const exitSlots = exitLayer.querySelectorAll('.page3-lineup-exit-slot');
            exitSlots.forEach(slotEl => {
                const side = slotEl.dataset.side;
                const slot = Number(slotEl.dataset.slot || 0);
                const delayIndex = side === 'right' ? MAX_SLOTS - 1 - slot : slot;
                slotEl.style.setProperty('--page3-lineup-delay', `${delayIndex * 72}ms`);
                void slotEl.offsetWidth;
                slotEl.classList.add('is-lineup-exiting');
            });
        }

        if (mode === 'exit') {
            lineupAnimationTimer = window.setTimeout(finishLineupAnimation, LINEUP_ANIMATION_MS + 6 * 72 + 40);
        } else {
            lineupAnimationTimer = window.setTimeout(() => {
                document.querySelectorAll('.page3-spirit-slot.is-lineup-entering').forEach(slotEl => {
                    slotEl.classList.remove('is-lineup-entering');
                });
                lineupAnimationMode = null;
                lineupAnimationTimer = null;
            }, LINEUP_ANIMATION_MS + 6 * 72 + 40);
        }
    }

    function observeMatchPhase(payload) {
        const nextPhase = getMatchPhase(payload);
        if (matchPhaseSignature === null) {
            matchPhaseSignature = nextPhase;
            return;
        }
        if (matchPhaseSignature === nextPhase) {
            return;
        }

        const previousPhase = matchPhaseSignature;
        matchPhaseSignature = nextPhase;
        if (previousPhase === 'in_progress' && nextPhase !== 'in_progress') {
            animateLineup('exit');
        } else if (previousPhase !== 'in_progress' && nextPhase === 'in_progress') {
            // 开始本局时 matches:update 先于 panel:update 到达，等阵容 DOM 更新后再播放。
            window.setTimeout(() => animateLineup('enter'), 0);
        }
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
        observeMatchPhase(payload);
        setPage3SpriteSource(payload && payload.stage ? payload.stage.page3SpriteSource : 'sprite');
        renderScoreboard(payload ? payload.scoreboard : null);
        renderAvatars(payload ? payload.avatars : null);
        renderNextGame(payload ? payload.nextgame : null);
        renderPanel('left', panels.find(panel => panel && panel.position === 'left'));
        renderPanel('right', panels.find(panel => panel && panel.position === 'right'));
    }

    function setPage3SpriteSource(source) {
        const nextSource = source === 'thumbnail' ? 'thumbnail' : 'sprite';
        if (page3SpriteSource === nextSource) {
            return;
        }
        page3SpriteSource = nextSource;
        panelStates.left.signatures.fill(null);
        panelStates.right.signatures.fill(null);
        renderPanel('left', panelDataCache.left);
        renderPanel('right', panelDataCache.right);
    }

    // 设置下场对局选手名字：超过 5 个字时开启横向滚动
    function setNextGameName(nameEl, text) {
        const inner = nameEl.querySelector('.page3-nextgame-name-inner');
        const nameText = String(text || '');

        if (inner) {
            inner.textContent = nameText;
        } else {
            nameEl.textContent = nameText;
        }

        nameEl.classList.toggle('is-scrolling', nameText.length > 5);

        if (!inner || !nameEl.classList.contains('is-scrolling')) {
            nameEl.style.removeProperty('--marquee-offset');
            return;
        }

        // The text remains centered at rest, so only half of its overflow is
        // needed to bring either edge into view.
        const overflow = inner.scrollWidth - nameEl.clientWidth;
        if (overflow > 0) {
            const offset = Math.ceil(overflow / 2);
            nameEl.style.setProperty('--marquee-offset', `-${offset}px`);
        } else {
            nameEl.style.removeProperty('--marquee-offset');
        }
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
        const wasVisible = !el.hidden;

        // 退场：先播放滑出动画，动画结束后再真正隐藏
        if (!isVisible && wasVisible) {
            el.hidden = false;
            el.classList.add('is-exiting');
            el.addEventListener('animationend', function handleExit() {
                el.classList.remove('is-exiting');
                el.hidden = true;
                el.removeEventListener('animationend', handleExit);
            });
            return;
        }

        if (!isVisible) {
            el.hidden = true;
            el.classList.remove('is-exiting');
            return;
        }

        // 进场：显示并触发从右到左滑入动画
        el.hidden = false;
        el.classList.remove('is-exiting');

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
        const [imagesResponse, scoreboardResponse, avatarsResponse, nextgameResponse, matchesResponse] = await Promise.all([
            fetch('api/images'),
            fetch('api/scoreboard'),
            fetch('api/avatars'),
            fetch('api/nextgame'),
            fetch('api/matches')
        ]);

        const [imagesData, scoreboardData, avatarsData, nextgameData, matchesData] = await Promise.all([
            imagesResponse.json(),
            scoreboardResponse.json(),
            avatarsResponse.json(),
            nextgameResponse.json(),
            matchesResponse.json()
        ]);

        applySnapshot({
            panels: imagesData.images || [],
            scoreboard: scoreboardData,
            avatars: avatarsData,
            nextgame: nextgameData,
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
                renderPanel(payload.panel.position, payload.panel);
            }
        });

        socket.on('scoreboard:update', payload => {
            renderScoreboard(payload ? payload.scoreboard : null);
        });

        socket.on('avatar:update', payload => {
            renderAvatars(payload ? payload.avatars : null);
        });

        socket.on('matches:update', payload => {
            observeMatchPhase({ matches: payload ? payload.matches : null });
        });

        socket.on('stage:update', payload => {
            const stage = payload && payload.stage ? payload.stage : payload;
            setPage3SpriteSource(stage && stage.page3SpriteSource);
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
