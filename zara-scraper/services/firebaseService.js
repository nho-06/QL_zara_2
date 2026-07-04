const { FIREBASE_DB_URL } = require("../config/env");

async function firebaseGet(path) {
    const response = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
    return await response.json();
}

async function firebaseSet(path, data) {
    const response = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    return await response.json();
}

async function firebaseUpdate(path, data) {
    const response = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    return await response.json();
}

async function firebaseDelete(path) {
    const response = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
        method: "DELETE"
    });

    return await response.json();
}

function makeFirebaseKey(text) {
    return String(text || "")
        .replace(/[.#$/[\]]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 180);
}

module.exports = {
    firebaseGet,
    firebaseSet,
    firebaseUpdate,
    firebaseDelete,
    makeFirebaseKey
};