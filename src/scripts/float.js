(function () {
    'use strict';

    const MAX_SLOTS = 6;
    const FALLBACK_IMG = '/assets/ui/back.png';

    const state = {
        left: null,
        right: null,
        busy: false,
    };

    const stage = document.getElementById('floatStage');
    const closeBtn = document.getElementById('floatCloseBtn');
    const slotContainers = {
        left: document.querySelector('.float-slots[data-side="left"]'),
        right: document.querySelector('.float-slots[data-side="right"]'),
    };

    function spriteName(sprite) {
        if (!sprite || typeof sprite !== 'object') {
            return '';
        }
        return String(sprite.displayName || sprite.chineseName || sprite.cardName || sprite.name || '').trim();
    }

    function buildSlotEl(side, index) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'float-slot is-empty';
        el.innerHTML = '<img alt="" /><span class="float-slot-name"></span>';
        el.addEventListener('click', () => {
            void toggleDead(side, index);
        });
        return el;
    }

    function renderPanel(side) {
        const panel = state[side];
        const container = slotContainers[side];
        const selected = panel && Array.isArray(panel.selected) ? panel.selected : [];
        const slotEls = container.children;

        for (let index = 0; index < MAX_SLOTS; index += 1) {
            const slotEl = slotEls[index];
            const slotData = selected[index] || null;
            const sprite = slotData && slotData.sprite ? slotData.sprite : null;
            const imgEl = slotEl.querySelector('img');
            const nameEl = slotEl.querySelector('.float-slot-name');

            slotEl.classList.toggle('is-empty', !sprite);
            slotEl.classList.toggle('is-dead', Boolean(sprite && Number(slotData.healthPercent) <= 0));

            if (sprite) {
                const name = spriteName(sprite);
                imgEl.alt = name;
                if (imgEl.src !== sprite.path) {
                    imgEl.src = sprite.path || FALLBACK_IMG;
                }
                imgEl.onerror = () => {
                    if (imgEl.src !== FALLBACK_IMG) {
                        imgEl.src = FALLBACK_IMG;
                    }
                };
                nameEl.textContent = name;
                slotEl.title = `${name}（点击${Number(slotData.healthPercent) <= 0 ? '复活' : '阵亡'}）`;
            } else {
                imgEl.removeAttribute('src');
                imgEl.onerror = null;
                nameEl.textContent = '空位';
                slotEl.title = '';
            }
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
        const payload = {
            slot: slotIndex,
            sprite: slotData.sprite.id,
            opacityEnabled: Boolean(slotData.opacityEnabled),
            opacity: Number(slotData.opacity),
            saturation: Number(slotData.saturation),
            healthEnabled: slotData.healthEnabled !== false,
            healthPercent: nextHealth,
            energyValue: Number(slotData.energyValue),
        };

        try {
            const response = await fetch(`/api/panels/${side}/slots/${slotIndex}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot: payload }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('阵亡切换失败:', error);
        } finally {
            state.busy = false;
        }
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

    function reportStageShape() {
        if (!window.rocoFloat || typeof window.rocoFloat.reportShape !== 'function') {
            return;
        }
        const rect = stage.getBoundingClientRect();
        window.rocoFloat.reportShape({
            x: Math.floor(rect.left),
            y: Math.floor(rect.top),
            width: Math.ceil(rect.right) - Math.floor(rect.left),
            height: Math.ceil(rect.bottom) - Math.floor(rect.top),
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        slotContainers.left.innerHTML = '';
        slotContainers.right.innerHTML = '';
        for (let index = 0; index < MAX_SLOTS; index += 1) {
            slotContainers.left.appendChild(buildSlotEl('left', index));
            slotContainers.right.appendChild(buildSlotEl('right', index));
        }
        connectSocket();
        window.requestAnimationFrame(() => {
            reportStageShape();
            window.setTimeout(reportStageShape, 500);
        });
    });
})();
