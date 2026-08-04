(function () {
    'use strict';

    /**
     * 推流载体脚本：负责把导播台指定的推流页面加载进全屏 iframe。
     *
     * 工作流程：
     * 1. 页面加载后通过 HTTP 拉取当前导播画面 (GET /api/stage)。
     * 2. 建立 Socket.IO 连接，监听 stage:update 事件，实时切换画面。
     * 3. 切换时做淡入淡出过渡，加载失败展示回退提示。
     *
     * 导播画面用页面 key 标识，支持的 key 与对应路径：
     *   - page1-overlay : 推流页面1（Overlay 比分栏布局）  -> /roco-overlay.html
     *   - page2         : 推流页面2（全局阵容展示）       -> /roco-pvp.html
     *   - page3         : 推流页面3（头像比分阵容）       -> /roco-pvp-page3.html
     *   - page4         : 仅显示阵容                      -> /roco-pvp-page4.html
     *   - standby       : 等待页                          -> /live-standby-demo.html
     *   - blank         : 黑场（不加载任何画面）
     */

    var STAGE_PAGES = {
        'page1-overlay': { label: '推流页面1（Overlay）', path: '/roco-overlay.html' },
        'page2': { label: '推流页面2', path: '/roco-pvp.html' },
        'page3': { label: '推流页面3', path: '/roco-pvp-page3.html' },
        'page4': { label: '仅显示阵容', path: '/roco-pvp-page4.html' },
        'standby': { label: '等待页', path: '/live-standby-demo.html' },
        'blank': { label: '黑场', path: null }
    };

    var DEFAULT_PAGE = 'page3';
    var TRANSITION_MS = 420;

    var carrier = document.getElementById('stageCarrier');
    var frame = document.getElementById('stageFrame');
    var fallback = document.getElementById('stageFallback');
    var fallbackText = document.getElementById('stageFallbackText');

    var currentPage = null;
    var socket = null;

    function resolveStage(page) {
        if (!page || typeof page !== 'string') {
            return STAGE_PAGES[DEFAULT_PAGE];
        }
        var trimmed = page.trim();
        if (STAGE_PAGES[trimmed]) {
            return STAGE_PAGES[trimmed];
        }
        // 兼容后端直接下发完整路径或相对路径
        if (/^\/[^\\]/.test(trimmed)) {
            return { label: trimmed, path: trimmed };
        }
        return STAGE_PAGES[DEFAULT_PAGE];
    }

    function applyFallback(show, text) {
        fallbackText.textContent = text || '正在等待导播画面…';
        fallback.classList.toggle('is-visible', !!show);
    }

    function setCarrierStage(page) {
        carrier.setAttribute('data-stage', page || 'blank');
    }

    function setBlank(text) {
        currentPage = 'blank';
        frame.classList.add('is-hidden');
        applyFallback(true, text || '当前为黑场');
        setCarrierStage('blank');
    }

    function loadStage(page, options) {
        var opts = options || {};
        var stage = resolveStage(page);
        var nextKey = page || DEFAULT_PAGE;

        if (stage.path === null) {
            setBlank('当前为黑场');
            return;
        }

        if (currentPage === nextKey && frame.getAttribute('src') === stage.path) {
            // 已经是目标画面，无需重复加载
            return;
        }

        currentPage = nextKey;
        setCarrierStage(nextKey);

        // 淡出当前画面
        frame.classList.add('is-hidden');

        var done = function () {
            frame.classList.remove('is-hidden');
            applyFallback(false, '');
        };

        // 切换 src 后等待 iframe 加载完成再淡入；blank 用 about:blank
        frame.onload = function () {
            // 给浏览器一帧时间应用样式后再淡入
            window.setTimeout(done, 16);
        };

        frame.onerror = function () {
            applyFallback(true, '画面加载失败：' + stage.label);
        };

        // 切换路径。先置空再赋值可强制触发某些页面的重新初始化。
        frame.setAttribute('src', stage.path);

        // 兜底：若 onload 迟迟未触发（极端情况），仍淡入避免长期黑屏
        window.setTimeout(function () {
            if (frame.classList.contains('is-hidden')) {
                done();
            }
        }, TRANSITION_MS + 1600);
    }

    function applyStagePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        var page = payload.page || payload.stagePage;
        if (page === undefined || page === null || page === '') {
            return;
        }
        loadStage(page);
    }

    function loadInitialState() {
        fetch('/api/stage', { credentials: 'same-origin' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('stage 状态请求失败');
                }
                return response.json();
            })
            .then(function (data) {
                var page = data && (data.page || data.stagePage);
                loadStage(page || DEFAULT_PAGE);
            })
            .catch(function () {
                // 拉取失败时回退到默认画面，避免长期空白
                loadStage(DEFAULT_PAGE);
            });
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            console.error('Socket.IO 客户端未加载，导播画面切换将不可用');
            return;
        }

        socket = io({ transports: ['websocket', 'polling'] });

        socket.on('connect', function () {
            // 连接建立后服务端会下发 snapshot，其中包含 stage 字段
        });

        socket.on('snapshot', function (payload) {
            applyStagePayload(payload && payload.stage ? { page: payload.stage.page } : null);
        });

        socket.on('stage:update', function (payload) {
            applyStagePayload(payload);
        });

        socket.on('connect_error', function (error) {
            console.error('Socket.IO 连接失败:', error);
        });
    }

    function init() {
        if (!frame || !carrier) {
            console.error('推流载体 DOM 节点缺失');
            return;
        }
        // 初始占位
        setBlank('正在等待导播画面…');
        loadInitialState();
        connectSocket();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
