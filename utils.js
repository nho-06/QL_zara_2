import {
    ref,
    get,
    set,
    push,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { db } from "./firebase-config.js";

/*
    Đổi server ở đây là đủ.

    Khi chỉ dùng trên máy tính chủ:
    export const SERVER_BASE_URL = "http://localhost:3000";

    Khi muốn khách dùng từ xa qua tunnel:
    export const SERVER_BASE_URL = "https://abc.trycloudflare.com";

    Lưu ý: không thêm dấu / ở cuối link.
*/
export const SERVER_BASE_URL = "https://dare-macintosh-betting-belong.trycloudflare.com";

export function safe(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function moneyVnd(value) {
    const n = Number(value || 0);
    return n.toLocaleString("vi-VN") + " đ";
}

export function moneyEur(value) {
    const n = Number(value || 0);
    return n.toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " €";
}

export function now() {
    return new Date().toISOString();
}

export function makeKey(text) {
    return String(text || "")
        .replaceAll("/", "*")
        .replaceAll(".", "*")
        .replaceAll("#", "*")
        .replaceAll("$", "*")
        .replaceAll("[", "*")
        .replaceAll("]", "*")
        .trim();
}

export function splitColors(color) {
    if (!color) {
        return ["Không có màu"];
    }

    return color
        .split("/")
        .map(item => item.trim())
        .filter(Boolean);
}

export function getSizes(product) {
    if (
        product &&
        Array.isArray(product.availableSizes) &&
        product.availableSizes.length > 0
    ) {
        return product.availableSizes;
    }

    if (
        product &&
        product.sizeChart &&
        Array.isArray(product.sizeChart.sizes) &&
        product.sizeChart.sizes.length > 0
    ) {
        return product.sizeChart.sizes;
    }

    return [];
}

/*
    Lấy ảnh sản phẩm thống nhất cho toàn bộ web.

    Ưu tiên:
    1. productOnlyImage: ảnh sản phẩm thật
    2. dimensionImage: ảnh từ phần Product Measure / bảng size
    3. imageUrl / image
    4. modelImage: ảnh mẫu mặc, chỉ dùng cuối cùng
*/
export function getProductImage(product) {
    if (!product) return "";

    return (
        product.productOnlyImage ||
        product.dimensionImage ||
        product.imageUrl ||
        product.image ||
        product.modelImage ||
        ""
    );
}

/*
    Logic sắp xếp sản phẩm mới nhất lên đầu.

    sortAt: dùng để ép sản phẩm vừa import / vừa sửa lên đầu.
    updatedAt: sản phẩm vừa cập nhật.
    importedAt: thời điểm import.
    createdAt: thời điểm tạo ban đầu.
*/
export function getProductSortTime(product) {
    const value =
        product?.sortAt ||
        product?.updatedAt ||
        product?.importedAt ||
        product?.createdAt ||
        product?.savedAt ||
        product?.time ||
        product?.date ||
        "";

    const time = Date.parse(value);

    if (!Number.isNaN(time)) {
        return time;
    }

    return 0;
}

export function sortProductsNewestFirst(items) {
    return [...(items || [])].sort((a, b) => {
        const timeA = getProductSortTime(a);
        const timeB = getProductSortTime(b);

        if (timeA !== timeB) {
            return timeB - timeA;
        }

        return String(b?.id || b?.productCode || "").localeCompare(
            String(a?.id || a?.productCode || "")
        );
    });
}

export async function getAll(pathName) {
    const snapshot = await get(ref(db, pathName));
    const data = snapshot.val() || {};

    return Object.keys(data).map(id => ({
        id,
        ...data[id]
    }));
}

export async function getOne(pathName, id) {
    const snapshot = await get(ref(db, `${pathName}/${id}`));
    const data = snapshot.val();

    if (!data) {
        return null;
    }

    return {
        id,
        ...data
    };
}

export async function addOne(pathName, data) {
    const newRef = push(ref(db, pathName));
    await set(newRef, data);
    return newRef.key;
}

export async function setOne(pathName, id, data) {
    await set(ref(db, `${pathName}/${id}`), data);
}

export async function updateOne(pathName, id, data) {
    await update(ref(db, `${pathName}/${id}`), data);
}

export async function deleteOne(pathName, id) {
    await remove(ref(db, `${pathName}/${id}`));
}

export async function findByField(pathName, fieldName, value) {
    const items = await getAll(pathName);
    return items.find(item => item[fieldName] === value) || null;
}

export async function getDefaultRate() {
    const rates = await getAll("exchange_rates");

    const defaultRate = rates.find(rate => {
        return (
            rate.isDefault === true ||
            rate.is_default === true ||
            rate.is_default === 1
        );
    });

    if (defaultRate) {
        const value = Number(
            defaultRate.rate ||
            defaultRate.eurToVnd ||
            defaultRate.eur_to_vnd ||
            0
        );

        return value > 0 ? value : 31500;
    }

    if (rates.length > 0) {
        const lastRate = rates[rates.length - 1];

        const value = Number(
            lastRate.rate ||
            lastRate.eurToVnd ||
            lastRate.eur_to_vnd ||
            0
        );

        return value > 0 ? value : 31500;
    }

    return 31500;
}

export async function getActivePrice(productId) {
    const prices = await getAll("product_prices");

    return prices.find(price =>
        String(price.productId) === String(productId) &&
        price.isActive === true
    ) || null;
}

export function eurToVnd(priceEur, rate) {
    return Math.round(Number(priceEur || 0) * Number(rate || 0));
}