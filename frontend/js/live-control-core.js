/**
 * live-control-core.js
 * 洛克王国PVP 数值实时控制核心逻辑
 * 被 live-control.html 和 admin.html 共用
 */

(function (global) {
    'use strict';

    const MAX_SELECTION = 6;

    // 状态（内部）
    const _state = { left: [], right: [] };
    const _dirty = { left: false, right: false };
    let _saveTimer = null;
    let _isLoading = false;
    let _lastPanelMtime = { left: null, right: null };
    let _socket = null;

    // 配置（初始化时设置）
    let _config = {
        statusElementId: 'status',
        leftGridId: 'leftGrid',
        rightGridId: 'rightGrid',
        saveBtnId: 'saveBtn',
        reloadBtnId: 'reloadBtn',
        autoRefresh: true,
        autoRefreshInterval: 1500,
        autoSaveDelay: 800,
        onStatusChange: null
    };

    // ==================== 工具函数 ====================

    function normalizeSlot(slot, index) {
        return {
            slot: index,
            sprite: slot && slot.sprite ? slot.sprite : null,
            opacityEnabled: !!(slot && slot.opacityEnabled),
            opacity: typeof (slot && slot.opacity) === 'number' ? slot.opacity : 1,
            saturation: typeof (slot && slot.saturation) === 'number' ? slot.saturation : 1,
            healthEnabled: typeof (slot && slot.healthEnabled) === 'boolean'
                ? slot.healthEnabled
                : (typeof (slot && slot.protectionEnabled) === 'boolean' ? slot.protectionEnabled : true),
            healthPercent: typeof (slot && slot.healthPercent) === 'number'
                ? slot.healthPercent
                : (typeof (slot && slot.protectionPercent) === 'number' ? slot.protectionPercent : 100),
            energyValue: typeof (slot && slot.energyValue) === 'number' ? slot.energyValue : 10
        };
    }

    function clamp(num, min, max) {
        return Math.min(max, Math.max(min, num));
    }

    function setStatus(message) {
        const el = document.getElementById(_config.statusElementId);
        if (el) el.textContent = message;
        if (_config.onStatusChange) _config.onStatusChange(message);
    }

    function toPercent(value, max) {
        if (!max) return '0%';
        return `${(clamp(Number(value) || 0, 0, max) / max) * 100}%`;
    }

    // ==================== 渲染 ====================

    function renderGrid(panel) {
        const containerId = panel === 'left' ? _config.leftGridId : _config.rightGridId;
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        _state[panel].forEach((slot, index) => {
            const card = document.createElement('div');
            card.className = 'slot-card';
            card.dataset.panel = panel;
            card.dataset.index = String(index);
            if (panel === 'right') {
                card.classList.add('slot-card-right');
            }
            const spriteName = slot.sprite ? slot.sprite.displayName : '空槽位';
            const spriteHtml = slot.sprite
                ? `<div class="sprite-preview"><img src="${slot.sprite.path}" alt="${spriteName}"></div>`
                : `<div class="sprite-preview"><div class="sprite-empty">空槽位</div></div>`;
            card.innerHTML = `
                <div class="slot-preview-wrap">
                    <span class="slot-index">${index + 1}</span>
                    ${spriteHtml}
                    <span class="slot-name">${spriteName}</span>
                </div>
                <div class="slot-main">
                    <div class="form-row">
                        <div class="range-line">
                            <div class="range-shell range-shell-health" style="--percent:${toPercent(slot.healthPercent, 100)};">
                                <input class="health-range" type="range" min="0" max="100" value="${slot.healthPercent}" data-panel="${panel}" data-index="${index}" data-field="healthPercent">
                            </div>
                            <input class="value-input" id="${panel}-${index}-hp-text" type="number" min="0" max="100" value="${slot.healthPercent}" data-panel="${panel}" data-index="${index}" data-field="healthPercent">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="range-line">
                            <div class="range-shell range-shell-energy" style="--percent:${toPercent(slot.energyValue, 10)};">
                                <input class="energy-range" type="range" min="0" max="10" value="${slot.energyValue}" data-panel="${panel}" data-index="${index}" data-field="energyValue">
                            </div>
                            <input class="value-input" id="${panel}-${index}-energy-text" type="number" min="0" max="10" value="${slot.energyValue}" data-panel="${panel}" data-index="${index}" data-field="energyValue">
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function syncSlotView(panel, index, field) {
        const card = document.querySelector(`.slot-card[data-panel="${panel}"][data-index="${index}"]`);
        if (!card) return;

        const slot = _state[panel][index];
        const hpText = card.querySelector(`#${panel}-${index}-hp-text`);
        const energyText = card.querySelector(`#${panel}-${index}-energy-text`);
        const hpRange = card.querySelector('input[type="range"][data-field="healthPercent"]');
        const energyRange = card.querySelector('input[type="range"][data-field="energyValue"]');
        const hpShell = hpRange ? hpRange.closest('.range-shell') : null;
        const energyShell = energyRange ? energyRange.closest('.range-shell') : null;

        if (field === 'healthPercent' || field === 'all') {
            if (hpText && hpText.value !== String(slot.healthPercent)) hpText.value = String(slot.healthPercent);
            if (hpRange && hpRange.value !== String(slot.healthPercent)) hpRange.value = String(slot.healthPercent);
            if (hpShell) hpShell.style.setProperty('--percent', toPercent(slot.healthPercent, 100));
        }

        if (field === 'energyValue' || field === 'all') {
            if (energyText && energyText.value !== String(slot.energyValue)) energyText.value = String(slot.energyValue);
            if (energyRange && energyRange.value !== String(slot.energyValue)) energyRange.value = String(slot.energyValue);
            if (energyShell) energyShell.style.setProperty('--percent', toPercent(slot.energyValue, 10));
        }
    }

    function renderAll() {
        renderGrid('left');
        renderGrid('right');
    }

    function renderPanel(panel) {
        renderGrid(panel);
    }

    // ==================== 业务逻辑 ====================

    function updateSlot(panel, index, field, value) {
        const next = [..._state[panel]];
        const current = { ...next[index] };
        current[field] = field === 'healthPercent'
            ? clamp(Math.round(Number(value) || 0), 0, 100)
            : clamp(Math.round(Number(value) || 0), 0, 10);
        next[index] = current;
        _state[panel] = next;
        _dirty[panel] = true;
        syncSlotView(panel, index, field);
        scheduleAutoSave();
    }

    function scheduleAutoSave() {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => saveAll(true), _config.autoSaveDelay);
    }

    async function savePanel(panel) {
        const res = await fetch(`api/panels/${panel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selected: _state[panel].map(slot => ({
                    slot: slot.slot,
                    sprite: slot.sprite ? slot.sprite.id : null,
                    opacityEnabled: !!slot.opacityEnabled,
                    opacity: slot.opacity,
                    saturation: slot.saturation,
                    healthEnabled: !!slot.healthEnabled,
                    healthPercent: slot.healthPercent,
                    energyValue: slot.energyValue
                }))
            })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || '保存失败');
        }
        _state[panel] = (data.panel.selected || []).slice(0, MAX_SELECTION).map(normalizeSlot);
        _dirty[panel] = false;
        _lastPanelMtime[panel] = data.panel.mtime ?? null;
    }

    async function saveAll(auto = false) {
        try {
            await savePanel('left');
            await savePanel('right');
            setStatus(auto ? '自动保存成功' : '手动保存成功');
        } catch (error) {
            setStatus(error.message);
        }
    }

    async function loadData(options = {}) {
        const { silent = false, force = false, panel = null } = options;
        if (_isLoading) return;
        _isLoading = true;

        try {
            if (!silent) setStatus('加载中...');

            const res = await fetch('api/images');
            const data = await res.json();
            const images = Array.isArray(data.images) ? data.images : [];

            images.forEach(item => {
                if (!item || (panel && item.position !== panel)) {
                    return;
                }
                if (!force && _dirty[item.position]) {
                    return;
                }
                _state[item.position] = Array.from(
                    { length: MAX_SELECTION },
                    (_, index) => normalizeSlot(item.selected[index], index)
                );
                _dirty[item.position] = false;
                _lastPanelMtime[item.position] = item.mtime ?? null;
                renderPanel(item.position);
            });

            if (!silent) {
                setStatus('已加载');
            }
        } finally {
            _isLoading = false;
        }
    }

    function applyRemotePanel(panelState) {
        const panel = panelState && panelState.position;
        if (!panel || !Array.isArray(panelState.selected)) return;
        if (_dirty[panel]) return;

        const nextMtime = panelState.mtime ?? null;
        if (_lastPanelMtime[panel] === nextMtime && _state[panel].length) {
            return;
        }

        _state[panel] = Array.from(
            { length: MAX_SELECTION },
            (_, index) => normalizeSlot(panelState.selected[index], index)
        );
        _dirty[panel] = false;
        _lastPanelMtime[panel] = nextMtime;
        renderPanel(panel);
    }

    function connectSocket() {
        if (typeof global.io !== 'function') {
            return;
        }

        _socket = global.io({
            transports: ['websocket', 'polling']
        });

        _socket.on('snapshot', payload => {
            const panels = payload && Array.isArray(payload.panels) ? payload.panels : [];
            panels.forEach(applyRemotePanel);
            setStatus('已连接实时同步');
        });

        _socket.on('panel:update', payload => {
            if (payload && payload.panel) {
                applyRemotePanel(payload.panel);
            }
        });

        _socket.on('connect_error', () => {
            setStatus('实时同步连接失败');
        });
    }

    // ==================== 事件处理 ====================

    function handleInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.dataset.panel) return;
        updateSlot(target.dataset.panel, Number(target.dataset.index), target.dataset.field, target.value);
    }

    function handleSave() {
        saveAll(false);
    }

    function handleReload() {
        loadData({ force: true });
    }

    function handleFocus() {
        loadData({ silent: true, force: !_dirty.left && !_dirty.right }).catch(error => setStatus(error.message));
    }

    // ==================== 公开 API ====================

    /**
     * 初始化数值实时控制
     * @param {Object} options 配置项
     */
    function initLiveControl(options) {
        _config = { ..._config, ...options };

        // 绑定事件
        document.addEventListener('input', handleInput);

        const saveBtn = document.getElementById(_config.saveBtnId);
        if (saveBtn) saveBtn.addEventListener('click', handleSave);

        const reloadBtn = document.getElementById(_config.reloadBtnId);
        if (reloadBtn) reloadBtn.addEventListener('click', handleReload);

        window.addEventListener('focus', handleFocus);

        // 启动
        loadData({ force: true }).catch(error => setStatus(error.message));
        connectSocket();
    }

    /**
     * 销毁，清理事件和定时器
     */
    function destroyLiveControl() {
        clearTimeout(_saveTimer);
        document.removeEventListener('input', handleInput);
        window.removeEventListener('focus', handleFocus);
        if (_socket) {
            _socket.disconnect();
            _socket = null;
        }
    }

    // 导出
    global.LiveControl = {
        init: initLiveControl,
        destroy: destroyLiveControl,
        loadData,
        saveAll,
        getState: () => ({ left: _state.left, right: _state.right }),
        isDirty: () => ({ left: _dirty.left, right: _dirty.right })
    };

})(window);
