const { chromium } = require("playwright");

function isAccessDenied(text) {
    if (!text) return false;

    return (
        text.includes("Access Denied") ||
        text.includes("You don't have permission to access") ||
        text.includes("Reference #")
    );
}

function getCountryCodeFromUrl(url) {
    const text = String(url || "");
    const match = text.match(/zara\.com\/([a-z]{2})\/[a-z]{2}\//i);

    if (match && match[1]) {
        return match[1].toLowerCase();
    }

    return "es";
}

function getLocaleByCountry(countryCode = "es") {
    const code = String(countryCode || "es").toLowerCase();

    if (code === "de") {
        return {
            locale: "de-DE",
            timezoneId: "Europe/Berlin",
            acceptLanguage: "de-DE,de;q=0.9,en;q=0.8"
        };
    }

    if (code === "pl") {
        return {
            locale: "pl-PL",
            timezoneId: "Europe/Warsaw",
            acceptLanguage: "pl-PL,pl;q=0.9,en;q=0.8"
        };
    }

    if (code === "pt") {
        return {
            locale: "pt-PT",
            timezoneId: "Europe/Lisbon",
            acceptLanguage: "pt-PT,pt;q=0.9,en;q=0.8"
        };
    }

    if (code === "jp") {
        return {
            locale: "ja-JP",
            timezoneId: "Asia/Tokyo",
            acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8"
        };
    }

    return {
        locale: "es-ES",
        timezoneId: "Europe/Madrid",
        acceptLanguage: "es-ES,es;q=0.9,en;q=0.8"
    };
}

async function createBrowser() {
    return await chromium.launch({
        headless: false,
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage"
        ]
    });
}

async function createContext(browser, countryCode = "es") {
    const localeConfig = getLocaleByCountry(countryCode);

    return await browser.newContext({
        locale: localeConfig.locale,
        timezoneId: localeConfig.timezoneId,
        viewport: {
            width: 1366,
            height: 900
        },
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        extraHTTPHeaders: {
            "Accept-Language": localeConfig.acceptLanguage,
            "Upgrade-Insecure-Requests": "1"
        }
    });
}

async function preparePage(context) {
    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
            get: () => false
        });
    });

    page.setDefaultTimeout(15000);

    return page;
}

async function acceptZaraPopups(page) {
    const cookieButtons = [
        "button:has-text('Accept')",
        "button:has-text('Aceptar')",
        "button:has-text('Agree')",
        "button:has-text('OK')",
        "button:has-text('Accept all')",
        "button:has-text('Aceptar todo')",
        "button:has-text('CONTINUE')",
        "button:has-text('Continuar')",
        "button:has-text('Akzeptieren')",
        "button:has-text('Alle akzeptieren')",
        "button:has-text('Zaakceptuj')",
        "button:has-text('Aceitar')",
        "button:has-text('同意')",
        "button:has-text('承諾')"
    ];

    for (const selector of cookieButtons) {
        try {
            const btn = page.locator(selector).first();

            if (await btn.count()) {
                const visible = await btn.isVisible().catch(() => false);

                if (!visible) continue;

                await btn.click({ timeout: 3000 });
                await page.waitForTimeout(1500);
                break;
            }
        } catch (e) {}
    }

    const continueButtons = [
        "button:has-text('YES, CONTINUE')",
        "button:has-text('Yes, continue')",
        "button:has-text('CONTINUE')",
        "button:has-text('Continue')",
        "button:has-text('YES')",
        "button:has-text('Yes')",
        "button:has-text('JA')",
        "button:has-text('Weiter')",
        "button:has-text('Kontynuuj')",
        "button:has-text('Continuar')",
        "button:has-text('続行')"
    ];

    for (const selector of continueButtons) {
        try {
            const btn = page.locator(selector).first();

            if (await btn.count()) {
                const visible = await btn.isVisible().catch(() => false);

                if (!visible) continue;

                await btn.click({ timeout: 3000 });
                await page.waitForTimeout(2000);
                break;
            }
        } catch (e) {}
    }
}

module.exports = {
    isAccessDenied,
    getCountryCodeFromUrl,
    getLocaleByCountry,
    createBrowser,
    createContext,
    preparePage,
    acceptZaraPopups
};