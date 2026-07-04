const {
    createBrowser,
    checkOneZaraStock,
    normalizeSize
} = require("./zara-tools");

const {
    buildCountryUrls,
    formatFinalPrice
} = require("./config/countryPriceRules");

const {
    firebaseGet
} = require("./services/firebaseService");

const {
    sendStockEmail
} = require("./services/mailService");

const TEST_PRODUCT = {
    productName: "ZW COLLECTION LACE CAMISOLE TOP",
    productCode: "05919105",
    productUrl: "https://www.zara.com/es/en/zw-collection-lace-camisole-top-p05919105.html?v1=506289205",
    productImage: "",
    targetSize: "L",
    email: "dieuthien.ttdt@gmail.com"
};

const MAX_PARALLEL = 5;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function chunkArray(items, size) {
    const result = [];

    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }

    return result;
}

function formatNumber(value) {
    const number = Number(value || 0);

    return number.toLocaleString("vi-VN", {
        maximumFractionDigits: 2
    });
}

function cleanUrl(url) {
    return String(url || "")
        .split("?")[0]
        .trim();
}

function getProductImage(product) {
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

async function findProductInFirebase(product) {
    try {
        const products = await firebaseGet("products");

        if (!products) return null;

        const targetUrl = cleanUrl(product.productUrl);
        const targetCode = String(product.productCode || "").trim();

        for (const [id, item] of Object.entries(products)) {
            const itemUrl = cleanUrl(item.productUrl || item.url || "");
            const itemCode = String(item.productCode || item.code || id || "").trim();

            if (targetCode && itemCode && itemCode.includes(targetCode)) {
                return {
                    id,
                    ...item
                };
            }

            if (targetUrl && itemUrl && itemUrl === targetUrl) {
                return {
                    id,
                    ...item
                };
            }
        }

        return null;
    } catch (error) {
        console.log("Lỗi đọc Firebase:", error.message);
        return null;
    }
}

async function enrichProductFromFirebase(product) {
    const firebaseProduct = await findProductInFirebase(product);

    if (!firebaseProduct) {
        console.log("Không tìm thấy sản phẩm trong Firebase, mail có thể không có ảnh.");
        return product;
    }

    const image = getProductImage(firebaseProduct);

    console.log("Đã lấy thêm dữ liệu từ Firebase:");
    console.log("Tên:", firebaseProduct.name || firebaseProduct.title || product.productName);
    console.log("Ảnh:", image || "Không có ảnh trong Firebase");

    return {
        ...product,
        productName: firebaseProduct.name || firebaseProduct.title || product.productName,
        productCode: firebaseProduct.productCode || firebaseProduct.code || product.productCode,
        productImage: product.productImage || image
    };
}

async function checkCountryBatch(browser, product, countryItems) {
    const tasks = countryItems.map(async countryItem => {
        try {
            console.log("");
            console.log(`Đang check ${countryItem.countryName} (${countryItem.countryCode})`);
            console.log(countryItem.url);

            const stock = await checkOneZaraStock(
                browser,
                countryItem.url,
                product.targetSize,
                countryItem.countryCode
            );

            return {
                ...stock,
                countryCode: countryItem.countryCode,
                countryName: countryItem.countryName,
                currency: stock.currency || countryItem.currency,
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
                countryCode: countryItem.countryCode,
                countryName: countryItem.countryName,
                currency: countryItem.currency,
                rate: countryItem.rate,
                laborFee: countryItem.laborFee,
                productUrl: countryItem.url,
                url: countryItem.url,
                error: error.message
            };
        }
    });

    return await Promise.all(tasks);
}

async function checkMultiCountry(product) {
    let browser;

    try {
        browser = await createBrowser();

        const countryUrls = buildCountryUrls(product.productUrl);
        const chunks = chunkArray(countryUrls, MAX_PARALLEL);
        const results = [];

        for (const group of chunks) {
            const groupResults = await checkCountryBatch(browser, product, group);
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
                priceSource: item.priceSource || ""
            }))
            .sort((a, b) => {
                const priceA = Number(a.finalPrice || 0);
                const priceB = Number(b.finalPrice || 0);

                if (priceA === 0 && priceB > 0) return 1;
                if (priceB === 0 && priceA > 0) return -1;

                return priceA - priceB;
            });

        const bestCountryResult = matchedCountries[0] || null;

        return {
            results,
            matchedCountries,
            bestCountryResult,
            inStock: matchedCountries.length > 0
        };
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

function printResult(product, result) {
    console.log("");
    console.log("======================================");
    console.log("KẾT QUẢ TEST NHIỀU NƯỚC");
    console.log("======================================");
    console.log("Sản phẩm:", product.productName);
    console.log("Mã:", product.productCode);
    console.log("Size canh:", product.targetSize);
    console.log("Ảnh:", product.productImage || "Không có ảnh");
    console.log("");

    console.log("Tất cả kết quả:");

    result.results.forEach(item => {
        console.log("--------------------------------------");
        console.log("Nước:", item.countryName, `(${item.countryCode})`);
        console.log("Trạng thái:", item.stockStatus);
        console.log("Size matched:", item.sizeMatched === true ? "CÓ" : "KHÔNG");
        console.log("Size còn:", (item.availableSizes || []).join(", ") || "Không có");
        console.log("Size hết:", (item.soldOutSizes || []).join(", ") || "Không có");
        console.log("Giá text:", item.priceText || "Không lấy được");
        console.log("Nguồn giá:", item.priceSource || "");
        console.log("Giá web:", formatNumber(item.webPrice || item.price || 0), item.currency || "");
        console.log("Tỉ giá:", formatNumber(item.rate || 0));
        console.log("Tiền công:", formatNumber(item.laborFee || 0));
        console.log("Giá cuối:", formatFinalPrice(item.finalPrice || item.finalPriceVnd || 0));
        console.log("Link:", item.productUrl || item.url);
        if (item.error) console.log("Lỗi:", item.error);
    });

    console.log("");
    console.log("======================================");

    if (!result.inStock) {
        console.log("Chưa có nước nào back size.");
        return;
    }

    console.log("Các nước đang back size:");
    result.matchedCountries.forEach(item => {
        console.log(
            `- ${item.countryName}: ${formatNumber(item.webPrice)} ${item.currency} → ${formatFinalPrice(item.finalPrice)}`
        );
    });

    console.log("");

    console.log("NƯỚC RẺ NHẤT:");
    console.log(result.bestCountryResult.countryName);
    console.log("Giá web:", formatNumber(result.bestCountryResult.webPrice), result.bestCountryResult.currency);
    console.log(
        "Công thức:",
        `${formatNumber(result.bestCountryResult.webPrice)} × ${formatNumber(result.bestCountryResult.rate)} + ${formatNumber(result.bestCountryResult.laborFee)}`
    );
    console.log("Giá cuối:", formatFinalPrice(result.bestCountryResult.finalPrice));
    console.log("Link:", result.bestCountryResult.productUrl);
}

async function main() {
    try {
        TEST_PRODUCT.targetSize = normalizeSize(TEST_PRODUCT.targetSize);

        if (!TEST_PRODUCT.email || TEST_PRODUCT.email.includes("EMAIL_CUA_BAN")) {
            console.log("Bạn chưa sửa TEST_PRODUCT.email.");
            console.log("Mở file test_multi_country_stock.js và sửa email trước.");
            return;
        }

        let product = await enrichProductFromFirebase(TEST_PRODUCT);

        console.log("Bắt đầu test canh nhiều nước...");
        console.log("Sản phẩm:", product.productName);
        console.log("Size:", product.targetSize);
        console.log("Email test:", product.email);
        console.log("Ảnh gửi mail:", product.productImage || "Không có ảnh");

        const result = await checkMultiCountry(product);

        printResult(product, result);

        if (!result.inStock) {
            console.log("");
            console.log("Không gửi mail vì chưa có nước nào back size.");
            return;
        }

        const emailAlert = {
            ...product,
            matchedCountries: result.matchedCountries,
            bestCountryResult: result.bestCountryResult,
            productUrl: result.bestCountryResult.productUrl
        };

        console.log("");
        console.log("Đang gửi mail test nước rẻ nhất...");

        await sendStockEmail(emailAlert, {
            isTest: true
        });

        console.log("Đã gửi mail test thành công.");
    } catch (error) {
        console.log("Lỗi test:", error.message);
    }
}

main();