const express = require("express");
const { scrapeZaraProduct } = require("../zara-tools");

const {
    firebaseGet,
    firebaseSet
} = require("../services/firebaseService");

const router = express.Router();

const importJobs = new Map();

function now() {
    return new Date().toISOString();
}

function makeJobId() {
    return `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeNumber(value) {
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
        .replace("đ", "")
        .replace("EUR", "")
        .replace("zł", "")
        .replace("PLN", "")
        .replace("¥", "")
        .replace("￥", "")
        .replace("JPY", "");

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

function normalizeSize(size) {
    return String(size || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
}

function uniqueSizes(sizes) {
    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

    const normalized = (sizes || [])
        .map(size => normalizeSize(size))
        .filter(Boolean);

    const result = [];

    for (const size of order) {
        if (normalized.includes(size) && !result.includes(size)) {
            result.push(size);
        }
    }

    normalized.forEach(size => {
        if (!result.includes(size)) {
            result.push(size);
        }
    });

    return result;
}

function normalizeSizeOptions(sizeOptions) {
    if (!Array.isArray(sizeOptions)) {
        return [];
    }

    const map = new Map();

    sizeOptions.forEach(item => {
        if (!item) return;

        const size = normalizeSize(item.size);

        if (!size) return;

        const statusText = String(item.statusText || item.status || "").trim();

        const available =
            item.available === true ||
            /add|few|left|available|thêm|còn/i.test(statusText);

        const soldOut =
            item.available === false ||
            /view similar|similar|sold out|out of stock|hết|coming soon/i.test(statusText);

        map.set(size, {
            size,
            statusText,
            available: available && !soldOut
        });
    });

    return uniqueSizes([...map.keys()]).map(size => map.get(size));
}

function getAvailableSizesFromOptions(sizeOptions) {
    return uniqueSizes(
        (sizeOptions || [])
            .filter(item => item && item.available === true)
            .map(item => item.size)
    );
}

function getSoldOutSizesFromOptions(sizeOptions) {
    return uniqueSizes(
        (sizeOptions || [])
            .filter(item => item && item.available === false)
            .map(item => item.size)
    );
}

function getAllSizesFromProduct(product) {
    if (Array.isArray(product.sizeOptions) && product.sizeOptions.length > 0) {
        return uniqueSizes(product.sizeOptions.map(item => item.size));
    }

    if (product.sizeChart && Array.isArray(product.sizeChart.sizes)) {
        return uniqueSizes(product.sizeChart.sizes);
    }

    if (Array.isArray(product.availableSizes)) {
        return uniqueSizes(product.availableSizes);
    }

    return [];
}

function getCleanProductCode(data, url) {
    const fromData =
        data.productCode ||
        data.reference ||
        data.productId ||
        data.id ||
        "";

    if (fromData) {
        return String(fromData).trim();
    }

    const text = String(url || "");

    const match =
        text.match(/p(\d+)/i) ||
        text.match(/\/(\d+)\.html/i) ||
        text.match(/product\/(\d+)/i);

    if (match && match[1]) {
        return match[1];
    }

    return "ZARA_" + Date.now();
}

function buildProductPayload(scrapedData, url) {
    const currentTime = now();
    const productCode = getCleanProductCode(scrapedData, url);

    const rawSizeOptions = normalizeSizeOptions(scrapedData.sizeOptions || []);
    let sizeOptions = rawSizeOptions;

    const sizeChartSizes =
        scrapedData.sizeChart &&
        Array.isArray(scrapedData.sizeChart.sizes)
            ? uniqueSizes(scrapedData.sizeChart.sizes)
            : [];

    const availableSizesFromScraper = uniqueSizes(scrapedData.availableSizes || []);

    if (sizeOptions.length === 0 && sizeChartSizes.length > 0) {
        sizeOptions = sizeChartSizes.map(size => {
            const isAvailable = availableSizesFromScraper.includes(size);

            return {
                size,
                statusText: isAvailable ? "Available" : "Sold out",
                available: isAvailable
            };
        });
    }

    if (sizeOptions.length === 0 && availableSizesFromScraper.length > 0) {
        sizeOptions = availableSizesFromScraper.map(size => {
            return {
                size,
                statusText: "Available",
                available: true
            };
        });
    }

    const availableSizes = getAvailableSizesFromOptions(sizeOptions);
    const soldOutSizes = getSoldOutSizesFromOptions(sizeOptions);

    const allSizes = getAllSizesFromProduct({
        sizeOptions,
        sizeChart: scrapedData.sizeChart,
        availableSizes
    });

    const isOutOfStock =
        scrapedData.isOutOfStock === true ||
        scrapedData.stockStatus === "out_of_stock" ||
        (
            sizeOptions.length > 0 &&
            availableSizes.length === 0
        );

    const productImage =
        scrapedData.productOnlyImage ||
        scrapedData.dimensionImage ||
        scrapedData.imageUrl ||
        scrapedData.image ||
        scrapedData.modelImage ||
        "";

    const price = safeNumber(
        scrapedData.price ||
        scrapedData.priceEur ||
        scrapedData.salePriceEur
    );

    return {
        id: productCode,
        productCode,

        name: scrapedData.name || scrapedData.title || "Không có tên",
        title: scrapedData.name || scrapedData.title || "Không có tên",

        color: scrapedData.color || "",

        price,
        priceEur: price,
        salePriceEur: price,

        imageUrl: productImage,
        image: productImage,
        modelImage: scrapedData.modelImage || "",

        productOnlyImage:
            scrapedData.productOnlyImage ||
            scrapedData.dimensionImage ||
            scrapedData.imageUrl ||
            scrapedData.image ||
            "",

        dimensionImage: scrapedData.dimensionImage || "",

        galleryImages: Array.isArray(scrapedData.galleryImages)
            ? scrapedData.galleryImages
            : [],

        productUrl: url,
        url,

        description: scrapedData.description || "",

        availableSizes,
        soldOutSizes,
        allSizes,
        sizeOptions,

        sizeChart: scrapedData.sizeChart || null,

        stockStatus: isOutOfStock ? "out_of_stock" : "in_stock",
        isOutOfStock,

        hasAddButton: scrapedData.hasAddButton === true,

        importedAt: currentTime,
        updatedAt: currentTime,
        sortAt: currentTime
    };
}

function getValidRate(rate) {
    const value = safeNumber(rate);
    return value > 0 ? value : 31500;
}

function convertEurToVnd(priceEur, rate) {
    return Math.round(safeNumber(priceEur) * getValidRate(rate));
}

async function getDefaultRateFromFirebase() {
    const countriesData = await firebaseGet("countries");

    if (!countriesData) {
        return 31500;
    }

    const countries = Object.entries(countriesData).map(([id, country]) => ({
        id,
        ...country
    }));

    const zaraCountry = countries.find(country => {
        const name = String(country.name || country.countryName || "").toLowerCase();
        const code = String(country.code || country.currencyCode || "").toLowerCase();

        return (
            name.includes("zara") ||
            code === "eur" ||
            name.includes("euro") ||
            name.includes("spain")
        );
    });

    return getValidRate(zaraCountry?.rate || zaraCountry?.rateVnd || 31500);
}

async function saveCountryAndPrice(product, rate) {
    const countriesData = await firebaseGet("countries");

    const countries = countriesData
        ? Object.entries(countriesData).map(([id, country]) => ({
            id,
            ...country
        }))
        : [];

    let zaraCountry = countries.find(country => {
        const name = String(country.name || country.countryName || "").toLowerCase();
        const code = String(country.code || country.currencyCode || "").toLowerCase();

        return (
            name.includes("zara") ||
            code === "eur" ||
            name.includes("euro") ||
            name.includes("spain")
        );
    });

    if (!zaraCountry) {
        zaraCountry = {
            id: "zara_eur",
            name: "Zara EUR",
            countryName: "Zara EUR",
            code: "EUR",
            currencyCode: "EUR",
            rate: getValidRate(rate),
            createdAt: now(),
            updatedAt: now()
        };

        await firebaseSet("countries/zara_eur", zaraCountry);
    }

    const priceEur = safeNumber(product.priceEur);
    const finalPriceVnd = convertEurToVnd(priceEur, rate);

    const pricePayload = {
        productId: product.id,
        productCode: product.productCode,

        countryId: zaraCountry.id,
        countryName: zaraCountry.name || zaraCountry.countryName || "Zara EUR",

        currency: "EUR",
        priceLabel: "Giá import Zara",

        priceEur,
        salePriceEur: priceEur,

        rate: getValidRate(rate),
        rateVnd: getValidRate(rate),

        finalPriceVnd,
        priceVnd: finalPriceVnd,

        isActive: true,

        updatedAt: now(),
        createdAt: now()
    };

    await firebaseSet(`product_prices/${product.id}`, pricePayload);

    return {
        ...product,
        finalPriceVnd
    };
}

async function mergeWithOldProduct(product) {
    const oldProduct = await firebaseGet(`products/${product.id}`);

    if (!oldProduct) {
        return {
            ...product,
            createdAt: product.createdAt || now(),
            importedAt: product.importedAt || now(),
            updatedAt: now(),
            sortAt: now()
        };
    }

    const currentTime = now();

    return {
        ...oldProduct,
        ...product,

        createdAt: oldProduct.createdAt || oldProduct.importedAt || currentTime,
        importedAt: oldProduct.importedAt || oldProduct.createdAt || currentTime,

        updatedAt: currentTime,
        sortAt: currentTime
    };
}

function setJob(jobId, data) {
    const oldJob = importJobs.get(jobId) || {};

    importJobs.set(jobId, {
        ...oldJob,
        ...data,
        updatedAt: now()
    });
}

async function runImportJob(jobId, url) {
    try {
        setJob(jobId, {
            status: "running",
            step: "scraping",
            message: "Đang mở Zara và lấy dữ liệu..."
        });

        const result = await scrapeZaraProduct(url);

        if (!result.success) {
            setJob(jobId, {
                status: "error",
                step: "scraping",
                message: result.message || "Không lấy được dữ liệu Zara."
            });

            return;
        }

        setJob(jobId, {
            status: "running",
            step: "saving",
            message: "Đã lấy dữ liệu, đang lưu sản phẩm..."
        });

        const scrapedData = result.data || {};
        const rate = await getDefaultRateFromFirebase();

        let product = buildProductPayload(scrapedData, url);
        product = await saveCountryAndPrice(product, rate);
        product = await mergeWithOldProduct(product);

        await firebaseSet(`products/${product.id}`, product);

        setJob(jobId, {
            status: "done",
            step: "done",
            message: "Import thành công.",
            product
        });
    } catch (error) {
        console.log("runImportJob error:", error.message);

        setJob(jobId, {
            status: "error",
            step: "error",
            message: error.message || "Import lỗi."
        });
    }
}

/*
    API cũ: vẫn giữ để không hỏng code khác.
    API này scrape xong trả data, không chạy nền.
*/
router.post("/scrape-zara", async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({
            success: false,
            message: "Thiếu link Zara"
        });
    }

    const result = await scrapeZaraProduct(url);

    if (!result.success) {
        return res.status(result.status || 500).json({
            success: false,
            message: result.message || "Không lấy được dữ liệu Zara."
        });
    }

    return res.json({
        success: true,
        data: result.data
    });
});

/*
    API mới: import chạy nền.
    Frontend có thể rời trang, server vẫn tiếp tục chạy job.
*/
router.post("/import-zara-background", async (req, res) => {
    const { url } = req.body || {};

    if (!url) {
        return res.status(400).json({
            success: false,
            message: "Thiếu link Zara"
        });
    }

    const jobId = makeJobId();

    importJobs.set(jobId, {
        id: jobId,
        url,
        status: "queued",
        step: "queued",
        message: "Đã đưa vào hàng chờ import.",
        createdAt: now(),
        updatedAt: now()
    });

    res.json({
        success: true,
        jobId,
        message: "Đã bắt đầu import nền. Bạn có thể chuyển sang trang khác."
    });

    runImportJob(jobId, url);
});

router.get("/import-zara-job/:jobId", (req, res) => {
    const { jobId } = req.params;

    const job = importJobs.get(jobId);

    if (!job) {
        return res.status(404).json({
            success: false,
            message: "Không tìm thấy job import. Có thể server đã được khởi động lại."
        });
    }

    return res.json({
        success: true,
        job
    });
});

module.exports = router;