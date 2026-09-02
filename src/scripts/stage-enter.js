(function () {
    'use strict';

    /**
     * 推流页面入场动效控制脚本（与 styles/stage-enter.css 配套）。
     *
     * 推流载体（index.html 的 stage-carrier.js）完成 iframe 加载后
     * postMessage 发来 { type: 'stage-enter' }，本脚本收到后在根节点
     * 加 is-stage-entered 并派发 stage-enter 事件，触发页面内
     * .fx-enter 区块依次入场（fadeUp）。
     *
     * 兜底：非载体场景（如浏览器直接打开页面）在 window load 后 60ms
     * 自动触发，保证入场动效可见。started 标志保证动画只播一次。
     *
     * 页面脚本如需在入场时联动（如 page3 的阵容入场动画），可监听
     * document 上的 stage-enter 事件。
     */
    var root = document.documentElement;
    var started = false;

    function start() {
        if (started) {
            return;
        }
        started = true;
        root.classList.add('js-stage-enter');
        root.classList.add('is-stage-entered');
        document.dispatchEvent(new CustomEvent('stage-enter'));
    }

    // 脚本运行即标记 js 已就绪（配合 CSS：脚本缺失时内容保持可见）
    root.classList.add('js-stage-enter');

    window.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'stage-enter') {
            start();
        }
    });

    window.addEventListener('load', function () {
        window.setTimeout(start, 60);
    });
})();