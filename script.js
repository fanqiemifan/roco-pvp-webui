document.addEventListener('DOMContentLoaded', function() {
    const leftPanel = document.querySelector('.left-panel');
    const rightPanel = document.querySelector('.right-panel');
    const frame3 = document.querySelector('.frame3');
    const scoreboardEl = document.querySelector('.scoreboard');
    const centerArea = document.querySelector('.center-area');
    const leftPlayerName = document.getElementById('leftPlayerName');
    const leftPlayerScore = document.getElementById('leftPlayerScore');
    const rightPlayerName = document.getElementById('rightPlayerName');
    const rightPlayerScore = document.getElementById('rightPlayerScore');

    const panelStates = {
        left: { panelEl: leftPanel, slotSignatures: new Array(6).fill(null), panelSignature: null },
        right: { panelEl: rightPanel, slotSignatures: new Array(6).fill(null), panelSignature: null }
    };

    const WEAK_OPACITY = 0.5;
    const WEAK_SATURATION = 0.1;
    const FEATHER_PERCENT = 6;
    const PROTECTION_TRANSITION_MS = 800;

    let currentBgSignature = null;
    let currentScoreboardSignature = null;

    function clampPercent(value) {
        const number = Number(value);
        if (Number.isNaN(number)) {
            return 100;
        }
        return Math.min(100, Math.max(0, number));
    }

    function buildSlotSignature(slotData) {
        return JSON.stringify({
            sprite: slotData && slotData.sprite ? slotData.sprite.id : null,
            opacity: slotData ? slotData.effectiveOpacity : 1,
            saturation: slotData ? slotData.saturation : 1,
            healthEnabled: !!(slotData && slotData.healthEnabled),
            healthPercent: slotData ? clampPercent(slotData.healthPercent) : 100,
            energyValue: slotData && Number.isFinite(Number(slotData.energyValue)) ? Number(slotData.energyValue) : 10
        });
    }

    function buildLayer(slotEl, className) {
        const image = document.createElement('img');
        image.className = `sprite-layer ${className}`;
        image.style.transitionDuration = `${PROTECTION_TRANSITION_MS}ms`;
        slotEl.appendChild(image);
        return image;
    }

    function getBaseLayerSaturation(slotData) {
        if (!slotData || !slotData.healthEnabled) {
            return slotData && typeof slotData.saturation === 'number' ? slotData.saturation : 1;
        }
        const healthPercent = clampPercent(slotData && slotData.healthPercent);
        if (healthPercent <= 0) {
            return 0.1;
        }
        return (slotData.saturation ?? 1) * WEAK_SATURATION;
    }

    function ensureLayerPair(slotEl) {
        const baseLayer = slotEl.querySelector('.base-layer') || buildLayer(slotEl, 'base-layer');
        const protectLayer = slotEl.querySelector('.protect-layer') || buildLayer(slotEl, 'protect-layer');
        return { baseLayer, protectLayer };
    }

    function normalizeEnergyValue(value) {
        const number = Number(value);
        if (Number.isNaN(number)) {
            return 10;
        }
        return Math.min(10, Math.max(0, Math.round(number)));
    }

    function getHeartAsset(healthPercent) {
        const health = clampPercent(healthPercent);
        if (health <= 0) {
            return '/image/heart0.png';
        }
        if (health <= 10) {
            return '/image/heart10.png';
        }
        if (health <= 50) {
            return '/image/heart50.png';
        }
        return '/image/heart100.png';
    }

    function getAbilityMeta(energyValue) {
        const energy = normalizeEnergyValue(energyValue);
        if (energy <= 2) {
            return {
                className: 'danger',
                icon: '/image/start-3.png'
            };
        }
        if (energy <= 5) {
            return {
                className: 'mid',
                icon: '/image/start-2.png'
            };
        }
        return {
            className: 'high',
            icon: '/image/start-1.png'
        };
    }

    function ensureOverlay(slotEl, className, builder) {
        let overlay = slotEl.querySelector(`.${className}`);
        if (!overlay) {
            overlay = builder();
            overlay.classList.add(className);
            slotEl.appendChild(overlay);
        }
        return overlay;
    }

    function ensureSlotIndicators(slotEl) {
        const hpBadge = ensureOverlay(slotEl, 'slot-hp-badge', () => {
            const badge = document.createElement('div');
            const value = document.createElement('span');
            value.className = 'slot-hp-value';
            badge.appendChild(value);
            return badge;
        });
        const abilityBadge = ensureOverlay(slotEl, 'slot-ability-badge', () => {
            const badge = document.createElement('div');
            const icon = document.createElement('img');
            icon.className = 'slot-ability-icon';
            const value = document.createElement('span');
            value.className = 'slot-ability-value';
            badge.appendChild(icon);
            badge.appendChild(value);
            return badge;
        });
        return { hpBadge, abilityBadge };
    }

    function updateSlotIndicators(slotEl, slotData) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;
        const { hpBadge, abilityBadge } = ensureSlotIndicators(slotEl);
        const healthBadgeEnabled = document.body.dataset.healthBadgeEnabled !== '0';
        const abilityBadgeEnabled = document.body.dataset.abilityBadgeEnabled !== '0';

        if (!sprite) {
            hpBadge.classList.remove('is-visible');
            abilityBadge.classList.remove('is-visible');
            return;
        }

        const healthPercent = clampPercent(slotData.healthPercent);
        const energyValue = normalizeEnergyValue(slotData.energyValue);
        const hpValue = hpBadge.querySelector('.slot-hp-value');
        const abilityIcon = abilityBadge.querySelector('.slot-ability-icon');
        const abilityValue = abilityBadge.querySelector('.slot-ability-value');
        const abilityMeta = getAbilityMeta(energyValue);

        if (healthBadgeEnabled && healthPercent > 0) {
            hpBadge.style.backgroundImage = `url('${getHeartAsset(healthPercent)}')`;
            hpValue.textContent = String(healthPercent);
            hpBadge.classList.add('is-visible');
        } else {
            hpBadge.classList.remove('is-visible');
            hpValue.textContent = '';
        }

        if (!abilityBadgeEnabled || healthPercent <= 0) {
            abilityBadge.classList.remove('is-visible', 'high', 'mid', 'danger');
            abilityIcon.removeAttribute('src');
            abilityValue.textContent = '';
            return;
        }

        abilityBadge.classList.remove('high', 'mid', 'danger');
        abilityBadge.classList.add(abilityMeta.className, 'is-visible');
        abilityIcon.src = abilityMeta.icon;
        abilityIcon.alt = `能力值 ${energyValue}`;
        abilityValue.textContent = String(energyValue);
    }

    function applyProtectionMask(protectLayer, healthPercent) {
        const keepPercent = clampPercent(healthPercent);
        if (keepPercent >= 100) {
            protectLayer.classList.add('mask-disabled');
            protectLayer.style.setProperty('--protect-start', '0%');
            protectLayer.style.setProperty('--protect-end', '0%');
            return;
        }

        protectLayer.classList.remove('mask-disabled');

        if (keepPercent <= 0) {
            protectLayer.style.setProperty('--protect-start', '100%');
            protectLayer.style.setProperty('--protect-end', '100%');
            return;
        }

        const weakPercent = 100 - keepPercent;
        const start = Math.max(0, weakPercent - FEATHER_PERCENT);
        const end = Math.min(100, weakPercent + FEATHER_PERCENT);
        protectLayer.style.setProperty('--protect-start', `${start}%`);
        protectLayer.style.setProperty('--protect-end', `${end}%`);
    }

    function applyNoProtectionMask(protectLayer) {
        protectLayer.classList.add('mask-disabled');
        protectLayer.style.setProperty('--protect-start', '0%');
        protectLayer.style.setProperty('--protect-end', '0%');
    }

    function applyLayerStyles(baseLayer, protectLayer, slotData) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;
        if (!sprite) {
            return;
        }

        const healthEnabled = !!slotData.healthEnabled;
        const baseOpacity = healthEnabled
            ? (slotData.effectiveOpacity ?? 1) * WEAK_OPACITY
            : (slotData.effectiveOpacity ?? 1);
        const baseSaturation = getBaseLayerSaturation(slotData);

        baseLayer.alt = sprite.displayName || sprite.filename || '';
        baseLayer.style.opacity = String(baseOpacity);
        baseLayer.style.filter = `saturate(${baseSaturation})`;

        protectLayer.alt = sprite.displayName || sprite.filename || '';
        protectLayer.style.opacity = healthEnabled ? String(slotData.effectiveOpacity ?? 1) : '0';
        protectLayer.style.filter = `saturate(${slotData.saturation ?? 1})`;
        if (healthEnabled) {
            applyProtectionMask(protectLayer, slotData.healthPercent);
        } else {
            applyNoProtectionMask(protectLayer);
        }
    }

    function removeSlotLayers(slotEl) {
        slotEl.querySelectorAll('.sprite-layer').forEach(layer => {
            layer.classList.add('is-exiting');
            window.setTimeout(() => {
                if (layer.parentNode === slotEl) {
                    layer.remove();
                }
            }, 240);
        });
    }

    function setLayerSource(layer, src, alt) {
        if (layer.src.endsWith(src)) {
            layer.alt = alt;
            return false;
        }
        layer.src = src;
        layer.alt = alt;
        return true;
    }

    function applySlotUpdate(slotEl, slotData, mtime) {
        const sprite = slotData && slotData.sprite ? slotData.sprite : null;

        if (!sprite) {
            removeSlotLayers(slotEl);
            updateSlotIndicators(slotEl, null);
            return;
        }

        const cacheBuster = mtime ? Math.floor(mtime * 1000) : Date.now();
        const nextSrc = `${sprite.path}?t=${cacheBuster}`;
        const alt = sprite.displayName || sprite.filename || '';
        const { baseLayer, protectLayer } = ensureLayerPair(slotEl);

        const baseChanged = setLayerSource(baseLayer, nextSrc, alt);
        const protectChanged = setLayerSource(protectLayer, nextSrc, alt);

        if (baseChanged || protectChanged) {
            [baseLayer, protectLayer].forEach(layer => {
                layer.classList.add('is-entering');
                requestAnimationFrame(() => {
                    layer.classList.remove('is-entering');
                });
            });
        }

        applyLayerStyles(baseLayer, protectLayer, slotData);
        updateSlotIndicators(slotEl, slotData);
    }

    function renderPanel(position, data) {
        const state = panelStates[position];
        const selected = data && Array.isArray(data.selected) ? data.selected : [];
        const slots = state.panelEl.querySelectorAll('.sprite-slot');

        slots.forEach((slotEl, index) => {
            const slotData = selected[index] || null;
            const nextSignature = buildSlotSignature(slotData);

            if (state.slotSignatures[index] === nextSignature) {
                return;
            }

            applySlotUpdate(slotEl, slotData, data ? data.mtime : null);
            state.slotSignatures[index] = nextSignature;
        });

        const nextPanelSignature = JSON.stringify({
            hasImage: selected.some(slot => slot && slot.sprite)
        });

        if (state.panelSignature !== nextPanelSignature) {
            state.panelEl.classList.toggle('has-image', selected.some(slot => slot && slot.sprite));
            state.panelSignature = nextPanelSignature;
        }
    }

    function renderScoreboard(data) {
        const scoreboard = data || {};
        const nextSignature = JSON.stringify({
            leftName: scoreboard.leftName || '',
            leftScore: scoreboard.leftScore || '0',
            rightName: scoreboard.rightName || '',
            rightScore: scoreboard.rightScore || '0',
            scoreboardEnabled: scoreboard.scoreboardEnabled !== false,
            healthBadgeEnabled: scoreboard.healthBadgeEnabled !== false,
            abilityBadgeEnabled: scoreboard.abilityBadgeEnabled !== false,
            nameFontSize: scoreboard.nameFontSize || 64,
            scoreFontSize: scoreboard.scoreFontSize || 64,
            centerAreaEnabled: scoreboard.centerAreaEnabled !== false,
            centerAreaColor: scoreboard.centerAreaColor || '#393939'
        });

        if (currentScoreboardSignature === nextSignature) {
            return;
        }

        currentScoreboardSignature = nextSignature;
        const scoreboardEnabled = scoreboard.scoreboardEnabled !== false;
        const healthBadgeEnabled = scoreboard.healthBadgeEnabled !== false;
        const abilityBadgeEnabled = scoreboard.abilityBadgeEnabled !== false;
        scoreboardEl.classList.toggle('is-hidden', !scoreboardEnabled);
        leftPlayerName.textContent = scoreboard.leftName || '';
        leftPlayerScore.textContent = scoreboard.leftScore || '0';
        rightPlayerName.textContent = scoreboard.rightName || '';
        rightPlayerScore.textContent = scoreboard.rightScore || '0';
        const nameFontSize = Number(scoreboard.nameFontSize) || 64;
        const scoreFontSize = Number(scoreboard.scoreFontSize) || 64;
        [leftPlayerName, rightPlayerName].forEach(el => {
            el.style.fontSize = `${nameFontSize}px`;
        });
        [leftPlayerScore, rightPlayerScore].forEach(el => {
            el.style.fontSize = `${scoreFontSize}px`;
        });
        const centerAreaEnabled = scoreboard.centerAreaEnabled !== false;
        centerArea.classList.toggle('is-hidden', !centerAreaEnabled);
        centerArea.style.backgroundColor = centerAreaEnabled
            ? (scoreboard.centerAreaColor || '#393939')
            : 'transparent';
        document.body.dataset.healthBadgeEnabled = healthBadgeEnabled ? '1' : '0';
        document.body.dataset.abilityBadgeEnabled = abilityBadgeEnabled ? '1' : '0';
    }

    function loadImages() {
        fetch('/api/images')
            .then(response => response.json())
            .then(data => {
                const leftData = data.images.find(img => img.position === 'left');
                const rightData = data.images.find(img => img.position === 'right');

                renderPanel('left', leftData);
                renderPanel('right', rightData);
            })
            .catch(error => {
                console.error('加载图片失败:', error);
            });

        fetch('/api/background')
            .then(response => response.json())
            .then(data => {
                const newSignature = data.exists && data.path && data.mtime ? `${data.path}:${data.mtime}` : 'default';
                if (currentBgSignature === newSignature) {
                    return;
                }

                currentBgSignature = newSignature;
                if (data.exists) {
                    frame3.style.backgroundImage = `url('${data.path}?t=${Math.floor(data.mtime * 1000)}')`;
                } else {
                    frame3.style.backgroundImage = "url('image/back.png')";
                }
            })
            .catch(error => {
                console.error('加载背景图失败:', error);
            });

        fetch('/api/scoreboard')
            .then(response => response.json())
            .then(data => {
                renderScoreboard(data);
            })
            .catch(error => {
                console.error('加载比分栏失败:', error);
            });
    }

    loadImages();
    setInterval(loadImages, 5000);
});
