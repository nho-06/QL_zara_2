const {
    getCountryRule
} = require("../config/countryPriceRules");

const {
    isAccessDenied,
    getCountryCodeFromUrl,
    createContext,
    preparePage,
    acceptZaraPopups
} = require("./browser");

const {
    scrapePriceFromPage
} = require("./price");

function normalizeSize(size) {
    return String(size || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function cleanSizeList(sizes) {
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

    const normalizedSizes = (sizes || [])
        .map(size => normalizeSize(size))
        .filter(Boolean);

    const result = [];

    for (const size of order) {
        if (normalizedSizes.includes(size) && !result.includes(size)) {
            result.push(size);
        }
    }

    normalizedSizes.forEach(size => {
        if (!result.includes(size)) {
            result.push(size);
        }
    });

    return result;
}

function getStockInfoBrowser() {
    const text = document.body.innerText || "";
    const upper = text.toUpperCase();

    const isAccessDenied =
        upper.includes("ACCESS DENIED") ||
        upper.includes("YOU DON'T HAVE PERMISSION") ||
        upper.includes("REFERENCE #");

    const buttons = Array.from(document.querySelectorAll("button"));

    const buttonTexts = buttons
        .map(button => (button.innerText || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);

    const addButton = buttons.find(button => {
        const btnText = (button.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();

        const disabled =
            button.disabled ||
            button.getAttribute("aria-disabled") === "true" ||
            String(button.className || "").toLowerCase().includes("disabled");

        const rect = button.getBoundingClientRect();
        const visible = rect.width > 20 && rect.height > 20;

        return (
            visible &&
            !disabled &&
            (
                btnText === "ADD" ||
                btnText.includes("ADD TO BAG") ||
                btnText === "AÑADIR" ||
                btnText.includes("AÑADIR") ||
                btnText.includes("HINZUFÜGEN") ||
                btnText.includes("DODAJ") ||
                btnText.includes("ADICIONAR") ||
                btnText.includes("追加")
            )
        );
    });

    const hasAddButton = !!addButton;

    const productAreaText = Array.from(
        document.querySelectorAll("main, [class*='product-detail'], [class*='product']")
    )
        .map(el => el.innerText || "")
        .join("\n")
        .toUpperCase();

    const outOfStockText =
        productAreaText.includes("OUT OF STOCK") ||
        productAreaText.includes("SOLD OUT") ||
        productAreaText.includes("VIEW SIMILAR") ||
        productAreaText.includes("AGOTADO") ||
        productAreaText.includes("SIN STOCK") ||
        productAreaText.includes("NOTIFY ME") ||
        productAreaText.includes("BACK SOON") ||
        productAreaText.includes("AUSVERKAUFT") ||
        productAreaText.includes("POWIADOM") ||
        productAreaText.includes("ESGOTADO") ||
        productAreaText.includes("在庫切れ");

    const isOutOfStock = hasAddButton ? false : outOfStockText;

    return {
        isAccessDenied,
        isOutOfStock,
        hasAddButton,
        inStock: !isAccessDenied && hasAddButton,
        stockStatus: hasAddButton ? "in_stock" : isOutOfStock ? "out_of_stock" : "unknown",
        buttonTexts,
        checkedText: text.slice(0, 500)
    };
}

async function findAddButton(page) {
    const addSelectors = [
        "button:has-text('ADD')",
        "button:has-text('Add')",
        "button:has-text('AÑADIR')",
        "button:has-text('Añadir')",
        "button:has-text('ADD TO BAG')",
        "button:has-text('Add to bag')",
        "button:has-text('Hinzufügen')",
        "button:has-text('HINZUFÜGEN')",
        "button:has-text('Dodaj')",
        "button:has-text('DODAJ')",
        "button:has-text('Adicionar')",
        "button:has-text('ADICIONAR')",
        "button:has-text('追加')"
    ];

    for (const selector of addSelectors) {
        try {
            const btn = page.locator(selector).first();

            if (await btn.count()) {
                const visible = await btn.isVisible().catch(() => false);
                const disabled = await btn.isDisabled().catch(() => false);

                if (!visible || disabled) continue;

                return btn;
            }
        } catch (e) {}
    }

    return null;
}

async function scrapeSizeOptionsFromAdd(page) {
    const possibleSizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

    try {
        const btn = await findAddButton(page);

        if (!btn) {
            return [];
        }

        await btn.scrollIntoViewIfNeeded({ timeout: 4000 });
        await page.waitForTimeout(250);
        await btn.click({ timeout: 4000 });

        /*
            Fast check:
            chỉ chờ modal size hiện ra, không chờ lâu.
        */
        await page.waitForTimeout(900);

        const lines = await page.evaluate(() => {
            return (document.body.innerText || "")
                .split("\n")
                .map(x => x.trim())
                .filter(Boolean);
        });

        const rawOptions = [];

        for (let i = 0; i < lines.length; i++) {
            const size = normalizeSize(lines[i]);

            if (!possibleSizes.includes(size)) continue;

            const nextText = lines
                .slice(i + 1, i + 5)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();

            const statusUpper = nextText.toUpperCase();

            const soldOut =
                statusUpper.includes("VIEW SIMILAR") ||
                statusUpper.includes("SIMILAR") ||
                statusUpper.includes("OUT OF STOCK") ||
                statusUpper.includes("SOLD OUT") ||
                statusUpper.includes("NOTIFY") ||
                statusUpper.includes("BACK SOON") ||
                statusUpper.includes("AGOTADO") ||
                statusUpper.includes("SIN STOCK") ||
                statusUpper.includes("AUSVERKAUFT") ||
                statusUpper.includes("POWIADOM") ||
                statusUpper.includes("ESGOTADO") ||
                statusUpper.includes("在庫切れ");

            const availableText =
                statusUpper.includes("FEW ITEMS LEFT") ||
                statusUpper.includes("LOW STOCK") ||
                statusUpper.includes("ADD") ||
                statusUpper.includes("AÑADIR") ||
                statusUpper.includes("AVAILABLE") ||
                statusUpper.includes("DISPONIBLE") ||
                statusUpper.includes("VERFÜGBAR") ||
                statusUpper.includes("DOSTĘPNY") ||
                statusUpper.includes("DISPONÍVEL") ||
                statusUpper.includes("追加") ||
                statusUpper === "";

            rawOptions.push({
                size,
                statusText: nextText,
                available: soldOut ? false : availableText ? true : true
            });
        }

        const ordered = [];

        for (const size of possibleSizes) {
            const option = rawOptions.find(item => item.size === size);

            if (option && !ordered.find(item => item.size === size)) {
                ordered.push(option);
            }
        }

        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);

        return ordered;
    } catch (error) {
        await page.keyboard.press("Escape").catch(() => {});
        return [];
    }
}

async function checkOneZaraStock(browser, productUrl, targetSize = "", countryCode = "") {
    let context;
    let page;

    try {
        const finalCountryCode = countryCode || getCountryCodeFromUrl(productUrl);
        const countryRule = getCountryRule(finalCountryCode);

        context = await createContext(browser, finalCountryCode);
        page = await preparePage(context);

        await page.goto(productUrl, {
            waitUntil: "domcontentloaded",
            timeout: 45000
        });

        /*
            Fast check:
            không chờ 3.5s nữa, không chờ networkidle lâu.
        */
        await page.waitForTimeout(1600);
        await acceptZaraPopups(page);
        await page.waitForTimeout(700);

        const pageText = await page.evaluate(() => document.body.innerText || "");

        if (isAccessDenied(pageText)) {
            return {
                inStock: false,
                sizeMatched: false,
                isAccessDenied: true,
                stockStatus: "access_denied",
                availableSizes: [],
                soldOutSizes: [],
                sizeOptions: [],

                priceText: "",
                webPrice: 0,
                price: 0,

                countryCode: finalCountryCode,
                countryName: countryRule?.name || finalCountryCode,
                currency: countryRule?.currency || "",

                rate: countryRule?.rate || 0,
                laborFee: countryRule?.laborFee || 0,
                finalPrice: 0,
                finalPriceVnd: 0,

                productUrl,
                message: "Access Denied",
                checkedAt: new Date().toISOString()
            };
        }

        const stockInfo = await page.evaluate(getStockInfoBrowser);

        /*
            Lấy giá trước khi bấm ADD.
            Bấm ADD xong modal size hiện lên dễ làm đọc giá sai.
        */
        const priceData = await scrapePriceFromPage(page, finalCountryCode);

        const sizeOptions = await scrapeSizeOptionsFromAdd(page);

        const availableSizes = cleanSizeList(
            sizeOptions
                .filter(item => item.available === true)
                .map(item => item.size)
        );

        const soldOutSizes = cleanSizeList(
            sizeOptions
                .filter(item => item.available === false)
                .map(item => item.size)
        );

        const cleanTargetSize = normalizeSize(targetSize);

        let sizeMatched = false;

        if (cleanTargetSize) {
            sizeMatched = availableSizes.includes(cleanTargetSize);
        } else {
            sizeMatched = availableSizes.length > 0 || stockInfo.hasAddButton === true;
        }

        return {
            inStock: sizeMatched,
            sizeMatched,
            targetSize: cleanTargetSize,

            hasAddButton: stockInfo.hasAddButton === true,
            stockStatus: sizeMatched ? "in_stock" : "out_of_stock",

            availableSizes,
            soldOutSizes,
            sizeOptions,

            priceText: priceData.priceText || "",
            webPrice: Number(priceData.webPrice || 0),
            price: Number(priceData.price || priceData.webPrice || 0),

            countryCode: finalCountryCode,
            countryName: countryRule?.name || finalCountryCode,
            currency: priceData.currency || countryRule?.currency || "",

            rate: Number(priceData.rate || countryRule?.rate || 0),
            laborFee: Number(priceData.laborFee || countryRule?.laborFee || 0),
            finalPrice: Number(priceData.finalPrice || 0),
            finalPriceVnd: Number(priceData.finalPriceVnd || priceData.finalPrice || 0),

            productUrl,

            priceSource: priceData.priceSource || "",
            priceCandidates: priceData.priceCandidates || [],

            rawStockInfo: stockInfo,
            checkedAt: new Date().toISOString()
        };
    } catch (error) {
        const finalCountryCode = countryCode || getCountryCodeFromUrl(productUrl);
        const countryRule = getCountryRule(finalCountryCode);

        return {
            inStock: false,
            sizeMatched: false,
            stockStatus: "error",
            availableSizes: [],
            soldOutSizes: [],
            sizeOptions: [],

            priceText: "",
            webPrice: 0,
            price: 0,

            countryCode: finalCountryCode,
            countryName: countryRule?.name || finalCountryCode,
            currency: countryRule?.currency || "",

            rate: countryRule?.rate || 0,
            laborFee: countryRule?.laborFee || 0,
            finalPrice: 0,
            finalPriceVnd: 0,

            productUrl,

            priceSource: "error",
            priceCandidates: [],

            error: error.message,
            checkedAt: new Date().toISOString()
        };
    } finally {
        if (context) {
            await context.close().catch(() => {});
        }
    }
}

module.exports = {
    normalizeSize,
    cleanSizeList,
    getStockInfoBrowser,
    scrapeSizeOptionsFromAdd,
    checkOneZaraStock
};