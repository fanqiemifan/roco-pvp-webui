(function () {
    'use strict';

    const listEl = document.getElementById('nextgameList');
    const searchInput = document.getElementById('nextgameSearch');
    const closeBtn = document.getElementById('nextgameCloseBtn');

    let matches = [];
    let currentState = null;
    let selectedMatchId = null;

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

    function normalizeName(value) {
        return String(value || '').trim();
    }

    function getMatchLabel(match) {
        return `${normalizeName(match.leftPlayer) || '左侧'} vs ${normalizeName(match.rightPlayer) || '右侧'}`;
    }

    async function loadData() {
        const [storeData, nextgameData] = await Promise.all([
            requestJson('/api/matches'),
            requestJson('/api/nextgame'),
        ]);

        currentState = nextgameData.state || null;
        selectedMatchId = currentState && currentState.matchId ? currentState.matchId : null;

        matches = Array.isArray(storeData.matches) ? storeData.matches : [];
        renderList();
    }

    function renderList() {
        const keyword = searchInput.value.trim().toLowerCase();
        const pendingMatches = matches.filter((match) => match && match.status === 'pending');

        const results = keyword
            ? pendingMatches.filter((match) => {
                const haystack = [
                    normalizeName(match.leftPlayer),
                    normalizeName(match.rightPlayer),
                    String(match.id || ''),
                ].join(' ').toLowerCase();
                return haystack.includes(keyword);
            })
            : pendingMatches;

        listEl.innerHTML = '';

        if (results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'nextgame-empty';
            empty.textContent = keyword ? '没有匹配的待开始比赛' : '暂无待开始的比赛';
            listEl.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        results.forEach((match) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `nextgame-item${match.id === selectedMatchId ? ' is-active' : ''}`;

            const main = document.createElement('div');
            main.className = 'nextgame-item-main';

            const players = document.createElement('div');
            players.className = 'nextgame-item-players';
            players.textContent = getMatchLabel(match);
            main.appendChild(players);

            const meta = document.createElement('div');
            meta.className = 'nextgame-item-meta';
            meta.textContent = `BO${match.bestOf} · ${match.id}`;
            main.appendChild(meta);

            const check = document.createElement('div');
            check.className = 'nextgame-item-check';
            check.textContent = match.id === selectedMatchId ? '✓' : '';

            button.appendChild(main);
            button.appendChild(check);

            button.addEventListener('click', () => {
                void showNextGame(match.id);
            });

            fragment.appendChild(button);
        });
        listEl.appendChild(fragment);
    }

    async function showNextGame(matchId) {
        try {
            const payload = {
                matchId,
                duration: currentState ? currentState.duration : undefined,
                durationUnit: currentState ? currentState.durationUnit : undefined,
            };
            const data = await requestJson('/api/nextgame/show', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            selectedMatchId = data.state && data.state.matchId ? data.state.matchId : matchId;
            closeWindow();
        } catch (error) {
            console.error('显示下场对局失败:', error);
        }
    }

    function closeWindow() {
        if (window.rocoFloat && typeof window.rocoFloat.closeMenu === 'function') {
            window.rocoFloat.closeMenu();
            return;
        }
        window.close();
        window.setTimeout(() => {
            if (!window.closed) {
                window.open('', '_self');
                window.close();
            }
        }, 50);
    }

    let hasHadFocus = false;
    window.addEventListener('focus', () => {
        hasHadFocus = true;
    });
    window.addEventListener('blur', () => {
        if (hasHadFocus) {
            closeWindow();
        }
    });

    closeBtn.addEventListener('click', closeWindow);
    searchInput.addEventListener('input', renderList);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeWindow();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        void loadData()
            .then(() => searchInput.focus())
            .catch((error) => {
                listEl.innerHTML = '';
                const empty = document.createElement('div');
                empty.className = 'nextgame-empty';
                empty.textContent = `加载失败：${error.message}`;
                listEl.appendChild(empty);
            });
    });
})();
