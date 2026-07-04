const {
    isAccessDenied,
    getCountryCodeFromUrl,
    getLocaleByCountry,
    createBrowser,
    createContext,
    preparePage,
    acceptZaraPopups
} = require("./browser");

const {
    cleanPriceText,
    getPriceInfoBrowser,
    scrapePriceFromPage
} = require("./price");

const {
    normalizeSize,
    cleanSizeList,
    getStockInfoBrowser,
    scrapeSizeOptionsFromAdd,
    checkOneZaraStock
} = require("./stock");

const {
    pickProductOnlyImage,
    pickModelImage,
    scrapeProductDimensionImage,
    extractGalleryImagesBrowser
} = require("./image");

const {
    openProductMeasurements,
    scrapeSizeChart
} = require("./sizeChart");

const {
    extractProductDataBrowser,
    scrapeZaraProduct
} = require("./product");

module.exports = {
    // browser
    isAccessDenied,
    getCountryCodeFromUrl,
    getLocaleByCountry,
    createBrowser,
    createContext,
    preparePage,
    acceptZaraPopups,

    // price
    cleanPriceText,
    getPriceInfoBrowser,
    scrapePriceFromPage,

    // stock
    normalizeSize,
    cleanSizeList,
    getStockInfoBrowser,
    scrapeSizeOptionsFromAdd,
    checkOneZaraStock,

    // image
    pickProductOnlyImage,
    pickModelImage,
    scrapeProductDimensionImage,
    extractGalleryImagesBrowser,

    // size chart
    openProductMeasurements,
    scrapeSizeChart,

    // product import
    extractProductDataBrowser,
    scrapeZaraProduct
};