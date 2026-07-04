const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const productUrl = process.argv[2];

if (!productUrl) {
    console.log("Bạn chưa nhập link Zara.");
    console.log('Ví dụ: node scrape_zara.js "https://www.zara.com/es/en/..."');
    process.exit(1);
}

async function scrapeZara() {
    const browser = await chromium.launch({
        headless: false,
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ]
    });

    const context = await browser.newContext({
        locale: "es-ES",
        timezoneId: "Europe/Madrid",
        viewport: {
            width: 1366,
            height: 768
        },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        extraHTTPHeaders: {
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            "Upgrade-Insecure-Requests": "1"
        }
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
            get: () => false
        });
    });

    page.setDefaultTimeout(15000);

    const uploadDir = path.join(__dirname, "..", "uploads");

    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    try {
        console.log("Đang mở trang Zara...");

        let finalUrl = productUrl.trim();

        if (finalUrl.startsWith("http://")) {
            finalUrl = finalUrl.replace("http://", "https://");
        }

        await page.goto(finalUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        await page.waitForTimeout(5000);

        const accessDeniedText = await page.evaluate(() => {
            return document.body.innerText || "";
        });

        if (
            accessDeniedText.includes("Access Denied") ||
            accessDeniedText.includes("You don't have permission to access") ||
            accessDeniedText.includes("Reference #")
        ) {
            await browser.close();

            const errorData = {
                success: false,
                message:
                    "Zara đang chặn truy cập tự động nên không lấy được dữ liệu. Hãy mở link trên Chrome thường, hoặc thử link khác / mạng khác / tắt VPN nếu có."
            };

            console.log(JSON.stringify(errorData));
            process.exit(2);
        }

        const cookieButtons = [
            "button:has-text('Accept')",
            "button:has-text('Aceptar')",
            "button:has-text('Agree')",
            "button:has-text('OK')",
            "button:has-text('Accept all')",
            "button:has-text('Aceptar todo')",
            "button:has-text('CONTINUE')",
            "button:has-text('Continuar')"
        ];

        for (const selector of cookieButtons) {
            try {
                const btn = page.locator(selector).first();

                if (await btn.count()) {
                    await btn.click({ timeout: 3000 });
                    await page.waitForTimeout(1500);
                    break;
                }
            } catch (e) {}
        }

        const countryButtons = [
            "button:has-text('YES, CONTINUE ON SPAIN')",
            "button:has-text('Yes, continue on Spain')",
            "button:has-text('CONTINUE ON SPAIN')",
            "button:has-text('Continue on Spain')",
            "text=YES, CONTINUE ON SPAIN",
            "text=Yes, continue on Spain"
        ];

        for (const selector of countryButtons) {
            try {
                const btn = page.locator(selector).first();

                if (await btn.count()) {
                    console.log("Đã thấy popup quốc gia, bấm tiếp tục Spain.");
                    await btn.click({ timeout: 3000 });
                    await page.waitForTimeout(2000);
                    break;
                }
            } catch (e) {}
        }

        await page.waitForTimeout(3000);

        const bodyTextAfterPopup = await page.evaluate(() => {
            return document.body.innerText || "";
        });

        if (
            bodyTextAfterPopup.includes("Access Denied") ||
            bodyTextAfterPopup.includes("You don't have permission to access") ||
            bodyTextAfterPopup.includes("Reference #")
        ) {
            await browser.close();

            const errorData = {
                success: false,
                message:
                    "Zara đang chặn truy cập tự động nên không lấy được dữ liệu. Không nên nhập dữ liệu này vào Firebase."
            };

            console.log(JSON.stringify(errorData));
            process.exit(2);
        }

        const data = await page.evaluate(() => {
            const bodyText = document.body.innerText || "";
            const fullText = document.body.textContent || "";

            let title = "";

            const titleSelectors = [
                "h1",
                "[data-qa-action='product-name']",
                ".product-detail-info__header-name",
                ".product-detail-info__name"
            ];

            for (const selector of titleSelectors) {
                const el = document.querySelector(selector);

                if (el && el.innerText && el.innerText.trim()) {
                    title = el.innerText.trim();
                    break;
                }
            }

            if (!title) {
                const lines = bodyText
                    .split("\n")
                    .map(x => x.trim())
                    .filter(Boolean);

                title = lines.find(line =>
                    line.length > 5 &&
                    line.length < 100 &&
                    line === line.toUpperCase() &&
                    !line.includes("EUR") &&
                    !line.includes("€") &&
                    !line.includes("ZARA") &&
                    !line.includes("LOG IN") &&
                    !line.includes("HELP")
                ) || "";
            }

            let productCode = "";

            const codeMatch = bodyText.match(/[0-9]{4}\/[0-9]{3}\/[0-9]{3}/);

            if (codeMatch) {
                productCode = codeMatch[0];
            }

            let color = "";

            if (productCode) {
                const colorLine = bodyText
                    .split("\n")
                    .map(x => x.trim())
                    .find(line => line.includes(productCode));

                if (colorLine) {
                    color = colorLine
                        .split("|")[0]
                        .replace(productCode, "")
                        .trim();
                }
            }

            const priceRegex = /([0-9]+[,.][0-9]{2})\s*(EUR|€)/gi;

            let priceMatches = [...bodyText.matchAll(priceRegex)];

            if (priceMatches.length === 0) {
                priceMatches = [...fullText.matchAll(priceRegex)];
            }

            let prices = priceMatches.map(match => {
                return {
                    text: match[0].trim(),
                    value: parseFloat(match[1].replace(",", "."))
                };
            });

            const uniquePrices = [];
            const seen = new Set();

            for (const p of prices) {
                if (!seen.has(p.value)) {
                    seen.add(p.value);
                    uniquePrices.push(p);
                }
            }

            prices = uniquePrices;

            let originalPriceEur = null;
            let salePriceEur = null;
            let priceEur = null;
            let priceText = "";

            if (prices.length === 1) {
                priceEur = prices[0].value;
                priceText = prices[0].text;
            }

            if (prices.length >= 2) {
                originalPriceEur = prices[0].value;
                salePriceEur = prices[1].value;
                priceEur = salePriceEur;
                priceText = prices[1].text;
            }

            let image = "";

            const images = Array.from(document.querySelectorAll("img"))
                .map(img => img.src)
                .filter(src => src && src.includes("static.zara.net"));

            if (images.length > 0) {
                image = images[0];
            }

            let description = "";

            const lines = bodyText
                .split("\n")
                .map(x => x.trim())
                .filter(Boolean);

            const descLine = lines.find(line =>
                line.length > 60 &&
                !line.includes("EUR") &&
                !line.includes("€") &&
                !line.includes("ADD") &&
                !line.includes("Pay") &&
                !line.includes("COMPLETE YOUR LOOK") &&
                !line.includes("PRODUCT MEASUREMENTS")
            );

            if (descLine) {
                description = descLine;
            }

            return {
                title,
                productCode,
                color,
                originalPriceEur,
                salePriceEur,
                priceText,
                priceEur,
                image,
                description,
                sizeChart: null,
                sizeChartImage: "",
                url: window.location.href,
                debugPrices: prices
            };
        });

        if (!data.title || !data.productCode) {
            await browser.close();

            const errorData = {
                success: false,
                message:
                    "Không lấy được đủ dữ liệu sản phẩm. Có thể Zara đang chặn hoặc link không phải trang chi tiết sản phẩm."
            };

            console.log(JSON.stringify(errorData));
            process.exit(2);
        }

        let sizeChartImage = "";

        try {
            console.log("Đang tìm PRODUCT MEASUREMENTS...");

            const productMeasurements = page.locator("text=PRODUCT MEASUREMENTS").first();

            if (await productMeasurements.count()) {
                await productMeasurements.scrollIntoViewIfNeeded({ timeout: 8000 });
                await page.waitForTimeout(800);

                await productMeasurements.click({ timeout: 4000 });
                await page.waitForTimeout(1800);

                console.log("Đã bấm PRODUCT MEASUREMENTS.");

                const fileName = "size_chart_" + Date.now() + ".png";
                const fullPath = path.join(uploadDir, fileName);

                await page.screenshot({
                    path: fullPath,
                    fullPage: false
                });

                sizeChartImage = "uploads/" + fileName;
            } else {
                console.log("Không thấy PRODUCT MEASUREMENTS.");
            }
        } catch (e) {
            console.log("Không chụp được bảng size:", e.message);
        }

        const sizeChart = await page.evaluate(() => {
            const bodyText = document.body.innerText || "";

            const linesForSize = bodyText
                .split("\n")
                .map(x => x.trim())
                .filter(Boolean);

            const possibleSizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];

            const foundSizes = possibleSizes.filter(size => {
                return linesForSize.includes(size);
            });

            const areas = [
                "Chest",
                "Waist",
                "Hip",
                "Total length",
                "Front length",
                "Sleeve length",
                "Back width",
                "Arm width"
            ];

            const rows = [];

            for (const area of areas) {
                const index = linesForSize.findIndex(line => {
                    return line.toLowerCase() === area.toLowerCase();
                });

                if (index !== -1) {
                    const values = [];

                    for (let i = index + 1; i < linesForSize.length; i++) {
                        const line = linesForSize[i];

                        if (areas.some(a => a.toLowerCase() === line.toLowerCase())) {
                            break;
                        }

                        if (/^[0-9]+(\.[0-9]+)?$/.test(line)) {
                            values.push(line);
                        }

                        if (values.length >= foundSizes.length && foundSizes.length > 0) {
                            break;
                        }
                    }

                    if (values.length > 0) {
                        const row = {
                            area: area
                        };

                        foundSizes.forEach((size, idx) => {
                            row[size] = values[idx] || "";
                        });

                        rows.push(row);
                    }
                }
            }

            if (foundSizes.length > 0 && rows.length > 0) {
                return {
                    unit: "CM",
                    sizes: foundSizes,
                    rows: rows
                };
            }

            return null;
        });

        data.sizeChart = sizeChart;
        data.sizeChartImage = sizeChartImage;

        fs.writeFileSync(
            "zara_product.json",
            JSON.stringify(data, null, 4),
            "utf8"
        );

        console.log(JSON.stringify({
            success: true,
            data: data
        }));

        await browser.close();
    } catch (error) {
        await browser.close();

        console.log(JSON.stringify({
            success: false,
            message: error.message
        }));

        process.exit(2);
    }
}

scrapeZara();