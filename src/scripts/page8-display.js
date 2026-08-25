(function () {
    'use strict';

    // 复用 page3 的排名数字偏移：按显示位数设置数字距图标左侧的 x（10000+ 视为 6 位）
    const RANK_TEXT_LEFT_BY_LENGTH = { 1: 22, 2: 16, 3: 12, 4: 7, 5: 3, 6: -2 };

    const screenEl = document.getElementById('page8Screen');
    const titleEl = document.getElementById('page8Title');
    const subtitleEl = document.getElementById('page8Subtitle');
    const gridEl = document.getElementById('page8Grid');

    function formatRankText(value) {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) {
            return '';
        }
        return Number(digits) > 10000 ? '10000+' : digits;
    }

    function rankTextStyle(text, txtEl) {
        if (!txtEl || !text) {
            return;
        }
        txtEl.style.left = `${RANK_TEXT_LEFT_BY_LENGTH[Math.min(text.length, 6)] || 0}px`;
    }

    function applyBackground(state) {
        const data = state || {};
        const mode = data.background === 'image-2' || data.background === 'custom' ? data.background : 'image';
        screenEl.classList.toggle('page8-mode-image-2', mode === 'image-2');
        screenEl.classList.toggle('page8-mode-custom', mode === 'custom');
        screenEl.style.setProperty('--page8-wallpaper', mode === 'custom' && data.wallpaperUrl ? `url("${data.wallpaperUrl}")` : 'none');
    }

    function applyTitle(state) {
        const title = String((state && state.title) || '').trim();
        titleEl.textContent = title;
        titleEl.hidden = !title;
    }

    function applySubtitle(state) {
        const subtitle = String((state && state.subtitle) || '').trim();
        subtitleEl.textContent = subtitle;
        subtitleEl.hidden = !subtitle;
    }

    function renderGrid(matches) {
        gridEl.innerHTML = '';
        (matches || []).forEach((match) => {
            const card = document.createElement('div');
            card.className = 'page8-match';

            const left = document.createElement('div');
            left.className = 'page8-left';

            const leftRank = document.createElement('div');
            leftRank.className = 'page8-rank page8-rank-left';
            leftRank.appendChild(buildRankIcon());
            const leftTxt = document.createElement('div');
            leftTxt.className = 'page8-rank-txt';
            leftRank.appendChild(leftTxt);
            left.appendChild(leftRank);

            const leftName = document.createElement('div');
            leftName.className = 'page8-name page8-name-left';
            leftName.textContent = match.leftPlayer || '左侧';
            left.appendChild(leftName);

            const vs = document.createElement('div');
            vs.className = 'page8-vs';
            vs.textContent = 'vs';

            const right = document.createElement('div');
            right.className = 'page8-right';

            const rightName = document.createElement('div');
            rightName.className = 'page8-name page8-name-right';
            rightName.textContent = match.rightPlayer || '右侧';
            right.appendChild(rightName);

            const rightRank = document.createElement('div');
            rightRank.className = 'page8-rank page8-rank-right';
            rightRank.appendChild(buildRankIcon());
            const rightTxt = document.createElement('div');
            rightTxt.className = 'page8-rank-txt';
            rightRank.appendChild(rightTxt);
            right.appendChild(rightRank);

            card.appendChild(left);
            card.appendChild(vs);
            card.appendChild(right);
            gridEl.appendChild(card);

            const leftText = formatRankText(match.leftRank);
            const rightText = formatRankText(match.rightRank);
            leftTxt.textContent = leftText;
            leftTxt.hidden = !leftText;
            rightTxt.textContent = rightText;
            rightTxt.hidden = !rightText;
            rankTextStyle(leftText, leftTxt);
            rankTextStyle(rightText, rightTxt);
        });
    }

    function buildRankIcon() {
        const image = document.createElement('img');
        image.src = '/assets/ui/7.Wku3bA4b.png';
        image.alt = '';
        return image;
    }

    function applyAll(data) {
        const state = (data && data.state) || null;
        applyBackground(state);
        applyTitle(state);
        applySubtitle(state);
        renderGrid(data && data.matches);
    }

    async function loadData() {
        try {
            const data = await fetch('/api/page8', { credentials: 'same-origin' }).then((response) => response.json());
            applyAll(data);
        } catch (error) {
            console.error('page8 初始加载失败:', error);
        }
    }

    function connectSocket() {
        if (typeof io !== 'function') {
            return;
        }
        const socket = io({ transports: ['websocket', 'polling'] });

        socket.on('snapshot', (payload) => {
            if (payload && payload.page8) {
                void loadData();
            }
        });

        socket.on('page8:update', () => {
            void loadData();
        });

        socket.on('matches:update', () => {
            void loadData();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        void loadData();
        connectSocket();
    });
})();