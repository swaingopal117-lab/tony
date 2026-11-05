(function () {
    'use strict';

    if (window.__AX_PROJECT_IMAGE_LAZYLOAD__) {
        return;
    }
    window.__AX_PROJECT_IMAGE_LAZYLOAD__ = true;

    var currentScript = document.currentScript || document.getElementById('ax-project-image-lazyload');
    var placeholderSrc = currentScript ? String(currentScript.getAttribute('data-placeholder-src') || '') : '';
    var selector = 'img[src]:not([data-ax-lazy-skip])';

    /**
     * 判断图片是否应跳过懒加载。
     *
     * @param {HTMLImageElement} img 图片节点
     * @returns {boolean} 是否跳过
     */
    function shouldSkip(img) {
        var src = String(img.getAttribute('src') || '').trim();
        if (!src) {
            return true;
        }
        if (/^(data:|blob:|javascript:)/i.test(src)) {
            return true;
        }
        if (img.hasAttribute('loading') || img.hasAttribute('data-ax-lazy-bound')) {
            return true;
        }
        return false;
    }

    /**
     * 为图片绑定懒加载行为。
     *
     * @param {HTMLImageElement} img 图片节点
     * @returns {void}
     */
    function bindLazyImage(img) {
        var originalSrc = '';
        var loader = null;

        if (!img || shouldSkip(img)) {
            return;
        }

        originalSrc = String(img.getAttribute('src') || '').trim();
        if (!originalSrc) {
            return;
        }

        img.setAttribute('data-ax-lazy-bound', '1');
        img.setAttribute('data-src', originalSrc);
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');

        if (placeholderSrc) {
            img.setAttribute('src', placeholderSrc);
        }

        loader = function () {
            var actualSrc = String(img.getAttribute('data-src') || '').trim();
            if (!actualSrc) {
                return;
            }
            img.setAttribute('src', actualSrc);
            img.removeAttribute('data-src');
        };

        if (!('IntersectionObserver' in window)) {
            loader();
            return;
        }

        window.__axImageLazyObserver = window.__axImageLazyObserver || new IntersectionObserver(function (entries, observer) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) {
                    return;
                }
                var target = entry.target;
                var actualSrc = String(target.getAttribute('data-src') || '').trim();
                if (actualSrc) {
                    target.setAttribute('src', actualSrc);
                    target.removeAttribute('data-src');
                }
                observer.unobserve(target);
            });
        }, {
            rootMargin: '300px 0px'
        });

        window.__axImageLazyObserver.observe(img);
    }

    /**
     * 扫描当前文档中的图片并绑定懒加载。
     *
     * @returns {void}
     */
    function scanImages() {
        Array.prototype.forEach.call(document.querySelectorAll(selector), bindLazyImage);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanImages, { once: true });
    } else {
        scanImages();
    }
})();
