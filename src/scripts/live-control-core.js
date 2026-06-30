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
    let _liveConfigWriteTimer = null;
    const _slotPatchTimers = { left: new Map(), right: new Map() };
    const _liveConfig = {
        enabled: false,
        fileHandle: null,
        filePath: null,
        pollTimer: null,
        lastModified: null,
        lastContent: '',
        isApplying: false,
        isWriting: false
    };

    // 配置（初始化时设置）
    let _config = {
        statusElementId: 'status',
        leftGridId: 'leftGrid',
        rightGridId: 'rightGrid',
        saveBtnId: 'saveBtn',
        reloadBtnId: 'reloadBtn',
        exportConfigBtnId: null,
        liveListenBtnId: null,
        liveFileStatusId: null,
        autoRefresh: true,
        autoRefreshInterval: 1500,
        autoSaveDelay: 800,
        liveConfigPollInterval: 1000,
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

    function setLiveFileStatus(message) {
        const el = _config.liveFileStatusId ? document.getElementById(_config.liveFileStatusId) : null;
        if (el) el.textContent = message || '';
    }

    function setLiveListenButton(active) {
        const btn = _config.liveListenBtnId ? document.getElementById(_config.liveListenBtnId) : null;
        if (!btn) return;
        btn.textContent = active ? '关闭监听' : '实时监听';
        btn.classList.toggle('btn-warning', !active);
        btn.classList.toggle('btn-danger', active);
    }

    function cleanSpriteName(value) {
        return String(value || '')
            .trim()
            .replace(/\.(png|jpe?g|webp)$/i, '')
            .replace(/^NO\.\d+_/i, '')
            .replace(/[-_]\d+$/u, '');
    }

    function getSlotName(slot) {
        const sprite = slot && slot.sprite;
        if (!sprite) return '';
        return cleanSpriteName(sprite.displayName || sprite.chineseName || sprite.name || sprite.filename || sprite.id);
    }

    function liveConfigPayload() {
        const mapSlot = slot => ({
            name: getSlotName(slot),
            HP: clamp(Math.round(Number(slot.healthPercent) || 0), 0, 100),
            value: clamp(Math.round(Number(slot.energyValue) || 0), 0, 10)
        });

        return {
            left: _state.left.filter(slot => slot && slot.sprite).map(mapSlot),
            right: _state.right.filter(slot => slot && slot.sprite).map(mapSlot)
        };
    }

    function stringifyLiveConfig() {
        return JSON.stringify(liveConfigPayload(), null, 2);
    }

    async function verifyFilePermission(fileHandle, mode = 'read') {
        if (!fileHandle || typeof fileHandle.queryPermission !== 'function') {
            return true;
        }

        const options = { mode };
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        if (typeof fileHandle.requestPermission !== 'function') {
            return false;
        }
        return (await fileHandle.requestPermission(options)) === 'granted';
    }

    function downloadLiveConfig(text) {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'roco-live-config.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function getLiveConfigFileName(filePath) {
        return String(filePath || '').split(/[\\/]/).pop() || 'roco-live-config.json';
    }

    async function readLiveConfigSource() {
        if (_liveConfig.fileHandle) {
            const file = await _liveConfig.fileHandle.getFile();
            return {
                name: file.name,
                text: await file.text(),
                lastModified: file.lastModified
            };
        }

        if (_liveConfig.filePath && window.rocoDesktop) {
            const [text, stat] = await Promise.all([
                window.rocoDesktop.readTextFile(_liveConfig.filePath),
                window.rocoDesktop.statFile(_liveConfig.filePath)
            ]);
            return {
                name: getLiveConfigFileName(_liveConfig.filePath),
                text,
                lastModified: stat.mtimeMs
            };
        }

        throw new Error('没有可用的监听文件来源');
    }

    async function writeLiveConfigToHandle(text, reason = '') {
        if (!_liveConfig.enabled || (!_liveConfig.fileHandle && !_liveConfig.filePath) || _liveConfig.isApplying) {
            return;
        }

        _liveConfig.isWriting = true;
        try {
            if (_liveConfig.fileHandle) {
                if (!(await verifyFilePermission(_liveConfig.fileHandle, 'readwrite'))) {
                    throw new Error('没有监听文件的写入权限');
                }
                const writable = await _liveConfig.fileHandle.createWritable();
                await writable.write(text);
                await writable.close();
                const file = await _liveConfig.fileHandle.getFile();
                _liveConfig.lastModified = file.lastModified;
            } else if (_liveConfig.filePath && window.rocoDesktop) {
                await window.rocoDesktop.writeTextFile(_liveConfig.filePath, text);
                const stat = await window.rocoDesktop.statFile(_liveConfig.filePath);
                _liveConfig.lastModified = stat.mtimeMs;
            }
            _liveConfig.lastContent = text;
            if (reason) setLiveFileStatus(reason);
        } finally {
            _liveConfig.isWriting = false;
        }
    }

    function scheduleLiveConfigWrite(reason = '已同步到监听文件') {
        if (!_liveConfig.enabled || _liveConfig.isApplying) return;
        clearTimeout(_liveConfigWriteTimer);
        _liveConfigWriteTimer = setTimeout(() => {
            writeLiveConfigToHandle(stringifyLiveConfig(), reason).catch(error => setStatus(error.message));
        }, 250);
    }

    function extractLiveConfigPanel(payload, panel) {
        if (!payload || typeof payload !== 'object') return null;
        const direct = payload[panel];
        if (Array.isArray(direct)) return direct;
        if (direct && Array.isArray(direct.selected)) return direct.selected;
        if (payload.panels && payload.panels[panel] && Array.isArray(payload.panels[panel])) {
            return payload.panels[panel];
        }
        return null;
    }

    function readNumberField(item, names, min, max) {
        for (const name of names) {
            if (item && item[name] !== undefined && item[name] !== null && item[name] !== '') {
                const numeric = Number(item[name]);
                if (!Number.isNaN(numeric)) {
                    return clamp(Math.round(numeric), min, max);
                }
            }
        }
        return null;
    }

    function findConfigTargetIndex(panel, item, fallbackIndex, usedIndexes) {
        const expectedName = cleanSpriteName(item && item.name);
        if (expectedName) {
            const matchIndex = _state[panel].findIndex((slot, index) => {
                return !usedIndexes.has(index) && getSlotName(slot) === expectedName;
            });
            if (matchIndex >= 0) return matchIndex;
        }
        return fallbackIndex;
    }

    async function applyLiveConfigText(text, source = '监听文件') {
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (error) {
            throw new Error(`${source} JSON 格式错误`);
        }

        _liveConfig.isApplying = true;
        try {
            let changed = false;

            ['left', 'right'].forEach(panel => {
                const panelItems = extractLiveConfigPanel(payload, panel);
                if (!Array.isArray(panelItems)) return;

                const next = [..._state[panel]];
                const usedIndexes = new Set();
                let panelChanged = false;
	                panelItems.slice(0, MAX_SELECTION).forEach((item, fallbackIndex) => {
	                    if (!item || typeof item !== 'object') return;

                    const targetIndex = findConfigTargetIndex(panel, item, fallbackIndex, usedIndexes);
                    if (targetIndex < 0 || targetIndex >= MAX_SELECTION || !next[targetIndex]) return;
                    usedIndexes.add(targetIndex);

                    const hp = readNumberField(item, ['HP', 'hp', 'healthPercent', 'health'], 0, 100);
                    const value = readNumberField(item, ['value', 'energyValue', 'energy'], 0, 10);
                    const slot = { ...next[targetIndex] };

                    if (hp !== null && slot.healthPercent !== hp) {
                        slot.healthPercent = hp;
                        panelChanged = true;
                        changed = true;
                    }
	                    if (value !== null && slot.energyValue !== value) {
	                        slot.energyValue = value;
	                        panelChanged = true;
	                        changed = true;
	                    }

	                    next[targetIndex] = slot;
	                    scheduleSlotPatch(panel, targetIndex);
	                });

                if (panelChanged) {
                    _state[panel] = next;
                    _dirty[panel] = true;
                    renderPanel(panel);
                }
	            });

	            if (changed) {
	                setStatus(`已根据${source}更新`);
	            } else {
	                setStatus(`${source}无变化`);
	            }
        } finally {
            _liveConfig.isApplying = false;
        }
    }

    async function handleExportLiveConfig() {
        const text = stringifyLiveConfig();
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    suggestedName: 'roco-live-config.json',
                    types: [
                        {
                            description: 'JSON 文件',
                            accept: { 'application/json': ['.json'] }
                        }
                    ]
                });
                if (!(await verifyFilePermission(fileHandle, 'readwrite'))) {
                    throw new Error('没有导出文件的写入权限');
                }
                const writable = await fileHandle.createWritable();
                await writable.write(text);
                await writable.close();
                setStatus('配置导出成功');
                return;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    setStatus('已取消配置导出');
                    return;
                }
                throw error;
            }
        }

        if (window.rocoDesktop && typeof window.rocoDesktop.showSaveDialog === 'function') {
            const filePath = await window.rocoDesktop.showSaveDialog();
            if (!filePath) {
                setStatus('已取消配置导出');
                return;
            }
            await window.rocoDesktop.writeTextFile(filePath, text);
            setStatus('配置导出成功');
            return;
        }

        downloadLiveConfig(text);
        setStatus('配置已下载');
    }

    async function pollLiveConfigFile() {
        if (!_liveConfig.enabled || (!_liveConfig.fileHandle && !_liveConfig.filePath) || _liveConfig.isWriting) {
            return;
        }

        try {
            const file = await readLiveConfigSource();
            const text = file.text;
            _liveConfig.lastModified = file.lastModified;
            if (text === _liveConfig.lastContent) {
                return;
            }

            _liveConfig.lastContent = text;
            await applyLiveConfigText(text, '监听文件');
        } catch (error) {
            setStatus(error.message || '监听文件读取失败');
        }
    }

    async function startLiveConfigWatch() {
        try {
            let fileHandle = null;
            let filePath = null;

            if (typeof window.showOpenFilePicker === 'function') {
                [fileHandle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [
                        {
                            description: 'JSON 文件',
                            accept: { 'application/json': ['.json'] }
                        }
                    ]
                });
            } else if (window.rocoDesktop && typeof window.rocoDesktop.showOpenDialog === 'function') {
                filePath = await window.rocoDesktop.showOpenDialog();
            } else {
                setStatus('当前环境不支持实时监听，请使用桌面应用或 Chromium 内核浏览器');
                return;
            }

            if (!fileHandle && !filePath) return;
            if (fileHandle && !(await verifyFilePermission(fileHandle, 'readwrite'))) {
                throw new Error('没有监听文件的读写权限');
            }

            _liveConfig.fileHandle = fileHandle;
            _liveConfig.filePath = filePath;
            const file = await readLiveConfigSource();
            _liveConfig.enabled = true;
            _liveConfig.lastModified = file.lastModified;
            _liveConfig.lastContent = file.text;
            setLiveListenButton(true);
            setLiveFileStatus(`监听中：${file.name}`);

            if (file.text.trim()) {
                await applyLiveConfigText(file.text, '监听文件');
            } else {
                await writeLiveConfigToHandle(stringifyLiveConfig(), `监听中：${file.name}`);
            }

            clearInterval(_liveConfig.pollTimer);
            _liveConfig.pollTimer = setInterval(pollLiveConfigFile, _config.liveConfigPollInterval);
            setStatus('实时监听已开启');
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setStatus('已取消实时监听');
                return;
            }
            stopLiveConfigWatch(false);
            setStatus(error.message || '实时监听开启失败');
        }
    }

    function stopLiveConfigWatch(shouldSave = true) {
        clearInterval(_liveConfig.pollTimer);
        clearTimeout(_liveConfigWriteTimer);
        _liveConfig.enabled = false;
        _liveConfig.fileHandle = null;
        _liveConfig.filePath = null;
        _liveConfig.pollTimer = null;
        _liveConfig.lastModified = null;
        _liveConfig.lastContent = '';
        _liveConfig.isApplying = false;
        _liveConfig.isWriting = false;
        setLiveListenButton(false);
        setLiveFileStatus('');
        if (shouldSave) {
            saveAll(false);
        }
    }

    function handleLiveConfigWatchToggle() {
        if (_liveConfig.enabled) {
            stopLiveConfigWatch(true);
            setStatus('实时监听已关闭，已恢复原有保存逻辑');
            return;
        }
        startLiveConfigWatch();
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
        const normalized = field === 'healthPercent'
            ? clamp(Math.round(Number(value) || 0), 0, 100)
            : clamp(Math.round(Number(value) || 0), 0, 10);
        current[field] = normalized;
        next[index] = current;
        _state[panel] = next;
        _dirty[panel] = true;
        syncSlotView(panel, index, field);
        if (field === 'healthPercent' || field === 'energyValue') {
            scheduleSlotPatch(panel, index);
        } else {
            scheduleAutoSave();
        }
        scheduleLiveConfigWrite();
    }

    function scheduleAutoSave() {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => saveAll(true), _config.autoSaveDelay);
    }

    async function saveSlotPatch(panel, index) {
        const slot = _state[panel] && _state[panel][index];
        if (!slot) return;

        const res = await fetch(`api/panels/${panel}/slots/${index}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                healthPercent: getHealthLevel(slot),
                energyValue: getEnergyLevel(slot)
            })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || '保存失败');
        }

        if (data.slot) {
            _state[panel][index] = normalizeSlot({ ...data.slot, slot: index }, index);
            syncSlotView(panel, index, 'all');
        }
        if (data.panel && typeof data.panel.mtime === 'number') {
            _lastPanelMtime[panel] = data.panel.mtime;
        }
        _dirty[panel] = false;
    }

    function scheduleSlotPatch(panel, index) {
        clearTimeout(_slotPatchTimers[panel].get(index));
        const timer = setTimeout(() => {
            saveSlotPatch(panel, index).catch(error => setStatus(error.message));
        }, 120);
        _slotPatchTimers[panel].set(index, timer);
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
            const panelsToSave = ['left', 'right'].filter(panel => _dirty[panel]);
            if (!panelsToSave.length) {
                if (!auto) setStatus('没有需要保存的更改');
                return;
            }
            for (const panel of panelsToSave) {
                await savePanel(panel);
            }
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
        scheduleLiveConfigWrite('后台更新已同步到监听文件');
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

    function handleExportConfigClick() {
        handleExportLiveConfig().catch(error => setStatus(error.message || '配置导出失败'));
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

        const exportConfigBtn = _config.exportConfigBtnId ? document.getElementById(_config.exportConfigBtnId) : null;
        if (exportConfigBtn) exportConfigBtn.addEventListener('click', handleExportConfigClick);

        const liveListenBtn = _config.liveListenBtnId ? document.getElementById(_config.liveListenBtnId) : null;
        if (liveListenBtn) liveListenBtn.addEventListener('click', handleLiveConfigWatchToggle);

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
        clearTimeout(_liveConfigWriteTimer);
        clearInterval(_liveConfig.pollTimer);
        _slotPatchTimers.left.forEach(timer => clearTimeout(timer));
        _slotPatchTimers.right.forEach(timer => clearTimeout(timer));
        _slotPatchTimers.left.clear();
        _slotPatchTimers.right.clear();
        document.removeEventListener('input', handleInput);
        window.removeEventListener('focus', handleFocus);
        const exportConfigBtn = _config.exportConfigBtnId ? document.getElementById(_config.exportConfigBtnId) : null;
        if (exportConfigBtn) exportConfigBtn.removeEventListener('click', handleExportConfigClick);
        const liveListenBtn = _config.liveListenBtnId ? document.getElementById(_config.liveListenBtnId) : null;
        if (liveListenBtn) liveListenBtn.removeEventListener('click', handleLiveConfigWatchToggle);
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
        exportConfig: handleExportLiveConfig,
        stopLiveConfigWatch,
        getState: () => ({ left: _state.left, right: _state.right }),
        isDirty: () => ({ left: _dirty.left, right: _dirty.right })
    };

})(window);
