const express = require("express");
const cors = require("cors");

const { PORT: ENV_PORT } = require("./config/env");
const zaraRoutes = require("./routes/zaraRoutes");
const stockAlertRoutes = require("./routes/stockAlertRoutes");
const { checkStockAlerts } = require("./services/stockAlertService");

const app = express();

const PORT = Number(process.env.PORT || ENV_PORT || 3000);
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json({ limit: "30mb" }));

app.get("/", (req, res) => {
    res.send("Zara scraper server is running");
});

app.get("/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Zara server is healthy"
    });
});

app.use("/", zaraRoutes);
app.use("/stock-alerts", stockAlertRoutes);

app.listen(PORT, HOST, () => {
    console.log(`Zara server đang chạy tại http://${HOST}:${PORT}`);

    setInterval(() => {
        checkStockAlerts().catch(error => {
            console.log("Lỗi auto check stock:", error.message);
        });
    }, 5 * 60 * 1000);
});