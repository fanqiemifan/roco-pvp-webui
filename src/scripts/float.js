(function () {
    'use strict';

    const MAX_SLOTS = 6;
    const THUMBNAIL_RESOURCE_BASE = '/resources/Thumbnail';
    const FALLBACK_IMG = '/assets/ui/back.png';

    const state = {
        left: null,
        right: null,
        busy: false,
    };

    const stage = document.getElementById('floatStage');
    const lineupDiv = document.querySelector('.lineup-all-div');
    const closeBtn = document.getElementById('floatCloseBtn');
    const lineupSections = {
        left: document.querySelector('.lineup-left'),
        right: document.querySelector('.lineup-right'),
    };
    const menuEl = document.getElementById('floatMenu');
    const pickerEl = document.getElementById('floatPicker');
    const pickerSearch = document.getElementById('floatPickerSearch');
    const pickerStrip = document.getElementById('floatPickerStrip');

    let spriteCache = [];
    let menuTarget = null;

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

    function getSpriteDisplayName(sprite) {
        if (!sprite || typeof sprite !== 'object') {
            return '';
        }
        return String(sprite.cardName || sprite.displayName || sprite.chineseName || sprite.name || basename(sprite.path) || '').trim();
    }

    function getSpriteForm(sprite) {
        return sprite && sprite.form ? String(sprite.form).trim() : '';
    }

    function buildThumbnailCandidates(sprite) {
        const thumbnailId = String(sprite && sprite.thumbnailId ? sprite.thumbnailId : '').trim();
        if (!thumbnailId) {
            return [];
        }
        const candidateNames = [
            sprite && sprite.cardName,
            sprite && sprite.displayName,
            sprite && sprite.chineseName,
            sprite && sprite.name,
            sprite && sprite.path ? basename(sprite.path) : '',
        ]
            .map((value) => sanitizeFilenameSegment(value))
            .filter(Boolean);
        return Array.from(new Set(candidateNames)).map((name) => `${THUMBNAIL_RESOURCE_BASE}/${thumbnailId}_${name}.png`);
    }

    function applySpriteImage(imgEl, sprite) {
        const fallbackSrc = sprite && sprite.path ? String(sprite.path) : '';
        const thumbnailCandidates = buildThumbnailCandidates(sprite).filter((path) => !unavailableThumbnailPaths.has(path));
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

    function buildSlotEl(side, index) {
        const el = document.createElement('div');
        el.className = 'petsdiv3 is-empty';
        el.dataset.side = side;
        el.dataset.slot = String(index);
        el.innerHTML = '<img alt="" />';
        el.addEventListener('click', () => {
            closeMenu();
            closePicker();
            void toggleDead(side, index);
        });
        el.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            closePicker();
            openMenu(side, index, event.clientX, event.clientY);
        });
        return el;
    }

    function renderSlot(slotEl, slotData) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;
        const isDead = Boolean(sprite && Number(slotData.healthPercent) <= 0);

        slotEl.classList.toggle('is-active', Boolean(sprite));
        slotEl.classList.toggle('is-empty', !sprite);
        slotEl.classList.toggle('is-dead', isDead);

        const imgEl = slotEl.querySelector('img');
        if (sprite) {
            imgEl.alt = getSpriteDisplayName(sprite);
            applySpriteImage(imgEl, sprite);
            slotEl.title = `${getSpriteDisplayName(sprite)}（点击${isDead ? '复活' : '阵亡'} · 右键更换）`;
        } else {
            imgEl.removeAttribute('src');
            imgEl.onerror = null;
            imgEl.alt = '';
            slotEl.title = '右键添加精灵';
        }
    }

    function renderPanel(side) {
        const panel = state[side];
        const section = lineupSections[side];
        const selected = panel && Array.isArray(panel.selected) ? panel.selected : [];

        for (let index = 0; index < MAX_SLOTS; index += 1) {
            renderSlot(section.children[index], selected[index] || null);
        }
    }

    function applyPanels(panels) {
        if (!panels || !Array.isArray(panels)) {
            return;
        }
        panels.forEach((panel) => {
            if (panel && (panel.position === 'left' || panel.position === 'right')) {
                state[panel.position] = panel;
                renderPanel(panel.position);
            }
        });
    }

    async function requestJson(url, options) {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
        }
        return response.json();
    }

    function buildSlotPayload(slotData, overrides) {
        return {
            slot: slotData ? slotData.slot : 0,
            sprite: overrides.sprite ?? (slotData && slotData.sprite ? slotData.sprite.id : null),
            opacityEnabled: Boolean(slotData && slotData.opacityEnabled),
            opacity: Number(slotData && slotData.opacity) || 1,
            saturation: Number(slotData && slotData.saturation) || 1,
            healthEnabled: typeof overrides.healthEnabled === 'boolean' ? overrides.healthEnabled : (slotData ? slotData.healthEnabled !== false : true),
            healthPercent: typeof overrides.healthPercent === 'number' ? overrides.healthPercent : (slotData ? Number(slotData.healthPercent) : 100),
            energyValue: typeof overrides.energyValue === 'number' ? overrides.energyValue : (slotData ? Number(slotData.energyValue) : 10),
        };
    }

    async function toggleDead(side, slotIndex) {
        if (state.busy) {
            return;
        }
        const panel = state[side];
        const slotData = panel && Array.isArray(panel.selected) ? panel.selected[slotIndex] : null;
        if (!slotData || !slotData.sprite) {
            return;
        }

        state.busy = true;
        const nextHealth = Number(slotData.healthPercent) > 0 ? 0 : 100;
        try {
            await requestJson(`/api/panels/${side}/slots/${slotIndex}`, {
                method: 'PATCH',
                body: JSON.stringify({ slot: buildSlotPayload(slotData, { healthPercent: nextHealth }) }),
            });
        } catch (error) {
            console.error('阵亡切换失败:', error);
        } finally {
            state.busy = false;
        }
    }

    async function replaceSlot(side, slotIndex, spriteId) {
        const panel = state[side];
        const slotData = panel && Array.isArray(panel.selected) ? panel.selected[slotIndex] : null;
        try {
            await requestJson(`/api/panels/${side}/slots/${slotIndex}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    slot: buildSlotPayload(slotData, {
                        sprite: spriteId,
                        healthEnabled: true,
                        healthPercent: 100,
                        energyValue: 10,
                    }),
                }),
            });
        } catch (error) {
            console.error('更换精灵失败:', error);
        } finally {
            closeMenu();
            closePicker();
        }
    }

    async function loadSprites() {
        if (spriteCache.length > 0) {
            return;
        }
        try {
            const data = await requestJson('/api/sprites');
            spriteCache = Array.isArray(data.sprites) ? data.sprites : [];
        } catch (error) {
            console.error('精灵列表加载失败:', error);
        }
    }

    // ---------- 右键菜单 ----------
    function closeMenu() {
        menuEl.hidden = true;
        menuEl.innerHTML = '';
        menuTarget = null;
    }

    function openMenu(side, slotIndex, clientX, clientY) {
        closePicker();
        const panel = state[side];
        const slotData = panel && Array.isArray(panel.selected) ? panel.selected[slotIndex] : null;
        const currentSprite = slotData && slotData.sprite ? slotData.sprite : null;

        menuTarget = { side, slotIndex };

        const build = document.createDocumentFragment();

        if (currentSprite) {
            const title = document.createElement('div');
            title.className = 'float-menu-title';
            title.textContent = `${getSpriteDisplayName(currentSprite)}${getSpriteForm(currentSprite) ? `（${getSpriteForm(currentSprite)}）` : ''}`;
            build.appendChild(title);

            const sameNumber = typeof currentSprite.number === 'number'
                ? spriteCache.filter((sprite) => sprite.number === currentSprite.number && sprite.id !== currentSprite.id)
                : [];

            if (sameNumber.length > 0) {
                const section = document.createElement('div');
                section.className = 'float-menu-section';
                section.textContent = '其他形态';
                build.appendChild(section);

                sameNumber.slice(0, 30).forEach((sprite) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'float-menu-item';
                    button.innerHTML = '<img alt="" /><span class="float-menu-item-text"></span>';
                    const img = button.querySelector('img');
                    img.src = sprite.path || FALLBACK_IMG;
                    img.alt = getSpriteDisplayName(sprite);
                    const text = button.querySelector('.float-menu-item-text');
                    text.textContent = getSpriteDisplayName(sprite);
                    const form = getSpriteForm(sprite);
                    if (form) {
                        const formTag = document.createElement('span');
                        formTag.className = 'float-menu-item-form';
                        formTag.textContent = form;
                        button.appendChild(formTag);
                    }
                    button.addEventListener('click', () => {
                        void replaceSlot(side, slotIndex, sprite.id);
                    });
                    build.appendChild(button);
                });
            } else {
                const hint = document.createElement('div');
                hint.className = 'float-menu-hint';
                hint.textContent = '该精灵没有其他形态';
                build.appendChild(hint);
            }

            const divider = document.createElement('div');
            divider.className = 'float-menu-divider';
            build.appendChild(divider);
        } else {
            const hint = document.createElement('div');
            hint.className = 'float-menu-title';
            hint.textContent = '添加精灵';
            build.appendChild(hint);
        }

        const newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.className = 'float-menu-item';
        newButton.textContent = '更换一只全新精灵…';
        newButton.addEventListener('click', () => {
            closeMenu();
            openPicker(side, slotIndex);
        });
        build.appendChild(newButton);

        menuEl.innerHTML = '';
        menuEl.appendChild(build);
        menuEl.hidden = false;

        menuEl.style.left = '0px';
        menuEl.style.top = '0px';
        const rect = menuEl.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const left = Math.max(2, Math.min(clientX, winW - rect.width - 2));
        const top = Math.max(2, Math.min(clientY, winH - rect.height - 2));
        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;
    }

    // ---------- 更换精灵选择器 ----------
    function closePicker() {
        pickerEl.hidden = true;
        pickerStrip.innerHTML = '';
        pickerSearch.value = '';
    }

    function openPicker(side, slotIndex) {
        closeMenu();
        void loadSprites().then(() => {
            if (!pickerEl.hidden) {
                renderPickerStrip();
            }
        });
        pickerEl.hidden = false;
        pickerSearch.focus();
        renderPickerStrip();
    }

    function renderPickerStrip() {
        const keyword = pickerSearch.value.trim().toLowerCase();
        const results = keyword
            ? spriteCache.filter((sprite) => {
                const haystack = [
                    sprite.displayName,
                    sprite.chineseName,
                    sprite.name,
                    sprite.filename,
                    sprite.aliases ? sprite.aliases.join(' ') : '',
                ].join(' ').toLowerCase();
                return haystack.includes(keyword);
            })
            : spriteCache;

        pickerStrip.innerHTML = '';
        if (results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'float-picker-empty';
            empty.textContent = '没有匹配的精灵';
            pickerStrip.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        results.slice(0, 120).forEach((sprite) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'float-picker-item';
            item.innerHTML = '<img alt="" /><span></span>';
            const img = item.querySelector('img');
            img.src = sprite.path || FALLBACK_IMG;
            img.alt = getSpriteDisplayName(sprite);
            const text = item.querySelector('span');
            text.textContent = getSpriteDisplayName(sprite);
            item.title = `${getSpriteDisplayName(sprite)}${getSpriteForm(sprite) ? `（${getSpriteForm(sprite)}）` : ''}`;
            item.addEventListener('click', () => {
                if (menuTarget) {
                    void replaceSlot(menuTarget.side, menuTarget.slotIndex, sprite.id);
                }
            });
            fragment.appendChild(item);
        });
        pickerStrip.appendChild(fragment);
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }
        const socket = io({
            transports: ['websocket', 'polling'],
        });

        socket.on('snapshot', (payload) => {
            if (payload && Array.isArray(payload.panels)) {
                applyPanels(payload.panels);
            }
        });

        socket.on('panel:update', (payload) => {
            if (payload && payload.panel) {
                applyPanels([payload.panel]);
            }
        });
    }

    closeBtn.addEventListener('click', () => {
        if (window.rocoFloat && typeof window.rocoFloat.close === 'function') {
            window.rocoFloat.close();
            return;
        }
        window.close();
    });

    document.getElementById('floatPickerClose').addEventListener('click', closePicker);

    pickerSearch.addEventListener('input', () => {
        renderPickerStrip();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (!pickerEl.hidden) {
                closePicker();
            } else {
                closeMenu();
            }
        }
    });

    document.addEventListener('click', (event) => {
        if (!menuEl.hidden && !menuEl.contains(event.target)) {
            closeMenu();
        }
    });

    document.addEventListener('contextmenu', (event) => {
        if (!pickerEl.hidden && !pickerEl.contains(event.target)) {
            closePicker();
        }
    });

    function reportStageShape() {
        if (!window.rocoFloat || typeof window.rocoFloat.reportShape !== 'function') {
            return;
        }
        const rect = lineupDiv.getBoundingClientRect();
        window.rocoFloat.reportShape({
            x: Math.floor(rect.left),
            y: Math.floor(rect.top),
            width: Math.ceil(rect.right) - Math.floor(rect.left),
            height: Math.ceil(rect.bottom) - Math.floor(rect.top),
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        for (let index = 0; index < MAX_SLOTS; index += 1) {
            lineupSections.left.appendChild(buildSlotEl('left', index));
            lineupSections.right.appendChild(buildSlotEl('right', index));
        }
        void loadSprites();
        connectSocket();
        window.requestAnimationFrame(() => {
            reportStageShape();
            window.setTimeout(reportStageShape, 500);
        });
    });
})();
