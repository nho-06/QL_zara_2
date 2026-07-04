const COUNTRY_PRICE_RULES = {
    es: {
        code: "es",
        name: "Tây Ban Nha",
        pathCode: "es",
        langCode: "en",
        currency: "EUR",
        rate: 31.5,
        laborFee: 30
    },

    de: {
        code: "de",
        name: "Đức",
        pathCode: "de",
        langCode: "en",
        currency: "EUR",
        rate: 31.5,
        laborFee: 60
    },

    pl: {
        code: "pl",
        name: "Ba Lan",
        pathCode: "pl",
        langCode: "en",
        currency: "PLN",
        rate: 8,
        laborFee: 45
    },

    pt: {
        code: "pt",
        name: "Bồ Đào Nha",
        pathCode: "pt",
        langCode: "en",
        currency: "EUR",
        rate: 31.5,
        laborFee: 85
    },

    jp: {
        code: "jp",
        name: "Nhật",
        pathCode: "jp",
        langCode: "en",
        currency: "JPY",
        rate: 180,
        laborFee: 30
    }
};

const DEFAULT_COUNTRY_CODES = ["es", "de", "pl", "pt", "jp"];

function getCountryRule(countryCode) {
    return COUNTRY_PRICE_RULES[String(countryCode || "").toLowerCase()] || null;
}

function getDefaultCountryRules() {
    return DEFAULT_COUNTRY_CODES
        .map(code => COUNTRY_PRICE_RULES[code])
        .filter(Boolean);
}

function parseWebPrice(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? Math.abs(value) : 0;
    }

    let text = String(value)
        .trim()
        .replace(/\s/g, "")
        .replace("€", "")
        .replace("EUR", "")
        .replace("zł", "")
        .replace("PLN", "")
        .replace("¥", "")
        .replace("JPY", "")
        .replace("￥", "");

    /*
        Giá Zara không thể âm.
        Nếu DOM dính dấu "-" thì bỏ đi để không lưu giá âm.
    */
    text = text.replace(/-/g, "");

    text = text.replace(/[^\d.,]/g, "");

    if (!text) {
        return 0;
    }

    if (text.includes(",") && text.includes(".")) {
        text = text.replace(/\./g, "").replace(",", ".");
    } else if (text.includes(",")) {
        text = text.replace(",", ".");
    }

    const number = Number(text);

    return Number.isFinite(number) ? Math.abs(number) : 0;
}

function calculateFinalPrice(webPrice, countryCode) {
    const rule = getCountryRule(countryCode);

    if (!rule) {
        return {
            success: false,
            webPrice: 0,
            rate: 0,
            laborFee: 0,
            finalPrice: 0,
            message: "Không tìm thấy cấu hình nước."
        };
    }

    const cleanWebPrice = parseWebPrice(webPrice);
    const finalPrice = cleanWebPrice * rule.rate + rule.laborFee;

    return {
        success: true,
        countryCode: rule.code,
        countryName: rule.name,
        currency: rule.currency,
        webPrice: cleanWebPrice,
        rate: rule.rate,
        laborFee: rule.laborFee,
        finalPrice
    };
}

function formatFinalPrice(value) {
    const number = Number(value || 0);

    return number.toLocaleString("vi-VN", {
        maximumFractionDigits: 0
    });
}

function replaceZaraCountryInUrl(url, countryCode) {
    const rule = getCountryRule(countryCode);

    if (!rule) {
        return url;
    }

    const text = String(url || "").trim();

    if (!text) {
        return "";
    }

    if (/zara\.com\/[a-z]{2}\/[a-z]{2}\//i.test(text)) {
        return text.replace(
            /zara\.com\/[a-z]{2}\/[a-z]{2}\//i,
            `zara.com/${rule.pathCode}/${rule.langCode}/`
        );
    }

    if (/zara\.com\/[a-z]{2}\//i.test(text)) {
        return text.replace(
            /zara\.com\/[a-z]{2}\//i,
            `zara.com/${rule.pathCode}/${rule.langCode}/`
        );
    }

    return text;
}

function buildCountryUrls(baseUrl, countryCodes = DEFAULT_COUNTRY_CODES) {
    return countryCodes
        .map(code => {
            const rule = getCountryRule(code);

            if (!rule) {
                return null;
            }

            return {
                countryCode: rule.code,
                countryName: rule.name,
                currency: rule.currency,
                rate: rule.rate,
                laborFee: rule.laborFee,
                url: replaceZaraCountryInUrl(baseUrl, rule.code)
            };
        })
        .filter(item => item && item.url);
}

module.exports = {
    COUNTRY_PRICE_RULES,
    DEFAULT_COUNTRY_CODES,
    getCountryRule,
    getDefaultCountryRules,
    parseWebPrice,
    calculateFinalPrice,
    formatFinalPrice,
    replaceZaraCountryInUrl,
    buildCountryUrls
};