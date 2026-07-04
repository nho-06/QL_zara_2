const express = require("express");

const {
    saveWatchAlert,
    listStockAlerts,
    stopStockAlert,
    rewatchStockAlert,
    deleteStockAlert,
    checkStockAlerts,
    checkSingleStock,
    sendTestStockEmail
} = require("../services/stockAlertService");

const router = express.Router();

function sendSuccess(res, data = {}) {
    res.json({
        success: true,
        ...data
    });
}

function sendError(res, error, status = 500) {
    console.log("stockAlertRoutes error:", error.message);

    res.status(status).json({
        success: false,
        message: error.message || "Có lỗi xảy ra."
    });
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

    const uniqueCountries = [...new Set(countries)];

    const onlyRealCountries = uniqueCountries.filter(code => code !== "ALL");

    if (onlyRealCountries.length > 0) {
        return onlyRealCountries;
    }

    return ["ALL"];
}

function getTargetCountryNames(targetCountries) {
    const labels = {
        ALL: "Tất cả",
        ES: "Tây Ban Nha",
        DE: "Đức",
        PL: "Ba Lan",
        PT: "Bồ Đào Nha",
        JP: "Nhật"
    };

    const countries = normalizeTargetCountries(targetCountries);

    return countries.map(code => labels[code] || code);
}

router.post("/watch", async (req, res) => {
    try {
        const body = req.body || {};

        const targetCountries = normalizeTargetCountries(body.targetCountries);
        const targetCountryNames = getTargetCountryNames(targetCountries);

        const payload = {
            ...body,
            targetCountries,
            targetCountryNames
        };

        console.log("===== BODY CANH BACK NHAN TU WEB =====");
        console.log("productName:", payload.productName);
        console.log("productCode:", payload.productCode);
        console.log("targetSize:", payload.targetSize);
        console.log("email:", payload.email);
        console.log("targetCountries:", payload.targetCountries);
        console.log("targetCountryNames:", payload.targetCountryNames);
        console.log("======================================");

        const result = await saveWatchAlert(payload);

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error, 400);
    }
});

router.get("/list", async (req, res) => {
    try {
        const alerts = await listStockAlerts();

        sendSuccess(res, {
            alerts
        });
    } catch (error) {
        sendError(res, error);
    }
});

router.post("/stop", async (req, res) => {
    try {
        const { id } = req.body || {};

        const result = await stopStockAlert(id);

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error, 400);
    }
});

router.post("/rewatch", async (req, res) => {
    try {
        const { id } = req.body || {};

        const result = await rewatchStockAlert(id);

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error, 400);
    }
});

router.post("/delete", async (req, res) => {
    try {
        const { id } = req.body || {};

        const result = await deleteStockAlert(id);

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error, 400);
    }
});

router.get("/check-now", async (req, res) => {
    try {
        const result = await checkStockAlerts();

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error);
    }
});

router.post("/check-now", async (req, res) => {
    try {
        const { productUrl, targetSize } = req.body || {};

        const result = await checkSingleStock(productUrl, targetSize);

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error, 400);
    }
});

router.post("/test-email", async (req, res) => {
    try {
        const { id } = req.body || {};

        const result = await sendTestStockEmail(id);

        sendSuccess(res, result);
    } catch (error) {
        sendError(res, error, 400);
    }
});

module.exports = router;