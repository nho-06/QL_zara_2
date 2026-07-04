const nodemailer = require("nodemailer");

const {
    formatFinalPrice
} = require("../config/countryPriceRules");

let config = {};

try {
    config = require("../config/env");
} catch (error) {
    config = {};
}

const MAIL_USER = process.env.MAIL_USER || config.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS || config.MAIL_PASS;

const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: MAIL_USER,
        pass: MAIL_PASS
    }
});

function safeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatNumber(value) {
    const number = Number(value || 0);

    return number.toLocaleString("vi-VN", {
        maximumFractionDigits: 2
    });
}

function formatMoney(value) {
    return formatFinalPrice(value);
}

function getBestCountryResult(alert) {
    if (alert.bestCountryResult) {
        return alert.bestCountryResult;
    }

    if (Array.isArray(alert.matchedCountries) && alert.matchedCountries.length > 0) {
        const sorted = [...alert.matchedCountries].sort((a, b) => {
            const priceA = Number(a.finalPrice || a.finalPriceVnd || 0);
            const priceB = Number(b.finalPrice || b.finalPriceVnd || 0);

            if (priceA === 0 && priceB > 0) return 1;
            if (priceB === 0 && priceA > 0) return -1;

            return priceA - priceB;
        });

        return sorted[0];
    }

    return null;
}

function buildMatchedCountriesHtml(alert) {
    const matchedCountries = Array.isArray(alert.matchedCountries)
        ? alert.matchedCountries
        : [];

    if (matchedCountries.length <= 1) {
        return "";
    }

    const rows = [...matchedCountries]
        .sort((a, b) => {
            const priceA = Number(a.finalPrice || a.finalPriceVnd || 0);
            const priceB = Number(b.finalPrice || b.finalPriceVnd || 0);

            if (priceA === 0 && priceB > 0) return 1;
            if (priceB === 0 && priceA > 0) return -1;

            return priceA - priceB;
        })
        .map(item => {
            const countryName = safeHtml(item.countryName || item.countryCode || "");
            const currency = safeHtml(item.currency || "");
            const webPrice = formatNumber(item.webPrice || item.price || 0);
            const rate = formatNumber(item.rate || 0);
            const laborFee = formatNumber(item.laborFee || 0);
            const finalPrice = formatMoney(item.finalPrice || item.finalPriceVnd || 0);
            const url = safeHtml(item.productUrl || item.url || "");

            return `
                <tr>
                    <td style="padding:8px;border-bottom:1px solid #eee;">${countryName}</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;">${webPrice} ${currency}</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;">${rate}</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;">${laborFee}</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;"><b>${finalPrice}</b></td>
                    <td style="padding:8px;border-bottom:1px solid #eee;">
                        <a href="${url}" target="_blank">Mở</a>
                    </td>
                </tr>
            `;
        })
        .join("");

    return `
        <div style="margin-top:18px;">
            <h3 style="margin:0 0 10px;font-size:16px;">Các nước cũng đang back size</h3>

            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="background:#f7f7f7;">
                        <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">Nước</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">Giá web</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">Tỉ giá</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">Tiền công</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">Giá cuối</th>
                        <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">Link</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function buildStockEmailHtml(alert, options = {}) {
    const best = getBestCountryResult(alert);

    const productName = safeHtml(alert.productName || alert.name || "Sản phẩm Zara");
    const productCode = safeHtml(alert.productCode || "");
    const targetSize = safeHtml(alert.targetSize || "");
    const productImage = safeHtml(alert.productImage || alert.imageUrl || alert.image || "");

    const countryName = safeHtml(
        best?.countryName ||
        alert.countryName ||
        alert.countryCode ||
        "Zara"
    );

    const currency = safeHtml(
        best?.currency ||
        alert.currency ||
        ""
    );

    const webPrice = Number(
        best?.webPrice ||
        best?.price ||
        alert.webPrice ||
        alert.price ||
        0
    );

    const rate = Number(
        best?.rate ||
        alert.rate ||
        0
    );

    const laborFee = Number(
        best?.laborFee ||
        alert.laborFee ||
        0
    );

    const finalPrice = Number(
        best?.finalPrice ||
        best?.finalPriceVnd ||
        alert.finalPrice ||
        alert.finalPriceVnd ||
        0
    );

    const productUrl = safeHtml(
        best?.productUrl ||
        best?.url ||
        alert.productUrl ||
        alert.url ||
        ""
    );

    const matchedCountries = Array.isArray(alert.matchedCountries)
        ? alert.matchedCountries
        : [];

    const hasManyCountries = matchedCountries.length > 1;

    const testNotice = options.isTest
        ? `
            <div style="padding:10px 12px;background:#fff7e6;border:1px solid #ffd591;border-radius:8px;margin-bottom:16px;">
                Đây là mail test, không phải thông báo back size thật.
            </div>
        `
        : "";

    const countryTitle = hasManyCountries
        ? `Size ${targetSize} đã back ở nhiều nước. Nước rẻ nhất là ${countryName}.`
        : `Size ${targetSize} đã back tại ${countryName}.`;

    const imageHtml = productImage
        ? `
            <div style="margin:16px 0;text-align:center;">
                <img src="${productImage}" alt="${productName}" style="max-width:260px;width:100%;border-radius:10px;border:1px solid #eee;">
            </div>
        `
        : "";

    const priceHtml = finalPrice > 0
        ? `
            <div style="padding:14px;background:#f8f8f8;border-radius:10px;margin-top:14px;">
                <div style="margin-bottom:6px;"><b>Nước rẻ nhất:</b> ${countryName}</div>
                <div style="margin-bottom:6px;"><b>Giá web:</b> ${formatNumber(webPrice)} ${currency}</div>
                <div style="margin-bottom:6px;"><b>Công thức:</b> ${formatNumber(webPrice)} × ${formatNumber(rate)} + ${formatNumber(laborFee)}</div>
                <div style="font-size:18px;"><b>Giá cuối:</b> ${formatMoney(finalPrice)}</div>
            </div>
        `
        : `
            <div style="padding:14px;background:#f8f8f8;border-radius:10px;margin-top:14px;">
                <div><b>Nước back size:</b> ${countryName}</div>
                <div style="color:#777;font-size:13px;margin-top:5px;">
                    Chưa lấy được giá web, cần kiểm tra lại phần đọc giá Zara.
                </div>
            </div>
        `;

    const matchedCountriesHtml = buildMatchedCountriesHtml(alert);

    return `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222;line-height:1.5;">
            ${testNotice}

            <h2 style="margin:0 0 12px;font-size:22px;">
                Zara back size
            </h2>

            <p style="font-size:16px;margin:0 0 12px;">
                ${countryTitle}
            </p>

            ${imageHtml}

            <div style="margin-top:12px;">
                <div><b>Sản phẩm:</b> ${productName}</div>
                ${productCode ? `<div><b>Mã sản phẩm:</b> ${productCode}</div>` : ""}
                ${targetSize ? `<div><b>Size đang canh:</b> ${targetSize}</div>` : ""}
            </div>

            ${priceHtml}

            <div style="margin-top:18px;">
                <a href="${productUrl}" target="_blank"
                   style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;">
                    Mở sản phẩm Zara
                </a>
            </div>

            <div style="margin-top:12px;font-size:13px;color:#666;word-break:break-all;">
                ${productUrl}
            </div>

            ${matchedCountriesHtml}

            <p style="margin-top:20px;font-size:13px;color:#777;">
                Mail này được gửi tự động từ hệ thống canh back size Zara.
            </p>
        </div>
    `;
}

async function sendStockEmail(alert, options = {}) {
    if (!MAIL_USER || !MAIL_PASS) {
        throw new Error("Thiếu MAIL_USER hoặc MAIL_PASS trong config/env.js");
    }

    if (!alert || !alert.email) {
        throw new Error("Thiếu email người nhận.");
    }

    const best = getBestCountryResult(alert);

    const targetSize = alert.targetSize || "";
    const productName = alert.productName || alert.name || "Sản phẩm Zara";
    const countryName =
        best?.countryName ||
        alert.countryName ||
        alert.countryCode ||
        "Zara";

    const prefix = options.isTest ? "[TEST] " : "";

    const subject = `${prefix}Zara back size ${targetSize} - ${countryName} - ${productName}`;

    const html = buildStockEmailHtml(alert, options);

    await mailTransporter.sendMail({
        from: `"Zara Stock Alert" <${MAIL_USER}>`,
        to: alert.email,
        subject,
        html
    });

    return {
        success: true,
        to: alert.email,
        subject
    };
}

module.exports = {
    sendStockEmail,
    buildStockEmailHtml
};