const {
    cleanSizeList
} = require("./stock");

async function openProductMeasurements(page) {
    try {
        await page.waitForTimeout(1500);

        const selectors = [
            "button[data-qa-action='open-interactive-size-guide-accordion']",

            "button:has-text('Product Measurements')",
            "button:has-text('PRODUCT MEASUREMENTS')",
            "button:has-text('Product dimensions')",
            "button:has-text('PRODUCT DIMENSIONS')",

            "text=Product Measurements",
            "text=PRODUCT MEASUREMENTS",
            "text=Product dimensions",
            "text=PRODUCT DIMENSIONS",

            "text=Medidas del producto",
            "text=MEDIDAS DEL PRODUCTO",
            "text=Dimensiones del producto",
            "text=DIMENSIONES DEL PRODUCTO",

            "text=Produktmaße",
            "text=PRODUKTMAẞE",

            "text=Wymiary produktu",
            "text=Medidas do produto",
            "text=商品寸法"
        ];

        for (const selector of selectors) {
            try {
                const count = await page.locator(selector).count();

                for (let i = 0; i < count; i++) {
                    const item = page.locator(selector).nth(i);
                    const visible = await item.isVisible().catch(() => false);

                    if (!visible) continue;

                    await item.scrollIntoViewIfNeeded({ timeout: 8000 });
                    await page.waitForTimeout(800);
                    await item.click({ timeout: 8000 });
                    await page.waitForTimeout(4000);

                    const hasPanel = await page.evaluate(() => {
                        const text = document.body.innerText || "";

                        return (
                            text.includes("PRODUCT DIMENSIONS") ||
                            text.includes("PRODUCT MEASUREMENTS") ||
                            text.includes("THE GARMENT IS MEASURED") ||
                            text.includes("AREA") ||
                            text.includes("Chest") ||
                            text.includes("Waist") ||
                            text.includes("Hip") ||
                            text.includes("Produktmaße") ||
                            text.includes("Wymiary produktu") ||
                            text.includes("Medidas do produto") ||
                            text.includes("商品寸法")
                        );
                    });

                    if (hasPanel) {
                        return true;
                    }
                }
            } catch (e) {}
        }

        for (let s = 0; s < 10; s++) {
            await page.mouse.wheel(0, 700);
            await page.waitForTimeout(800);

            const clicked = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll("button, div, span, a"));

                const target = elements.find(el => {
                    const text = (el.innerText || "").trim().toLowerCase();

                    return (
                        text === "product measurements" ||
                        text === "product dimensions" ||
                        text === "medidas del producto" ||
                        text === "dimensiones del producto" ||
                        text === "produktmaße" ||
                        text === "wymiary produktu" ||
                        text === "medidas do produto" ||
                        text === "商品寸法"
                    );
                });

                if (target) {
                    target.click();
                    return true;
                }

                return false;
            });

            if (clicked) {
                await page.waitForTimeout(4000);
                return true;
            }
        }

        return false;
    } catch (error) {
        console.log("openProductMeasurements error:", error.message);
        return false;
    }
}

async function scrapeSizeChart(page) {
    try {
        const result = await page.evaluate(async () => {
            const possibleSizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

            const areaNames = [
                "Chest",
                "Waist",
                "Hip",
                "Front length",
                "Back length",
                "Total length",
                "Sleeve length",
                "Back width",
                "Arm width",
                "Shoulder width",
                "Leg length",
                "Inside leg length",
                "Outside leg length",
                "Thigh width",
                "Hem width"
            ];

            function cleanText(text) {
                return String(text || "")
                    .replace(/\r/g, "\n")
                    .replace(/\t/g, " ")
                    .replace(/[ ]+/g, " ")
                    .trim();
            }

            function normalizeLines(text) {
                return cleanText(text)
                    .split("\n")
                    .map(line => cleanText(line))
                    .filter(Boolean);
            }

            function isSize(text) {
                return possibleSizes.includes(cleanText(text).toUpperCase());
            }

            function extractNumbers(text) {
                const matches = cleanText(text).match(/[0-9]+(?:[.,][0-9]+)?/g);

                return matches
                    ? matches.map(x => x.replace(",", "."))
                    : [];
            }

            function getAreaName(text) {
                const clean = cleanText(text).toLowerCase();

                for (const area of areaNames) {
                    if (clean === area.toLowerCase()) {
                        return area;
                    }
                }

                for (const area of areaNames) {
                    if (clean.startsWith(area.toLowerCase() + " ")) {
                        return area;
                    }
                }

                return "";
            }

            function findPanel() {
                const all = Array.from(document.querySelectorAll("*"));

                const candidates = all
                    .map(el => {
                        const text = el.innerText || "";
                        const rect = el.getBoundingClientRect();

                        const score =
                            (text.includes("PRODUCT DIMENSIONS") ? 8 : 0) +
                            (text.includes("PRODUCT MEASUREMENTS") ? 8 : 0) +
                            (text.includes("AREA") ? 5 : 0) +
                            (text.includes("Chest") ? 3 : 0) +
                            (text.includes("Waist") ? 3 : 0) +
                            (text.includes("Hip") ? 3 : 0) +
                            (text.includes("Front length") ? 3 : 0) +
                            (text.includes("Back width") ? 3 : 0) +
                            (text.includes("Total length") ? 3 : 0) +
                            (text.includes("Sleeve length") ? 3 : 0);

                        return {
                            el,
                            rect,
                            score
                        };
                    })
                    .filter(item => {
                        return item.rect.width > 100 &&
                            item.rect.height > 100 &&
                            item.score >= 6;
                    })
                    .sort((a, b) => b.score - a.score);

                return candidates.length ? candidates[0].el : document.body;
            }

            function parseFromLines(lines) {
                let sizes = [];

                for (const line of lines) {
                    const parts = line
                        .split(/\s+/)
                        .map(x => x.trim())
                        .filter(Boolean);

                    const foundSizes = parts.filter(part => isSize(part));

                    if (foundSizes.length >= 2) {
                        sizes = foundSizes.map(size => size.toUpperCase());
                        break;
                    }
                }

                if (sizes.length === 0) {
                    const allSizes = [];

                    for (const line of lines) {
                        const clean = cleanText(line).toUpperCase();

                        if (isSize(clean) && !allSizes.includes(clean)) {
                            allSizes.push(clean);
                        }
                    }

                    if (allSizes.length >= 2) {
                        sizes = allSizes;
                    }
                }

                if (sizes.length === 0) {
                    sizes = ["XS", "S", "M", "L", "XL"].filter(size => {
                        return lines.some(line => cleanText(line).toUpperCase() === size);
                    });
                }

                const rows = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = cleanText(lines[i]);
                    const areaName = getAreaName(line);

                    if (!areaName) continue;

                    let numbers = extractNumbers(line.replace(areaName, ""));

                    if (numbers.length < sizes.length) {
                        const nextLines = lines.slice(i + 1, i + 10);

                        for (const nextLine of nextLines) {
                            if (getAreaName(nextLine)) {
                                break;
                            }

                            numbers = numbers.concat(extractNumbers(nextLine));

                            if (numbers.length >= sizes.length) {
                                break;
                            }
                        }
                    }

                    if (numbers.length >= sizes.length && sizes.length > 0) {
                        const row = {
                            area: areaName
                        };

                        sizes.forEach((size, index) => {
                            row[size] = numbers[index] || "";
                        });

                        rows.push(row);
                    }
                }

                return {
                    sizes,
                    rows
                };
            }

            const panel = findPanel();
            const tableLines = [];

            const tables = Array.from(panel.querySelectorAll("table"));

            tables.forEach(table => {
                tableLines.push(...normalizeLines(table.innerText || ""));
            });

            if (tableLines.length > 0) {
                const parsedTable = parseFromLines(tableLines);

                if (parsedTable.sizes.length > 0 && parsedTable.rows.length > 0) {
                    return {
                        unit: "CM",
                        sizes: parsedTable.sizes,
                        rows: parsedTable.rows,
                        source: "table"
                    };
                }
            }

            const allText = panel.innerText || document.body.innerText || "";
            const lines = normalizeLines(allText);
            const parsed = parseFromLines(lines);

            return {
                unit: "CM",
                sizes: parsed.sizes,
                rows: parsed.rows,
                source: "text",
                debugText: allText.slice(0, 2000)
            };
        });

        if (
            result &&
            Array.isArray(result.sizes) &&
            result.sizes.length > 0 &&
            Array.isArray(result.rows) &&
            result.rows.length > 0
        ) {
            result.sizes = cleanSizeList(result.sizes);
            return result;
        }

        return null;
    } catch (error) {
        console.log("scrapeSizeChart error:", error.message);
        return null;
    }
}

module.exports = {
    openProductMeasurements,
    scrapeSizeChart
};