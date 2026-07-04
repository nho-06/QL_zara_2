const {
    parseWebPrice,
    calculateFinalPrice
} = require("../config/countryPriceRules");

function cleanPriceText(priceText) {
    return parseWebPrice(priceText);
}

function normalizeRawPriceNumber(value, countryCode = "es") {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    let raw = String(value).trim();

    let text = raw
        .replace(/\s+/g, "")
        .replace("€", "")
        .replace("EUR", "")
        .replace("zł", "")
        .replace("PLN", "")
        .replace("¥", "")
        .replace("￥", "")
        .replace("JPY", "");

    text = text.replace(/[^\d.,-]/g, "");

    if (!text) return 0;

    if (text.includes(",") && text.includes(".")) {
        text = text.replace(/\./g, "").replace(",", ".");
    } else if (text.includes(",")) {
        text = text.replace(",", ".");
    }

    let number = Number(text);

    if (!Number.isFinite(number)) {
        return 0;
    }

    /*
        Nếu Zara lưu dạng 1997 thì hiểu là 19.97
        Nhưng nếu text đã có dấu phẩy/chấm như 19,97 hoặc 19.97 thì giữ nguyên.
    */
    const hasDecimal = raw.includes(",") || raw.includes(".");

    if (countryCode !== "jp" && !hasDecimal && number >= 1000) {
        number = number / 100;
    }

    return number;
}

function getPriceInfoBrowser(countryCode = "es") {
    function cleanText(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function parseNumber(value) {
        if (value === null || value === undefined || value === "") {
            return 0;
        }

        let raw = String(value).trim();

        let text = raw
            .replace(/\s+/g, "")
            .replace("€", "")
            .replace("EUR", "")
            .replace("zł", "")
            .replace("PLN", "")
            .replace("¥", "")
            .replace("￥", "")
            .replace("JPY", "");

        text = text.replace(/[^\d.,-]/g, "");

        if (!text) return 0;

        if (text.includes(",") && text.includes(".")) {
            text = text.replace(/\./g, "").replace(",", ".");
        } else if (text.includes(",")) {
            text = text.replace(",", ".");
        }

        let number = Number(text);

        if (!Number.isFinite(number)) return 0;

        const hasDecimal = raw.includes(",") || raw.includes(".");

        if (countryCode !== "jp" && !hasDecimal && number >= 1000) {
            number = number / 100;
        }

        return number;
    }

    function hasCurrency(text) {
        const clean = cleanText(text);

        return (
            clean.includes("€") ||
            /EUR/i.test(clean) ||
            /zł/i.test(clean) ||
            /PLN/i.test(clean) ||
            clean.includes("¥") ||
            clean.includes("￥") ||
            /JPY/i.test(clean)
        );
    }

    function isReasonablePrice(number) {
        if (!number || !Number.isFinite(number)) return false;

        if (countryCode === "jp") {
            return number >= 300 && number <= 300000;
        }

        if (countryCode === "pl") {
            return number >= 20 && number <= 5000;
        }

        return number >= 5 && number <= 2000;
    }

    function isVisible(el) {
        if (!el || !el.getBoundingClientRect) return false;

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0
        );
    }

    function addCandidate(list, text, source, score, el = null) {
        const clean = cleanText(text);

        if (!clean) return;
        if (clean.length > 120) return;

        const number = parseNumber(clean);

        if (!isReasonablePrice(number)) return;

        let top = 999999;
        let left = 999999;
        let area = 0;

        if (el && el.getBoundingClientRect) {
            const rect = el.getBoundingClientRect();
            top = rect.top || 999999;
            left = rect.left || 999999;
            area = (rect.width || 0) * (rect.height || 0);
        }

        list.push({
            text: clean,
            number,
            source,
            score,
            top,
            left,
            area
        });
    }

    const candidates = [];

    /*
        1. Ưu tiên các selector giá chính thức / visible DOM
    */
    const strongSelectors = [
        "[data-qa-id='product-detail-info-product-price']",
        "[data-qa-id*='product-price']",
        "[class*='product-detail-info'] [class*='price']",
        "[class*='product-detail'] [class*='price']",
        "[class*='price-current']",
        "[class*='current-price']",
        "[class*='sale-price']",
        "[class*='price']"
    ];

    for (const selector of strongSelectors) {
        const elements = Array.from(document.querySelectorAll(selector));

        for (const el of elements) {
            if (!isVisible(el)) continue;

            const text = cleanText(el.innerText || el.textContent || "");

            if (!hasCurrency(text)) continue;

            addCandidate(candidates, text, "visible-dom", 100, el);
        }
    }

    /*
        2. Quét các element visible nhỏ, có ký hiệu tiền
    */
    const visibleElements = Array.from(document.querySelectorAll("span, div, p, section"));

    for (const el of visibleElements) {
        if (!isVisible(el)) continue;

        const text = cleanText(el.innerText || el.textContent || "");

        if (!hasCurrency(text)) continue;
        if (text.length > 80) continue;

        const pricePattern =
            /[0-9]+(?:[,.][0-9]+)?\s*€/i.test(text) ||
            /[0-9]+(?:[,.][0-9]+)?\s*EUR/i.test(text) ||
            /[0-9]+(?:[,.][0-9]+)?\s*zł/i.test(text) ||
            /[0-9]+(?:[,.][0-9]+)?\s*PLN/i.test(text) ||
            /¥\s*[0-9,.]+/i.test(text) ||
            /￥\s*[0-9,.]+/i.test(text) ||
            /JPY\s*[0-9,.]+/i.test(text) ||
            /[0-9,.]+\s*JPY/i.test(text);

        if (!pricePattern) continue;

        addCandidate(candidates, text, "visible-text", 80, el);
    }

    /*
        3. Meta price
    */
    const metaSelectors = [
        "meta[property='product:price:amount']",
        "meta[property='og:price:amount']",
        "meta[itemprop='price']",
        "meta[name='price']"
    ];

    for (const selector of metaSelectors) {
        const metas = Array.from(document.querySelectorAll(selector));

        for (const meta of metas) {
            const content = meta.getAttribute("content") || "";

            addCandidate(candidates, content, "meta", 70);
        }
    }

    /*
        4. JSON-LD
    */
    const jsonScripts = Array.from(
        document.querySelectorAll("script[type='application/ld+json']")
    );

    for (const script of jsonScripts) {
        const raw = script.textContent || "";

        try {
            const json = JSON.parse(raw);
            const items = Array.isArray(json) ? json : [json];

            for (const item of items) {
                if (item && item.offers) {
                    if (Array.isArray(item.offers)) {
                        item.offers.forEach(offer => {
                            addCandidate(candidates, offer.price, "json-ld", 60);
                            addCandidate(candidates, offer.lowPrice, "json-ld", 60);
                            addCandidate(candidates, offer.highPrice, "json-ld", 60);
                        });
                    } else {
                        addCandidate(candidates, item.offers.price, "json-ld", 60);
                        addCandidate(candidates, item.offers.lowPrice, "json-ld", 60);
                        addCandidate(candidates, item.offers.highPrice, "json-ld", 60);
                    }
                }

                addCandidate(candidates, item.price, "json-ld", 60);
            }
        } catch (e) {}
    }

    /*
        5. Script Zara chỉ dùng cuối cùng.
        Quan trọng: không lấy số nhỏ linh tinh nếu đã có DOM.
    */
    if (candidates.length === 0) {
        const scripts = Array.from(document.querySelectorAll("script"));

        for (const script of scripts) {
            const raw = script.textContent || "";

            if (!raw || raw.length < 20) continue;

            if (
                !raw.includes("price") &&
                !raw.includes("Price") &&
                !raw.includes("currentPrice") &&
                !raw.includes("formattedPrice") &&
                !raw.includes("displayPrice")
            ) {
                continue;
            }

            const formattedPatterns = [
                /[0-9]+(?:[,.][0-9]+)?\s*€/g,
                /[0-9]+(?:[,.][0-9]+)?\s*EUR/gi,
                /[0-9]+(?:[,.][0-9]+)?\s*zł/gi,
                /[0-9]+(?:[,.][0-9]+)?\s*PLN/gi,
                /¥\s*[0-9,.]+/g,
                /￥\s*[0-9,.]+/g,
                /JPY\s*[0-9,.]+/gi,
                /[0-9,.]+\s*JPY/gi
            ];

            for (const pattern of formattedPatterns) {
                const matches = raw.match(pattern) || [];

                matches.slice(0, 20).forEach(value => {
                    addCandidate(candidates, value, "script-formatted", 30);
                });
            }

            const regexList = [
                /"formattedPrice"\s*:\s*"([^"]+)"/gi,
                /"displayPrice"\s*:\s*"([^"]+)"/gi,
                /"currentPrice"\s*:\s*"?([0-9]+(?:[,.][0-9]+)?)"?/gi,
                /"price"\s*:\s*"?([0-9]+(?:[,.][0-9]+)?)"?/gi
            ];

            for (const regex of regexList) {
                let match;

                while ((match = regex.exec(raw)) !== null) {
                    if (match && match[1]) {
                        addCandidate(candidates, match[1], "script-number", 20);
                    }
                }
            }
        }
    }

    const unique = [];

    for (const item of candidates) {
        const exists = unique.find(x => Math.abs(x.number - item.number) < 0.001);

        if (!exists) {
            unique.push(item);
        } else if (item.score > exists.score) {
            exists.text = item.text;
            exists.source = item.source;
            exists.score = item.score;
            exists.top = item.top;
            exists.left = item.left;
            exists.area = item.area;
        }
    }

    unique.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        if (a.top !== b.top) return a.top - b.top;

        return b.area - a.area;
    });

    if (unique.length > 0) {
        return {
            priceText: unique[0].text,
            webPrice: unique[0].number,
            source: unique[0].source,
            candidates: unique.slice(0, 8)
        };
    }

    return {
        priceText: "",
        webPrice: 0,
        source: "not_found",
        candidates: []
    };
}

async function scrapePriceFromPage(page, countryCode = "es") {
    try {
        let priceInfo = await page.evaluate(getPriceInfoBrowser, countryCode);

        let priceText = priceInfo.priceText || "";
        let webPrice = Number(priceInfo.webPrice || 0);

        if (!webPrice) {
            await page.waitForTimeout(1500);

            priceInfo = await page.evaluate(getPriceInfoBrowser, countryCode);

            priceText = priceInfo.priceText || "";
            webPrice = Number(priceInfo.webPrice || 0);
        }

        webPrice = normalizeRawPriceNumber(webPrice || priceText, countryCode);

        const calculation = calculateFinalPrice(webPrice, countryCode);

        return {
            priceText,
            webPrice,
            price: webPrice,
            rate: calculation.rate || 0,
            laborFee: calculation.laborFee || 0,
            finalPrice: calculation.finalPrice || 0,
            finalPriceVnd: calculation.finalPrice || 0,
            currency: calculation.currency || "",
            priceSource: priceInfo.source || "",
            priceCandidates: priceInfo.candidates || []
        };
    } catch (error) {
        return {
            priceText: "",
            webPrice: 0,
            price: 0,
            rate: 0,
            laborFee: 0,
            finalPrice: 0,
            finalPriceVnd: 0,
            currency: "",
            priceSource: "error",
            priceCandidates: [],
            error: error.message
        };
    }
}

module.exports = {
    cleanPriceText,
    getPriceInfoBrowser,
    scrapePriceFromPage
};