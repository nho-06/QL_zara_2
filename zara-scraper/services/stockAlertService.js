const {
    createBrowser,
    normalizeSize,
    checkOneZaraStock
} = require("../zara-tools");

const {
    firebaseGet,
    firebaseSet,
    firebaseUpdate,
    firebaseDelete,
    makeFirebaseKey
} = require("./firebaseService");

const {
    sendStockEmail
} = require("./mailService");

const {
    buildCountryUrls
} = require("../config/countryPriceRules");

const MAX_PARALLEL_COUNTRY_CHECK = 5;

function nowIso() {
    return new Date().toISOString();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(value) {
    return String(value || "").trim();
}

function cleanEmail(value) {
    return cleanText(value).toLowerCase();
}

function isActiveWatchingStatus(status) {
    return (
        status === "watching" ||
        status === "notified_waiting_soldout"
    );
}

function getProductImageFromProduct(product) {
    if (!product) return "";

    return (
        product.productOnlyImage ||
        product.dimensionImage ||
        product.productImage ||
        product.imageUrl ||
        product.image ||
        product.modelImage ||
        ""
    );
}

function normalizeProductUrl(url) {
    return cleanText(url);
}

function getProductCodeFromAlert(alert) {
    return (
        alert.productCode ||
        alert.code ||
        alert.id ||
        ""
    );
}

function getAlertKey(payload) {
    const email = cleanEmail(payload.email);
    const productCode = cleanText(payload.productCode || payload.code || "");
    const productUrl = cleanText(payload.productUrl || payload.url || "");
    const targetSize = normalizeSize(payload.targetSize || payload.size || "");

    const base = [
        email,
        productCode || productUrl,
        targetSize
    ]
        .filter(Boolean)
        .join("_");

    return makeFirebaseKey(base);
}

function normalizeAlertPayload(payload = {}) {
    const email = cleanEmail(payload.email);
    const productUrl = normalizeProductUrl(payload.productUrl || payload.url);
    const targetSize = normalizeSize(payload.targetSize || payload.size);

    const productName = cleanText(
        payload.productName ||
        payload.name ||
        payload.title ||
        "Sản phẩm Zara"
    );

    const productCode = cleanText(
        payload.productCode ||
        payload.code ||
        payload.id ||
        ""
    );

    const productImage = cleanText(
        payload.productImage ||
        payload.imageUrl ||
        payload.image ||
        payload.productOnlyImage ||
        payload.dimensionImage ||
        payload.modelImage ||
        ""
    );

    return {
        email,
        productUrl,
        targetSize,
        productName,
        productCode,
        productImage
    };
}

async function findProductInFirebase(alert) {
    try {
        const products = await firebaseGet("products");

        if (!products) return null;

        const alertCode = cleanText(alert.productCode);
        const alertUrl = cleanText(alert.productUrl).split("?")[0];

        for (const [id, product] of Object.entries(products)) {
            const productCode = cleanText(product.productCode || product.code || id);
            const productUrl = cleanText(product.productUrl || product.url).split("?")[0];

            if (alertCode && productCode && alertCode === productCode) {
                return {
                    id,
                    ...product
                };
            }

            if (alertUrl && productUrl && alertUrl === productUrl) {
                return {
                    id,
                    ...product
                };
            }
        }

        return null;
    } catch (error) {
        console.log("findProductInFirebase error:", error.message);
        return null;
    }
}

async function fillAlertProductData(alert) {
    const product = await findProductInFirebase(alert);

    if (!product) {
        return alert;
    }

    return {
        ...alert,

        productName:
            alert.productName ||
            product.name ||
            product.title ||
            "Sản phẩm Zara",

        productCode:
            alert.productCode ||
            product.productCode ||
            product.code ||
            product.id ||
            "",

        productUrl:
            alert.productUrl ||
            product.productUrl ||
            product.url ||
            "",

        productImage:
            alert.productImage ||
            getProductImageFromProduct(product),

        productId:
            alert.productId ||
            product.id ||
            ""
    };
}

async function saveWatchAlert(payload = {}) {
    const cleanPayload = normalizeAlertPayload(payload);

    if (!cleanPayload.email) {
        throw new Error("Thiếu email.");
    }

    if (!cleanPayload.productUrl) {
        throw new Error("Thiếu link sản phẩm Zara.");
    }

    if (!cleanPayload.targetSize) {
        throw new Error("Thiếu size cần canh.");
    }

    const key = getAlertKey(cleanPayload);
    const oldAlert = await firebaseGet(`stock_alerts/${key}`);

    const alert = {
        ...(oldAlert || {}),

        id: key,
        email: cleanPayload.email,
        productUrl: cleanPayload.productUrl,
        targetSize: cleanPayload.targetSize,

        productName: cleanPayload.productName,
        productCode: cleanPayload.productCode,
        productImage: cleanPayload.productImage,

        status: "watching",
        stoppedAt: "",

        notifyCount: oldAlert?.notifyCount || 0,

        lastStockStatus: oldAlert?.lastStockStatus || "",
        lastCheckedAt: oldAlert?.lastCheckedAt || "",
        lastNotifiedAt: oldAlert?.lastNotifiedAt || "",

        lastAvailableSizes: oldAlert?.lastAvailableSizes || [],
        lastSoldOutSizes: oldAlert?.lastSoldOutSizes || [],
        lastSizeMatched: oldAlert?.lastSizeMatched || false,

        lastMatchedCountries: oldAlert?.lastMatchedCountries || [],
        lastBestCountryResult: oldAlert?.lastBestCountryResult || null,

        createdAt: oldAlert?.createdAt || nowIso(),
        updatedAt: nowIso()
    };

    await firebaseSet(`stock_alerts/${key}`, alert);

    return {
        success: true,
        id: key,
        alert
    };
}

async function listStockAlerts() {
    const data = await firebaseGet("stock_alerts");

    if (!data) {
        return [];
    }

    return Object.entries(data).map(([id, alert]) => ({
        id,
        ...alert
    }));
}

async function stopStockAlert(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error("Thiếu id canh back.");
    }

    const oldAlert = await firebaseGet(`stock_alerts/${cleanId}`);

    if (!oldAlert) {
        throw new Error("Không tìm thấy sản phẩm đang canh.");
    }

    await firebaseUpdate(`stock_alerts/${cleanId}`, {
        status: "stopped",
        stoppedAt: nowIso(),
        updatedAt: nowIso()
    });

    return {
        success: true,
        id: cleanId,
        status: "stopped"
    };
}

async function rewatchStockAlert(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error("Thiếu id canh back.");
    }

    const oldAlert = await firebaseGet(`stock_alerts/${cleanId}`);

    if (!oldAlert) {
        throw new Error("Không tìm thấy sản phẩm cần canh lại.");
    }

    await firebaseUpdate(`stock_alerts/${cleanId}`, {
        status: "watching",
        stoppedAt: "",
        updatedAt: nowIso()
    });

    return {
        success: true,
        id: cleanId,
        status: "watching"
    };
}

async function deleteStockAlert(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error("Thiếu id canh back.");
    }

    await firebaseDelete(`stock_alerts/${cleanId}`);

    return {
        success: true
    };
}

function chunkArray(items, size) {
    const result = [];

    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }

    return result;
}

async function checkCountryBatch(browser, alert, countryItems) {
    const tasks = countryItems.map(async countryItem => {
        try {
            console.log(
                `Đang check ${countryItem.countryCode.toUpperCase()} - ${alert.productName || alert.productCode || alert.productUrl}`
            );

            const stock = await checkOneZaraStock(
                browser,
                countryItem.url,
                alert.targetSize,
                countryItem.countryCode
            );

            return {
                ...stock,
                countryCode: countryItem.countryCode,
                countryName: countryItem.countryName,
                currency: countryItem.currency,
                rate: stock.rate || countryItem.rate,
                laborFee: stock.laborFee || countryItem.laborFee,
                productUrl: countryItem.url,
                url: countryItem.url
            };
        } catch (error) {
            return {
                inStock: false,
                sizeMatched: false,
                stockStatus: "error",
                availableSizes: [],
                soldOutSizes: [],
                sizeOptions: [],
                countryCode: countryItem.countryCode,
                countryName: countryItem.countryName,
                currency: countryItem.currency,
                rate: countryItem.rate,
                laborFee: countryItem.laborFee,
                productUrl: countryItem.url,
                url: countryItem.url,
                error: error.message,
                checkedAt: nowIso()
            };
        }
    });

    return await Promise.all(tasks);
}

async function checkMultiCountryStock(browser, alert) {
    const countryUrls = buildCountryUrls(alert.productUrl);

    const chunks = chunkArray(countryUrls, MAX_PARALLEL_COUNTRY_CHECK);
    const results = [];

    for (const group of chunks) {
        const groupResults = await checkCountryBatch(browser, alert, group);
        results.push(...groupResults);

        await sleep(800);
    }

    const matchedCountries = results
        .filter(item => item.inStock === true && item.sizeMatched === true)
        .map(item => ({
            countryCode: item.countryCode,
            countryName: item.countryName,
            currency: item.currency,

            productUrl: item.productUrl || item.url,
            url: item.productUrl || item.url,

            priceText: item.priceText || "",
            webPrice: Number(item.webPrice || item.price || 0),
            price: Number(item.webPrice || item.price || 0),

            rate: Number(item.rate || 0),
            laborFee: Number(item.laborFee || 0),
            finalPrice: Number(item.finalPrice || item.finalPriceVnd || 0),
            finalPriceVnd: Number(item.finalPrice || item.finalPriceVnd || 0),

            availableSizes: item.availableSizes || [],
            soldOutSizes: item.soldOutSizes || [],
            stockStatus: item.stockStatus || "",
            checkedAt: item.checkedAt || nowIso()
        }))
        .sort((a, b) => {
            const priceA = Number(a.finalPrice || 0);
            const priceB = Number(b.finalPrice || 0);

            if (priceA === 0 && priceB > 0) return 1;
            if (priceB === 0 && priceA > 0) return -1;

            return priceA - priceB;
        });

    const bestCountryResult = matchedCountries[0] || null;

    const availableSizeSet = new Set();
    const soldOutSizeSet = new Set();

    results.forEach(item => {
        (item.availableSizes || []).forEach(size => availableSizeSet.add(size));
        (item.soldOutSizes || []).forEach(size => soldOutSizeSet.add(size));
    });

    return {
        inStock: matchedCountries.length > 0,
        sizeMatched: matchedCountries.length > 0,
        targetSize: alert.targetSize,

        results,
        matchedCountries,
        bestCountryResult,

        availableSizes: Array.from(availableSizeSet),
        soldOutSizes: Array.from(soldOutSizeSet),

        stockStatus: matchedCountries.length > 0 ? "in_stock" : "out_of_stock",
        checkedAt: nowIso()
    };
}

async function updateProductStockFromCheck(alert, stock) {
    const productCode = getProductCodeFromAlert(alert);

    if (!productCode) return;

    const product = await findProductInFirebase(alert);

    if (!product) return;

    const updateData = {
        availableSizes: stock.availableSizes || [],
        soldOutSizes: stock.soldOutSizes || [],
        stockStatus: stock.stockStatus || "",
        isOutOfStock: stock.inStock ? false : true,
        updatedAt: nowIso()
    };

    if (stock.bestCountryResult) {
        updateData.lastBestCountryResult = stock.bestCountryResult;
        updateData.lastBackCountryCode = stock.bestCountryResult.countryCode || "";
        updateData.lastBackCountryName = stock.bestCountryResult.countryName || "";
        updateData.lastBackPrice = stock.bestCountryResult.finalPrice || 0;
    }

    await firebaseUpdate(`products/${product.id}`, updateData);
}

async function shouldSkipAlertBecauseStopped(id) {
    const latestAlert = await firebaseGet(`stock_alerts/${id}`);

    if (!latestAlert) {
        return true;
    }

    return latestAlert.status === "stopped";
}

async function checkStockAlerts() {
    const alertsData = await firebaseGet("stock_alerts");

    if (!alertsData) {
        return {
            success: true,
            checked: 0,
            notified: 0,
            skipped: 0,
            message: "Không có sản phẩm đang canh."
        };
    }

    const alerts = Object.entries(alertsData)
        .map(([id, alert]) => ({
            id,
            ...alert
        }))
        .filter(alert => isActiveWatchingStatus(alert.status));

    if (alerts.length === 0) {
        return {
            success: true,
            checked: 0,
            notified: 0,
            skipped: 0,
            message: "Không có sản phẩm đang canh."
        };
    }

    let browser;
    let checked = 0;
    let notified = 0;
    let skipped = 0;
    let errors = 0;

    try {
        browser = await createBrowser();

        for (const rawAlert of alerts) {
            const isStoppedBeforeCheck = await shouldSkipAlertBecauseStopped(rawAlert.id);

            if (isStoppedBeforeCheck) {
                skipped++;
                continue;
            }

            checked++;

            const alert = await fillAlertProductData(rawAlert);

            try {
                console.log("Đang canh back nhiều nước:", {
                    productName: alert.productName,
                    productCode: alert.productCode,
                    size: alert.targetSize,
                    email: alert.email
                });

                const stock = await checkMultiCountryStock(browser, alert);

                const isStoppedAfterCheck = await shouldSkipAlertBecauseStopped(rawAlert.id);

                if (isStoppedAfterCheck) {
                    skipped++;
                    continue;
                }

                const updateData = {
                    productName: alert.productName || "",
                    productCode: alert.productCode || "",
                    productUrl: alert.productUrl || "",
                    productImage: alert.productImage || "",

                    lastCheckedAt: stock.checkedAt,
                    lastAvailableSizes: stock.availableSizes || [],
                    lastSoldOutSizes: stock.soldOutSizes || [],
                    lastSizeMatched: stock.sizeMatched === true,
                    lastStockStatus: stock.stockStatus || "",

                    lastCountryResults: stock.results || [],
                    lastMatchedCountries: stock.matchedCountries || [],
                    lastBestCountryResult: stock.bestCountryResult || null,

                    updatedAt: nowIso()
                };

                await updateProductStockFromCheck(alert, stock);

                if (alert.status === "watching" && stock.inStock === true) {
                    const emailAlert = {
                        ...alert,
                        productUrl:
                            stock.bestCountryResult?.productUrl ||
                            stock.bestCountryResult?.url ||
                            alert.productUrl,
                        matchedCountries: stock.matchedCountries,
                        bestCountryResult: stock.bestCountryResult
                    };

                    const isStoppedBeforeEmail = await shouldSkipAlertBecauseStopped(rawAlert.id);

                    if (isStoppedBeforeEmail) {
                        skipped++;
                        continue;
                    }

                    await sendStockEmail(emailAlert);

                    notified++;

                    const isStoppedBeforeUpdate = await shouldSkipAlertBecauseStopped(rawAlert.id);

                    if (isStoppedBeforeUpdate) {
                        skipped++;
                        continue;
                    }

                    await firebaseUpdate(`stock_alerts/${rawAlert.id}`, {
                        ...updateData,
                        status: "notified_waiting_soldout",
                        notifyCount: Number(alert.notifyCount || 0) + 1,
                        lastNotifiedAt: nowIso()
                    });

                    continue;
                }

                if (
                    alert.status === "notified_waiting_soldout" &&
                    stock.inStock === false
                ) {
                    await firebaseUpdate(`stock_alerts/${rawAlert.id}`, {
                        ...updateData,
                        status: "watching"
                    });

                    continue;
                }

                await firebaseUpdate(`stock_alerts/${rawAlert.id}`, updateData);
            } catch (error) {
                errors++;

                console.log("check alert error:", error.message);

                const isStoppedBeforeErrorUpdate = await shouldSkipAlertBecauseStopped(rawAlert.id);

                if (!isStoppedBeforeErrorUpdate) {
                    await firebaseUpdate(`stock_alerts/${rawAlert.id}`, {
                        lastError: error.message,
                        lastCheckedAt: nowIso(),
                        updatedAt: nowIso()
                    });
                }
            }

            await sleep(1200);
        }

        return {
            success: true,
            checked,
            notified,
            skipped,
            errors
        };
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

async function checkSingleStock(productUrl, targetSize = "") {
    if (!productUrl) {
        throw new Error("Thiếu link sản phẩm Zara.");
    }

    let browser;

    try {
        browser = await createBrowser();

        const alert = {
            productUrl,
            targetSize: normalizeSize(targetSize)
        };

        const result = await checkMultiCountryStock(browser, alert);

        return {
            success: true,
            ...result
        };
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

async function sendTestStockEmail(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error("Thiếu id canh back.");
    }

    const alert = await firebaseGet(`stock_alerts/${cleanId}`);

    if (!alert) {
        throw new Error("Không tìm thấy sản phẩm đang canh.");
    }

    if (alert.status === "stopped") {
        throw new Error("Sản phẩm này đã dừng canh, không gửi mail test.");
    }

    const filledAlert = await fillAlertProductData({
        id: cleanId,
        ...alert
    });

    const testAlert = {
        ...filledAlert,
        bestCountryResult:
            filledAlert.lastBestCountryResult ||
            filledAlert.bestCountryResult ||
            null,
        matchedCountries:
            filledAlert.lastMatchedCountries ||
            filledAlert.matchedCountries ||
            []
    };

    await sendStockEmail(testAlert, {
        isTest: true
    });

    await firebaseUpdate(`stock_alerts/${cleanId}`, {
        lastTestEmailAt: nowIso(),
        updatedAt: nowIso()
    });

    return {
        success: true
    };
}

module.exports = {
    saveWatchAlert,
    listStockAlerts,
    stopStockAlert,
    rewatchStockAlert,
    deleteStockAlert,
    checkStockAlerts,
    checkSingleStock,
    sendTestStockEmail
};