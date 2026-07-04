const {
    isAccessDenied,
    getCountryCodeFromUrl,
    createBrowser,
    createContext,
    preparePage,
    acceptZaraPopups
} = require("./browser");

const {
    cleanSizeList,
    getStockInfoBrowser,
    scrapeSizeOptionsFromAdd
} = require("./stock");

const {
    cleanPriceText,
    scrapePriceFromPage
} = require("./price");

const {
    getCountryRule,
    calculateFinalPrice
} = require("../config/countryPriceRules");

const {
    pickProductOnlyImage,
    pickModelImage,
    scrapeProductDimensionImage,
    extractGalleryImagesBrowser
} = require("./image");

const {
    openProductMeasurements,
    scrapeSizeChart
} = require("./sizeChart");

function extractProductDataBrowser() {
    const bodyText = document.body.innerText || "";

    const titleSelectors = [
        "h1",
        "[data-qa-id='product-detail-info-product-name']",
        "[class*='product-detail-info__header-name']",
        "[class*='product-name']"
    ];

    let name = "";

    for (const selector of titleSelectors) {
        const el = document.querySelector(selector);

        if (el && el.innerText && el.innerText.trim()) {
            name = el.innerText.trim();
            break;
        }
    }

    if (!name) {
        const lines = bodyText
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        name = lines.find(line => {
            const upper = line.toUpperCase();

            return (
                line.length > 3 &&
                line.length < 80 &&
                !upper.includes("ZARA") &&
                !upper.includes("ADD") &&
                !upper.includes("VIEW SIMILAR") &&
                !upper.includes("PRIVACY") &&
                !upper.includes("SEARCH") &&
                !upper.includes("HELP") &&
                !upper.includes("LOG IN") &&
                !upper.includes("JOIN LIFE")
            );
        }) || "";
    }

    let priceText = "";

    const priceSelectors = [
        "[data-qa-id='product-detail-info-product-price']",
        "[data-qa-id*='price']",
        "[class*='price']",
        "[class*='Price']"
    ];

    for (const selector of priceSelectors) {
        const elements = Array.from(document.querySelectorAll(selector));

        const found = elements.find(el => {
            const text = el.innerText || el.textContent || "";

            return (
                text.includes("€") ||
                /[0-9]+(?:[,.][0-9]+)?\s*EUR/i.test(text) ||
                /[0-9]+(?:[,.][0-9]+)?\s*zł/i.test(text) ||
                /[0-9]+(?:[,.][0-9]+)?\s*PLN/i.test(text) ||
                /¥\s*[0-9,.]+/.test(text) ||
                /￥\s*[0-9,.]+/.test(text) ||
                /JPY\s*[0-9,.]+/i.test(text)
            );
        });

        if (found) {
            priceText = found.innerText.trim();
            break;
        }
    }

    if (!priceText) {
        const priceMatch =
            bodyText.match(/[0-9]+(?:[,.][0-9]+)?\s*€/) ||
            bodyText.match(/[0-9]+(?:[,.][0-9]+)?\s*EUR/i) ||
            bodyText.match(/[0-9]+(?:[,.][0-9]+)?\s*zł/i) ||
            bodyText.match(/[0-9]+(?:[,.][0-9]+)?\s*PLN/i) ||
            bodyText.match(/¥\s*[0-9,.]+/) ||
            bodyText.match(/￥\s*[0-9,.]+/) ||
            bodyText.match(/JPY\s*[0-9,.]+/i);

        if (priceMatch) {
            priceText = priceMatch[0];
        }
    }

    let color = "";

    const colorSelectors = [
        "[data-qa-id='product-detail-selected-color']",
        "[class*='selected-color']",
        "[class*='color-name']",
        "[class*='Color']",
        "[class*='colour']"
    ];

    for (const selector of colorSelectors) {
        const el = document.querySelector(selector);

        if (el && el.innerText && el.innerText.trim()) {
            color = el.innerText.trim();
            break;
        }
    }

    if (!color) {
        const lines = bodyText
            .split("\n")
            .map(x => x.trim())
            .filter(Boolean);

        const colorLine = lines.find(line => {
            const upper = line.toUpperCase();

            return (
                upper.includes("COLOUR") ||
                upper.includes("COLOR") ||
                upper.includes("MÀU")
            );
        });

        if (colorLine) {
            color = colorLine
                .replace(/colour/ig, "")
                .replace(/color/ig, "")
                .replace(/màu/ig, "")
                .replace(":", "")
                .trim();
        }
    }

    let description = "";

    const descSelectors = [
        "[data-qa-id='product-detail-info-description']",
        "[class*='description']",
        "[class*='Description']"
    ];

    for (const selector of descSelectors) {
        const el = document.querySelector(selector);

        if (el && el.innerText && el.innerText.trim().length > 10) {
            description = el.innerText.trim();
            break;
        }
    }

    return {
        name,
        priceText,
        price: priceText,
        color,
        description,
        bodyText: bodyText.slice(0, 2000)
    };
}

async function scrapeZaraProduct(url) {
    let browser;
    let context;
    let page;

    try {
        const countryCode = getCountryCodeFromUrl(url);
        const countryRule = getCountryRule(countryCode);

        browser = await createBrowser();
        context = await createContext(browser, countryCode);
        page = await preparePage(context);

        console.log("Đang mở Zara:", url);

        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        await page.waitForTimeout(4000);
        await acceptZaraPopups(page);

        await page.waitForLoadState("networkidle", {
            timeout: 20000
        }).catch(() => {});

        const pageText = await page.evaluate(() => document.body.innerText || "");

        if (isAccessDenied(pageText)) {
            return {
                success: false,
                status: 403,
                message: "Zara đang chặn truy cập Access Denied. Hãy thử lại sau hoặc đổi mạng/VPN."
            };
        }

        await page.waitForTimeout(2000);

        const basicData = await page.evaluate(extractProductDataBrowser);

        const galleryImages = await page
            .evaluate(extractGalleryImagesBrowser)
            .catch(() => []);

        const stockInfo = await page.evaluate(getStockInfoBrowser);

        let sizeChart = null;
        let productDimensionImage = "";

        const openedMeasurements = await openProductMeasurements(page);

        if (openedMeasurements) {
            productDimensionImage = await scrapeProductDimensionImage(page);
            sizeChart = await scrapeSizeChart(page);

            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(1000);
        }

        const sizeOptions = await scrapeSizeOptionsFromAdd(page);

        const availableSizes = cleanSizeList(
            sizeOptions
                .filter(item => item.available === true)
                .map(item => item.size)
        );

        const allSizeFromOptions = cleanSizeList(sizeOptions.map(item => item.size));

        const allSizeFromChart =
            sizeChart && Array.isArray(sizeChart.sizes)
                ? cleanSizeList(sizeChart.sizes)
                : [];

        const allSizes = allSizeFromOptions.length > 0
            ? allSizeFromOptions
            : allSizeFromChart;

        let finalSizeOptions = sizeOptions;

        if (finalSizeOptions.length === 0 && allSizeFromChart.length > 0) {
            finalSizeOptions = allSizeFromChart.map(size => {
                const isAvailable = availableSizes.includes(size);

                return {
                    size,
                    statusText: isAvailable ? "Available" : "Sold out",
                    available: isAvailable
                };
            });
        }

        const finalAvailableSizes = cleanSizeList(
            finalSizeOptions
                .filter(item => item.available === true)
                .map(item => item.size)
        );

        const finalSoldOutSizes = cleanSizeList(
            finalSizeOptions
                .filter(item => item.available === false)
                .map(item => item.size)
        );

        const isOutOfStock =
            stockInfo.isOutOfStock === true ||
            (
                finalSizeOptions.length > 0 &&
                finalAvailableSizes.length === 0
            );

        const finalGalleryImages = Array.isArray(galleryImages)
            ? galleryImages
            : [];

        const modelImage = pickModelImage(finalGalleryImages);

        const productOnlyImage =
            productDimensionImage ||
            pickProductOnlyImage(finalGalleryImages);

        /*
            Sửa giá:
            Ưu tiên dùng scrapePriceFromPage(page, countryCode)
            vì file price.js đã lọc giá visible DOM tốt hơn.
            Không lấy trực tiếp basicData.priceText nữa để tránh dính giá âm hoặc số rác.
        */
        const priceData = await scrapePriceFromPage(page, countryCode);

        let webPrice = Number(priceData.webPrice || priceData.price || 0);

        if (!webPrice) {
            webPrice = cleanPriceText(basicData.priceText || basicData.price);
        }

        webPrice = Math.abs(Number(webPrice || 0));

        const priceCalculation = calculateFinalPrice(webPrice, countryCode);

        const data = {
            name: basicData.name || "",
            title: basicData.name || "",
            color: basicData.color || "",

            price: webPrice,
            priceEur: webPrice,
            salePriceEur: webPrice,
            priceText: priceData.priceText || basicData.priceText || "",

            countryCode,
            countryName: countryRule?.name || countryCode,
            currency: priceData.currency || countryRule?.currency || "",

            rate: priceCalculation.rate || 0,
            laborFee: priceCalculation.laborFee || 0,
            finalPrice: priceCalculation.finalPrice || 0,
            finalPriceVnd: priceCalculation.finalPrice || 0,

            imageUrl: productOnlyImage || modelImage || finalGalleryImages[0] || "",
            productOnlyImage: productOnlyImage || "",
            modelImage: modelImage || "",
            dimensionImage: productDimensionImage || "",

            galleryImages: finalGalleryImages,
            description: basicData.description || "",
            availableSizes: finalAvailableSizes,
            soldOutSizes: finalSoldOutSizes,
            allSizes,
            sizeOptions: finalSizeOptions,
            sizeChart,
            stockStatus: isOutOfStock ? "out_of_stock" : "in_stock",
            isOutOfStock,
            hasAddButton: stockInfo.hasAddButton === true,
            rawStockInfo: stockInfo,

            priceSource: priceData.priceSource || "",
            priceCandidates: priceData.priceCandidates || []
        };

        console.log("Import xong:", {
            name: data.name,
            price: data.price,
            priceText: data.priceText,
            priceSource: data.priceSource,
            countryCode: data.countryCode,
            finalPrice: data.finalPrice,
            imageUrl: data.imageUrl,
            productOnlyImage: data.productOnlyImage,
            dimensionImage: data.dimensionImage,
            availableSizes: data.availableSizes,
            soldOutSizes: data.soldOutSizes,
            allSizes: data.allSizes,
            hasSizeChart: !!data.sizeChart
        });

        return {
            success: true,
            data
        };
    } catch (error) {
        console.log("scrapeZaraProduct error:", error.message);

        return {
            success: false,
            status: 500,
            message: error.message
        };
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

module.exports = {
    extractProductDataBrowser,
    scrapeZaraProduct
};