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

const WATCH_COUNTRY_LABELS = {
    ALL: "Tất cả",
    ES: "Tây Ban Nha",
    DE: "Đức",
    PL: "Ba Lan",
    PT: "Bồ Đào Nha",
    JP: "Nhật"
};

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

function normalizeCountryCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

function normalizeTargetCountries(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return ["ALL"];
    }

    const countries = value
        .map(item => normalizeCountryCode(item))
        .filter(Boolean);

    if (
        countries.length === 0 ||
        countries.includes("ALL")
    ) {
        return ["ALL"];
    }

    return [...new Set(countries)];
}

function getCountryNamesFromCodes(codes) {
    const list = normalizeTargetCountries(codes);

    if (list.includes("ALL")) {
        return ["Tất cả"];
    }

    return list.map(code => {
        return WATCH_COUNTRY_LABELS[code] || code;
    });
}

function isActiveWatchingStatus(status) {
    return (
        status === "watching" ||
        status === "notified_waiting_soldout"
    );
}

function getProductImageFromProduct(product) {
    if (!product) {
        return "";
    }

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

    const productCode = cleanText(
        payload.productCode ||
        payload.code ||
        ""
    );

    const productUrl = cleanText(
        payload.productUrl ||
        payload.url ||
        ""
    );

    const targetSize = normalizeSize(
        payload.targetSize ||
        payload.size ||
        ""
    );

    const targetCountries = normalizeTargetCountries(
        payload.targetCountries
    )
        .join("-")
        .toLowerCase();

    const base = [
        email,
        productCode || productUrl,
        targetSize,
        targetCountries
    ]
        .filter(Boolean)
        .join("_");

    return makeFirebaseKey(base);
}

function normalizeAlertPayload(payload = {}) {
    const email = cleanEmail(payload.email);

    const productUrl = normalizeProductUrl(
        payload.productUrl ||
        payload.url
    );

    const targetSize = normalizeSize(
        payload.targetSize ||
        payload.size
    );

    const targetCountries = normalizeTargetCountries(
        payload.targetCountries
    );

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
        targetCountries,
        targetCountryNames:
            getCountryNamesFromCodes(targetCountries),
        productName,
        productCode,
        productImage
    };
}

async function findProductInFirebase(alert) {
    try {
        const products = await firebaseGet("products");

        if (!products) {
            return null;
        }

        const alertCode = cleanText(
            alert.productCode
        );

        const alertUrl = cleanText(
            alert.productUrl
        ).split("?")[0];

        for (
            const [id, product]
            of Object.entries(products)
        ) {
            const productCode = cleanText(
                product.productCode ||
                product.code ||
                id
            );

            const productUrl = cleanText(
                product.productUrl ||
                product.url
            ).split("?")[0];

            if (
                alertCode &&
                productCode &&
                alertCode === productCode
            ) {
                return {
                    id,
                    ...product
                };
            }

            if (
                alertUrl &&
                productUrl &&
                alertUrl === productUrl
            ) {
                return {
                    id,
                    ...product
                };
            }
        }

        return null;
    } catch (error) {
        console.log(
            "findProductInFirebase error:",
            error.message
        );

        return null;
    }
}

async function fillAlertProductData(alert) {
    const product = await findProductInFirebase(alert);

    const targetCountries = normalizeTargetCountries(
        alert.targetCountries
    );

    if (!product) {
        return {
            ...alert,
            targetCountries,
            targetCountryNames:
                getCountryNamesFromCodes(targetCountries)
        };
    }

    return {
        ...alert,

        targetCountries,
        targetCountryNames:
            getCountryNamesFromCodes(targetCountries),

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

    const oldAlert = await firebaseGet(
        `stock_alerts/${key}`
    );

    const alert = {
        ...(oldAlert || {}),

        id: key,

        email: cleanPayload.email,
        productUrl: cleanPayload.productUrl,
        targetSize: cleanPayload.targetSize,

        targetCountries:
            cleanPayload.targetCountries,

        targetCountryNames:
            cleanPayload.targetCountryNames,

        productName:
            cleanPayload.productName,

        productCode:
            cleanPayload.productCode,

        productImage:
            cleanPayload.productImage,

        status: "watching",
        stoppedAt: "",

        notifyCount:
            oldAlert?.notifyCount || 0,

        lastStockStatus:
            oldAlert?.lastStockStatus || "",

        lastCheckedAt:
            oldAlert?.lastCheckedAt || "",

        lastNotifiedAt:
            oldAlert?.lastNotifiedAt || "",

        lastAvailableSizes:
            oldAlert?.lastAvailableSizes || [],

        lastSoldOutSizes:
            oldAlert?.lastSoldOutSizes || [],

        lastSizeMatched:
            oldAlert?.lastSizeMatched || false,

        lastMatchedCountries:
            oldAlert?.lastMatchedCountries || [],

        lastBestCountryResult:
            oldAlert?.lastBestCountryResult || null,

        lastError:
            oldAlert?.lastError || "",

        createdAt:
            oldAlert?.createdAt || nowIso(),

        updatedAt:
            nowIso()
    };

    await firebaseSet(
        `stock_alerts/${key}`,
        alert
    );

    return {
        success: true,
        id: key,
        alert
    };
}

async function listStockAlerts() {
    const data = await firebaseGet(
        "stock_alerts"
    );

    if (!data) {
        return [];
    }

    return Object.entries(data).map(
        ([id, alert]) => ({
            id,
            ...alert,

            targetCountries:
                normalizeTargetCountries(
                    alert.targetCountries
                ),

            targetCountryNames:
                getCountryNamesFromCodes(
                    alert.targetCountries
                )
        })
    );
}

async function stopStockAlert(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error(
            "Thiếu id canh back."
        );
    }

    const oldAlert = await firebaseGet(
        `stock_alerts/${cleanId}`
    );

    if (!oldAlert) {
        throw new Error(
            "Không tìm thấy sản phẩm đang canh."
        );
    }

    await firebaseUpdate(
        `stock_alerts/${cleanId}`,
        {
            status: "stopped",
            stoppedAt: nowIso(),
            updatedAt: nowIso()
        }
    );

    return {
        success: true,
        id: cleanId,
        status: "stopped"
    };
}

async function rewatchStockAlert(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error(
            "Thiếu id canh back."
        );
    }

    const oldAlert = await firebaseGet(
        `stock_alerts/${cleanId}`
    );

    if (!oldAlert) {
        throw new Error(
            "Không tìm thấy sản phẩm cần canh lại."
        );
    }

    await firebaseUpdate(
        `stock_alerts/${cleanId}`,
        {
            status: "watching",
            stoppedAt: "",
            lastError: "",
            updatedAt: nowIso()
        }
    );

    return {
        success: true,
        id: cleanId,
        status: "watching"
    };
}

async function deleteStockAlert(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error(
            "Thiếu id canh back."
        );
    }

    await firebaseDelete(
        `stock_alerts/${cleanId}`
    );

    return {
        success: true
    };
}

function chunkArray(items, size) {
    const result = [];

    for (
        let i = 0;
        i < items.length;
        i += size
    ) {
        result.push(
            items.slice(i, i + size)
        );
    }

    return result;
}

function filterCountryUrlsByAlert(
    countryUrls,
    alert
) {
    const targetCountries =
        normalizeTargetCountries(
            alert.targetCountries
        );

    if (targetCountries.includes("ALL")) {
        return countryUrls;
    }

    return countryUrls.filter(item => {
        const code = normalizeCountryCode(
            item.countryCode
        );

        return targetCountries.includes(code);
    });
}

async function checkCountryBatch(
    browser,
    alert,
    countryItems
) {
    const tasks = countryItems.map(
        async countryItem => {
            const countryCode =
                normalizeCountryCode(
                    countryItem.countryCode
                );

            const countryName =
                countryItem.countryName ||
                WATCH_COUNTRY_LABELS[countryCode] ||
                countryCode;

            const productLabel =
                alert.productName ||
                alert.productCode ||
                alert.productUrl;

            console.log(
                `Đang check ${countryCode} (${countryName}) - ${productLabel} - size ${alert.targetSize}`
            );

            try {
                const stock = await checkOneZaraStock(
                    browser,
                    countryItem.url,
                    alert.targetSize,
                    countryItem.countryCode
                );

                const result = {
                    ...stock,

                    countryCode,
                    countryName,

                    currency:
                        countryItem.currency,

                    rate:
                        stock.rate ||
                        countryItem.rate,

                    laborFee:
                        stock.laborFee ||
                        countryItem.laborFee,

                    productUrl:
                        countryItem.url,

                    url:
                        countryItem.url
                };

                if (
                    result.inStock === true &&
                    result.sizeMatched === true
                ) {
                    console.log(
                        `${countryCode} - size ${alert.targetSize} ĐÃ BACK - ${productLabel}`
                    );
                } else {
                    console.log(
                        `${countryCode} - size ${alert.targetSize} chưa có - tiếp tục canh`
                    );
                }

                if (
                    Array.isArray(
                        result.availableSizes
                    ) &&
                    result.availableSizes.length > 0
                ) {
                    console.log(
                        `Size đang còn tại ${countryCode}: ${result.availableSizes.join(", ")}`
                    );
                } else {
                    console.log(
                        `${countryCode}: chưa có size nào đang còn`
                    );
                }

                if (
                    Array.isArray(
                        result.soldOutSizes
                    ) &&
                    result.soldOutSizes.length > 0
                ) {
                    console.log(
                        `Size đang hết tại ${countryCode}: ${result.soldOutSizes.join(", ")}`
                    );
                }

                return result;
            } catch (error) {
                console.log(
                    `Lỗi check ${countryCode} - ${productLabel}: ${error.message}`
                );

                return {
                    inStock: false,
                    sizeMatched: false,
                    stockStatus: "error",

                    availableSizes: [],
                    soldOutSizes: [],
                    sizeOptions: [],

                    countryCode,
                    countryName,

                    currency:
                        countryItem.currency,

                    rate:
                        countryItem.rate,

                    laborFee:
                        countryItem.laborFee,

                    productUrl:
                        countryItem.url,

                    url:
                        countryItem.url,

                    error:
                        error.message,

                    checkedAt:
                        nowIso()
                };
            }
        }
    );

    return await Promise.all(tasks);
}

async function checkMultiCountryStock(
    browser,
    alert
) {
    const allCountryUrls =
        buildCountryUrls(
            alert.productUrl
        );

    const countryUrls =
        filterCountryUrlsByAlert(
            allCountryUrls,
            alert
        );

    const productLabel =
        alert.productName ||
        alert.productCode ||
        alert.productUrl;

    if (countryUrls.length === 0) {
        console.log(
            `Không tìm được nước cần check cho ${productLabel}`
        );

        return {
            inStock: false,
            sizeMatched: false,
            targetSize: alert.targetSize,

            results: [],
            matchedCountries: [],
            bestCountryResult: null,

            availableSizes: [],
            soldOutSizes: [],

            stockStatus:
                "out_of_stock",

            checkedAt:
                nowIso()
        };
    }

    console.log(
        `Bắt đầu check ${countryUrls.length} nước cho ${productLabel}: ${countryUrls
            .map(item => {
                return normalizeCountryCode(
                    item.countryCode
                );
            })
            .join(", ")}`
    );

    const chunks = chunkArray(
        countryUrls,
        MAX_PARALLEL_COUNTRY_CHECK
    );

    const results = [];

    for (const group of chunks) {
        const groupResults =
            await checkCountryBatch(
                browser,
                alert,
                group
            );

        results.push(
            ...groupResults
        );

        await sleep(800);
    }

    const matchedCountries = results
        .filter(item => {
            return (
                item.inStock === true &&
                item.sizeMatched === true
            );
        })
        .map(item => ({
            countryCode:
                item.countryCode,

            countryName:
                item.countryName,

            currency:
                item.currency,

            productUrl:
                item.productUrl ||
                item.url,

            url:
                item.productUrl ||
                item.url,

            priceText:
                item.priceText || "",

            webPrice:
                Number(
                    item.webPrice ||
                    item.price ||
                    0
                ),

            price:
                Number(
                    item.webPrice ||
                    item.price ||
                    0
                ),

            rate:
                Number(
                    item.rate || 0
                ),

            laborFee:
                Number(
                    item.laborFee || 0
                ),

            finalPrice:
                Number(
                    item.finalPrice ||
                    item.finalPriceVnd ||
                    0
                ),

            finalPriceVnd:
                Number(
                    item.finalPrice ||
                    item.finalPriceVnd ||
                    0
                ),

            availableSizes:
                item.availableSizes || [],

            soldOutSizes:
                item.soldOutSizes || [],

            stockStatus:
                item.stockStatus || "",

            checkedAt:
                item.checkedAt ||
                nowIso()
        }))
        .sort((a, b) => {
            const priceA = Number(
                a.finalPrice || 0
            );

            const priceB = Number(
                b.finalPrice || 0
            );

            if (
                priceA === 0 &&
                priceB > 0
            ) {
                return 1;
            }

            if (
                priceB === 0 &&
                priceA > 0
            ) {
                return -1;
            }

            return priceA - priceB;
        });

    const bestCountryResult =
        matchedCountries[0] || null;

    const availableSizeSet =
        new Set();

    const soldOutSizeSet =
        new Set();

    results.forEach(item => {
        (
            item.availableSizes || []
        ).forEach(size => {
            availableSizeSet.add(size);
        });

        (
            item.soldOutSizes || []
        ).forEach(size => {
            soldOutSizeSet.add(size);
        });
    });

    const errorResults = results.filter(
        item => {
            return (
                item.stockStatus === "error" ||
                Boolean(item.error)
            );
        }
    );

    if (matchedCountries.length > 0) {
        console.log(
            `${productLabel} - size ${alert.targetSize} đã back tại: ${matchedCountries
                .map(item => {
                    return item.countryName;
                })
                .join(", ")}`
        );

        if (bestCountryResult) {
            console.log(
                `Nước tốt nhất: ${bestCountryResult.countryName} - giá cuối: ${bestCountryResult.finalPriceVnd || 0}`
            );
        }
    } else if (
        results.length > 0 &&
        errorResults.length === results.length
    ) {
        console.log(
            `Không check được ${productLabel}. Tất cả nước đều lỗi.`
        );
    } else {
        console.log(
            `${productLabel} - size ${alert.targetSize} chưa back. Tiếp tục canh.`
        );
    }

    console.log(
        `Check xong ${productLabel} lúc ${nowIso()}`
    );

    return {
        inStock:
            matchedCountries.length > 0,

        sizeMatched:
            matchedCountries.length > 0,

        targetSize:
            alert.targetSize,

        results,
        matchedCountries,
        bestCountryResult,

        availableSizes:
            Array.from(
                availableSizeSet
            ),

        soldOutSizes:
            Array.from(
                soldOutSizeSet
            ),

        stockStatus:
            matchedCountries.length > 0
                ? "in_stock"
                : (
                    results.length > 0 &&
                    errorResults.length === results.length
                )
                    ? "error"
                    : "out_of_stock",

        checkedAt:
            nowIso()
    };
}

async function updateProductStockFromCheck(
    alert,
    stock
) {
    const productCode =
        getProductCodeFromAlert(alert);

    if (!productCode) {
        return;
    }

    const product =
        await findProductInFirebase(alert);

    if (!product) {
        return;
    }

    const updateData = {
        availableSizes:
            stock.availableSizes || [],

        soldOutSizes:
            stock.soldOutSizes || [],

        stockStatus:
            stock.stockStatus || "",

        isOutOfStock:
            stock.inStock
                ? false
                : true,

        updatedAt:
            nowIso()
    };

    if (stock.bestCountryResult) {
        updateData.lastBestCountryResult =
            stock.bestCountryResult;

        updateData.lastBackCountryCode =
            stock.bestCountryResult.countryCode ||
            "";

        updateData.lastBackCountryName =
            stock.bestCountryResult.countryName ||
            "";

        updateData.lastBackPrice =
            stock.bestCountryResult.finalPrice ||
            0;
    }

    await firebaseUpdate(
        `products/${product.id}`,
        updateData
    );
}

async function shouldSkipAlertBecauseStopped(id) {
    const latestAlert =
        await firebaseGet(
            `stock_alerts/${id}`
        );

    if (!latestAlert) {
        return true;
    }

    return (
        latestAlert.status === "stopped"
    );
}

async function checkStockAlerts() {
    const alertsData =
        await firebaseGet(
            "stock_alerts"
        );

    if (!alertsData) {
        console.log(
            "Không có sản phẩm đang canh."
        );

        return {
            success: true,
            checked: 0,
            notified: 0,
            skipped: 0,
            errors: 0,
            message:
                "Không có sản phẩm đang canh."
        };
    }

    const alerts = Object.entries(
        alertsData
    )
        .map(([id, alert]) => ({
            id,
            ...alert,

            targetCountries:
                normalizeTargetCountries(
                    alert.targetCountries
                ),

            targetCountryNames:
                getCountryNamesFromCodes(
                    alert.targetCountries
                )
        }))
        .filter(alert => {
            return isActiveWatchingStatus(
                alert.status
            );
        });

    if (alerts.length === 0) {
        console.log(
            "Không có sản phẩm đang canh."
        );

        return {
            success: true,
            checked: 0,
            notified: 0,
            skipped: 0,
            errors: 0,
            message:
                "Không có sản phẩm đang canh."
        };
    }

    let browser;

    let checked = 0;
    let notified = 0;
    let skipped = 0;
    let errors = 0;

    console.log(
        `Bắt đầu vòng canh back. Tổng sản phẩm: ${alerts.length}`
    );

    try {
        browser = await createBrowser();

        for (const rawAlert of alerts) {
            const isStoppedBeforeCheck =
                await shouldSkipAlertBecauseStopped(
                    rawAlert.id
                );

            if (isStoppedBeforeCheck) {
                skipped++;

                console.log(
                    `Bỏ qua vì đã dừng canh: ${rawAlert.productName || rawAlert.productCode || rawAlert.id}`
                );

                continue;
            }

            checked++;

            const alert =
                await fillAlertProductData(
                    rawAlert
                );

            try {
                console.log(
                    "Đang canh back:",
                    {
                        productName:
                            alert.productName,

                        productCode:
                            alert.productCode,

                        size:
                            alert.targetSize,

                        email:
                            alert.email,

                        countries:
                            alert.targetCountries
                    }
                );

                const stock =
                    await checkMultiCountryStock(
                        browser,
                        alert
                    );

                const isStoppedAfterCheck =
                    await shouldSkipAlertBecauseStopped(
                        rawAlert.id
                    );

                if (isStoppedAfterCheck) {
                    skipped++;

                    console.log(
                        `Đã dừng trong lúc đang check: ${alert.productName}`
                    );

                    continue;
                }

                const updateData = {
                    productName:
                        alert.productName || "",

                    productCode:
                        alert.productCode || "",

                    productUrl:
                        alert.productUrl || "",

                    productImage:
                        alert.productImage || "",

                    targetCountries:
                        normalizeTargetCountries(
                            alert.targetCountries
                        ),

                    targetCountryNames:
                        getCountryNamesFromCodes(
                            alert.targetCountries
                        ),

                    lastCheckedAt:
                        stock.checkedAt,

                    lastAvailableSizes:
                        stock.availableSizes || [],

                    lastSoldOutSizes:
                        stock.soldOutSizes || [],

                    lastSizeMatched:
                        stock.sizeMatched === true,

                    lastStockStatus:
                        stock.stockStatus || "",

                    lastCountryResults:
                        stock.results || [],

                    lastMatchedCountries:
                        stock.matchedCountries || [],

                    lastBestCountryResult:
                        stock.bestCountryResult || null,

                    lastError:
                        stock.stockStatus === "error"
                            ? (
                                stock.results
                                    ?.map(item => item.error)
                                    .filter(Boolean)
                                    .join(" | ") ||
                                "Không check được Zara."
                            )
                            : "",

                    updatedAt:
                        nowIso()
                };

                await updateProductStockFromCheck(
                    alert,
                    stock
                );

                if (
                    alert.status === "watching" &&
                    stock.inStock === true
                ) {
                    const emailAlert = {
                        ...alert,

                        productUrl:
                            stock.bestCountryResult
                                ?.productUrl ||
                            stock.bestCountryResult
                                ?.url ||
                            alert.productUrl,

                        matchedCountries:
                            stock.matchedCountries,

                        bestCountryResult:
                            stock.bestCountryResult
                    };

                    const isStoppedBeforeEmail =
                        await shouldSkipAlertBecauseStopped(
                            rawAlert.id
                        );

                    if (isStoppedBeforeEmail) {
                        skipped++;
                        continue;
                    }

                    console.log(
                        `Đang gửi mail back size: ${alert.productName} - size ${alert.targetSize}`
                    );

                    await sendStockEmail(
                        emailAlert
                    );

                    notified++;

                    console.log(
                        `Đã gửi mail thành công: ${alert.email}`
                    );

                    const isStoppedBeforeUpdate =
                        await shouldSkipAlertBecauseStopped(
                            rawAlert.id
                        );

                    if (isStoppedBeforeUpdate) {
                        skipped++;
                        continue;
                    }

                    await firebaseUpdate(
                        `stock_alerts/${rawAlert.id}`,
                        {
                            ...updateData,

                            status:
                                "notified_waiting_soldout",

                            notifyCount:
                                Number(
                                    alert.notifyCount ||
                                    0
                                ) + 1,

                            lastNotifiedAt:
                                nowIso()
                        }
                    );

                    console.log(
                        `Đã lưu trạng thái đã thông báo: ${alert.productName}`
                    );

                    continue;
                }

                if (
                    alert.status ===
                        "notified_waiting_soldout" &&
                    stock.inStock === false
                ) {
                    await firebaseUpdate(
                        `stock_alerts/${rawAlert.id}`,
                        {
                            ...updateData,
                            status:
                                "watching"
                        }
                    );

                    console.log(
                        `${alert.productName} đã hết lại. Chuyển về trạng thái tiếp tục canh.`
                    );

                    continue;
                }

                await firebaseUpdate(
                    `stock_alerts/${rawAlert.id}`,
                    {
                        ...updateData
                    }
                );

                console.log(
                    `Đã lưu kết quả check Firebase: ${alert.productName} - size ${alert.targetSize}`
                );
            } catch (error) {
                errors++;

                console.log(
                    `Check thất bại: ${alert.productName || alert.productCode} - ${error.message}`
                );

                const isStoppedBeforeErrorUpdate =
                    await shouldSkipAlertBecauseStopped(
                        rawAlert.id
                    );

                if (!isStoppedBeforeErrorUpdate) {
                    await firebaseUpdate(
                        `stock_alerts/${rawAlert.id}`,
                        {
                            lastError:
                                error.message,

                            lastStockStatus:
                                "error",

                            lastCheckedAt:
                                nowIso(),

                            updatedAt:
                                nowIso()
                        }
                    );
                }
            }

            await sleep(1200);
        }

        console.log(
            "Kết thúc vòng canh back:",
            {
                checked,
                notified,
                skipped,
                errors
            }
        );

        return {
            success: true,
            checked,
            notified,
            skipped,
            errors
        };
    } finally {
        if (browser) {
            await browser
                .close()
                .catch(() => {});
        }
    }
}

async function checkSingleStock(
    productUrl,
    targetSize = ""
) {
    if (!productUrl) {
        throw new Error(
            "Thiếu link sản phẩm Zara."
        );
    }

    let browser;

    try {
        browser = await createBrowser();

        const alert = {
            productUrl,

            targetSize:
                normalizeSize(
                    targetSize
                ),

            targetCountries:
                ["ALL"]
        };

        const result =
            await checkMultiCountryStock(
                browser,
                alert
            );

        return {
            success: true,
            ...result
        };
    } finally {
        if (browser) {
            await browser
                .close()
                .catch(() => {});
        }
    }
}

async function sendTestStockEmail(id) {
    const cleanId = cleanText(id);

    if (!cleanId) {
        throw new Error(
            "Thiếu id canh back."
        );
    }

    const alert = await firebaseGet(
        `stock_alerts/${cleanId}`
    );

    if (!alert) {
        throw new Error(
            "Không tìm thấy sản phẩm đang canh."
        );
    }

    if (alert.status === "stopped") {
        throw new Error(
            "Sản phẩm này đã dừng canh, không gửi mail test."
        );
    }

    const filledAlert =
        await fillAlertProductData({
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

    await sendStockEmail(
        testAlert,
        {
            isTest: true
        }
    );

    await firebaseUpdate(
        `stock_alerts/${cleanId}`,
        {
            lastTestEmailAt:
                nowIso(),

            updatedAt:
                nowIso()
        }
    );

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