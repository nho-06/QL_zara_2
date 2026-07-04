function pickProductOnlyImage(images) {
    if (!Array.isArray(images) || images.length === 0) return "";

    const validImages = images.filter(img => {
        if (!img) return false;

        const lower = String(img).toLowerCase();

        return (
            lower.includes("static.zara.net") ||
            lower.includes("zara.net") ||
            lower.includes(".jpg") ||
            lower.includes(".jpeg") ||
            lower.includes(".png") ||
            lower.includes(".webp")
        );
    });

    if (validImages.length === 0) return "";

    const productOnly = validImages.find(img => {
        const lower = String(img).toLowerCase();

        return (
            lower.includes("/w/") ||
            lower.includes("e1") ||
            lower.includes("e2") ||
            lower.includes("e3") ||
            lower.includes("_6_")
        );
    });

    return productOnly || validImages[0];
}

function pickModelImage(images) {
    if (!Array.isArray(images) || images.length === 0) return "";

    const validImages = images.filter(img => {
        if (!img) return false;

        const lower = String(img).toLowerCase();

        return (
            lower.includes("static.zara.net") ||
            lower.includes("zara.net") ||
            lower.includes(".jpg") ||
            lower.includes(".jpeg") ||
            lower.includes(".png") ||
            lower.includes(".webp")
        );
    });

    if (validImages.length === 0) return "";

    const modelImage = validImages.find(img => {
        const lower = String(img).toLowerCase();

        return (
            lower.includes("/v1/") ||
            lower.includes("mkt") ||
            lower.includes("model")
        );
    });

    return modelImage || validImages[0];
}

async function scrapeProductDimensionImage(page) {
    try {
        const imageUrl = await page.evaluate(() => {
            function isValidZaraImage(src) {
                if (!src) return false;

                const lower = String(src).toLowerCase();

                return (
                    src.startsWith("http") &&
                    lower.includes("zara.net") &&
                    !lower.includes("transparent") &&
                    !lower.includes("placeholder") &&
                    !lower.includes("sprite") &&
                    !lower.includes("logo")
                );
            }

            function getBestSrcFromImg(img) {
                if (!img) return "";

                const directCandidates = [
                    img.currentSrc,
                    img.src,
                    img.getAttribute("src"),
                    img.getAttribute("data-src"),
                    img.getAttribute("data-original"),
                    img.getAttribute("data-lazy-src")
                ];

                for (const src of directCandidates) {
                    if (isValidZaraImage(src)) return src;
                }

                const srcset =
                    img.getAttribute("srcset") ||
                    img.getAttribute("data-srcset") ||
                    "";

                if (srcset) {
                    const urls = srcset
                        .split(",")
                        .map(part => part.trim().split(/\s+/)[0])
                        .filter(src => isValidZaraImage(src));

                    if (urls.length > 0) {
                        return urls[urls.length - 1];
                    }
                }

                return "";
            }

            function getBackgroundImage(el) {
                const style = window.getComputedStyle(el);
                const bg = style.backgroundImage || "";

                if (!bg || bg === "none") return "";

                const match = bg.match(/url\(["']?(.*?)["']?\)/i);

                if (!match || !match[1]) return "";

                const url = match[1].trim();

                return isValidZaraImage(url) ? url : "";
            }

            const viewportWidth = window.innerWidth || 1366;
            const viewportHeight = window.innerHeight || 900;

            const allElements = Array.from(document.querySelectorAll("*"));

            const panel = allElements
                .map(el => {
                    const text = (el.innerText || "").toUpperCase();
                    const rect = el.getBoundingClientRect();

                    const isRightSide = rect.left > viewportWidth * 0.42;
                    const isBig = rect.width > 220 && rect.height > 220;

                    const score =
                        (text.includes("PRODUCT DIMENSIONS") ? 30 : 0) +
                        (text.includes("PRODUCT MEASUREMENTS") ? 30 : 0) +
                        (text.includes("THE GARMENT IS MEASURED") ? 20 : 0) +
                        (text.includes("MEASURED ON A FLAT SURFACE") ? 20 : 0);

                    return {
                        el,
                        rect,
                        score,
                        isRightSide,
                        isBig
                    };
                })
                .filter(item => item.score > 0 && item.isRightSide && item.isBig)
                .sort((a, b) => b.score - a.score)[0]?.el;

            const searchRoot = panel || document.body;
            const items = [];

            const imgs = Array.from(searchRoot.querySelectorAll("img"));

            imgs.forEach(img => {
                const src = getBestSrcFromImg(img);
                const rect = img.getBoundingClientRect();

                if (!isValidZaraImage(src)) return;

                const isRightSide = rect.left > viewportWidth * 0.42;
                const isVisible = rect.width > 50 && rect.height > 50;
                const isProductImage =
                    rect.width >= 90 &&
                    rect.height >= 90 &&
                    rect.top > 80 &&
                    rect.top < viewportHeight - 10;

                if (isRightSide && isVisible && isProductImage) {
                    items.push({
                        src,
                        area: rect.width * rect.height,
                        top: rect.top,
                        left: rect.left
                    });
                }
            });

            const bgElements = Array.from(searchRoot.querySelectorAll("div, picture, figure, span"));

            bgElements.forEach(el => {
                const src = getBackgroundImage(el);
                const rect = el.getBoundingClientRect();

                if (!isValidZaraImage(src)) return;

                const isRightSide = rect.left > viewportWidth * 0.42;
                const isVisible = rect.width > 50 && rect.height > 50;
                const isProductImage =
                    rect.width >= 90 &&
                    rect.height >= 90 &&
                    rect.top > 80 &&
                    rect.top < viewportHeight - 10;

                if (isRightSide && isVisible && isProductImage) {
                    items.push({
                        src,
                        area: rect.width * rect.height,
                        top: rect.top,
                        left: rect.left
                    });
                }
            });

            items.sort((a, b) => b.area - a.area);

            if (items.length > 0) {
                return items[0].src;
            }

            return "";
        });

        return imageUrl || "";
    } catch (error) {
        console.log("scrapeProductDimensionImage error:", error.message);
        return "";
    }
}

function extractGalleryImagesBrowser() {
    const imageSet = new Set();

    const imgs = Array.from(document.querySelectorAll("img"));

    imgs.forEach(img => {
        const candidates = [
            img.src,
            img.currentSrc,
            img.getAttribute("src"),
            img.getAttribute("data-src")
        ];

        candidates.forEach(src => {
            if (src && src.startsWith("http")) {
                imageSet.add(src);
            }
        });
    });

    const sources = Array.from(document.querySelectorAll("source"));

    sources.forEach(source => {
        const srcset = source.getAttribute("srcset") || "";

        srcset.split(",").forEach(part => {
            const url = part.trim().split(" ")[0];

            if (url && url.startsWith("http")) {
                imageSet.add(url);
            }
        });
    });

    return Array.from(imageSet);
}

module.exports = {
    pickProductOnlyImage,
    pickModelImage,
    scrapeProductDimensionImage,
    extractGalleryImagesBrowser
};