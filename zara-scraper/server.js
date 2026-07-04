const express = require("express");
const cors = require("cors");

const { PORT } = require("./config/env");
const zaraRoutes = require("./routes/zaraRoutes");
const stockAlertRoutes = require("./routes/stockAlertRoutes");
const { checkStockAlerts } = require("./services/stockAlertService");

const app = express();

app.use(cors());
app.use(express.json({ limit: "30mb" }));

app.get("/", (req, res) => {
    res.send("Zara scraper server is running");
});

app.use("/", zaraRoutes);
app.use("/stock-alerts", stockAlertRoutes);

app.listen(PORT, () => {
    console.log(`Zara server đang chạy tại http://localhost:${PORT}`);

    setInterval(() => {
        checkStockAlerts().catch(error => {
            console.log("Lỗi auto check stock:", error.message);
        });
    }, 5 * 60 * 1000);
});