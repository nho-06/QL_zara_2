document.addEventListener("DOMContentLoaded", function () {
    loadSidebar();
});

async function loadSidebar() {
    const sidebar = document.getElementById("sidebar");

    if (!sidebar) {
        return;
    }

    try {
        const response = await fetch("sidebar.html");

        if (!response.ok) {
            throw new Error("Không tải được sidebar.html");
        }

        const html = await response.text();
        sidebar.innerHTML = html;

        activeCurrentMenu();
    } catch (error) {
        sidebar.innerHTML = `
            <h2>ZARA</h2>
            <p style="color:red; padding:12px;">
                Lỗi tải sidebar
            </p>
        `;

        console.error("Sidebar error:", error);
    }
}

function activeCurrentMenu() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const menuItems = document.querySelectorAll("#sidebar .menu-btn");

    menuItems.forEach(item => {
        const page = item.getAttribute("data-page");

        if (page === currentPage) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
}