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

router.post("/watch", async (req, res) => {
    try {
        const result = await saveWatchAlert(req.body || {});

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