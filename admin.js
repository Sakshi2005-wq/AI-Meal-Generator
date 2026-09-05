"use strict";

const API_URL = String(
    window.MEALAI_API_URL || "/api"
).replace(/\/$/, "");

const $ = (id) => document.getElementById(id);

let adminToken = sessionStorage.getItem("mealaiAdminToken") || "";


/* =========================
   MESSAGE
========================= */

function message(text, isError = true) {
    const panelMode = document.body.dataset.panel === "1";
    const el = $(panelMode ? "adminMessage" : "loginMessage");

    if (!el) return;

    el.textContent = text || "";
    el.style.color = isError ? "#a33" : "#2f6b3f";
}

function formMessage(elId, text, isError = true) {
    const el = $(elId);

    if (!el) return;

    el.textContent = text || "";
    el.style.color = isError ? "#a33" : "#2f6b3f";
}


/* =========================
   API REQUEST
========================= */

async function api(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`;
    }

    let response;

    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Unable to connect to the MealAI server. Make sure the backend is running."
        );
    }

    const data = await response.json().catch(() => ({
        success: false,
        message: "Invalid server response"
    }));

    if (response.status === 401) {
    throw new Error(
        data.message ||
        "Admin authentication failed. Please sign in again."
    );
}

    if (!response.ok || data.success === false) {
        throw new Error(
            data.message || "Request failed"
        );
    }

    return data;
}


/* =========================
   SHOW DASHBOARD
========================= */

function showPanel() {
    document.body.dataset.panel = "1";

    $("loginView").classList.add("hidden");
    $("panelView").classList.remove("hidden");

    loadDashboard();
}


/* =========================
   SHOW LOGIN
========================= */

function showLogin() {
    document.body.dataset.panel = "0";

    $("panelView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
}


/* =========================
   LOGOUT
========================= */

function logout(showMessage = true) {
    sessionStorage.removeItem("mealaiAdminToken");
    sessionStorage.removeItem("mealaiAdmin");

    adminToken = "";

    showLogin();

    if ($("adminPassword")) {
        $("adminPassword").value = "";
    }

    if (showMessage) {
        message("Logged out successfully.", false);
    }
}


/* =========================
   ADMIN LOGIN
========================= */

async function login(event) {
    event.preventDefault();

    const email = $("adminEmail").value.trim().toLowerCase();
    const password = $("adminPassword").value;

    if (!email || !password) {
        message(
            "Please enter your admin email and password.",
            true
        );
        return;
    }

    const loginButton = document.querySelector(
        "#adminLoginForm button[type='submit']"
    );

    try {
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = "Signing in...";
        }

        /*
         * ADMIN LOGIN ONLY
         *
         * This is different from normal user login.
         */
        const data = await api("/admin/login", {
            method: "POST",

            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        if (!data.token) {
            throw new Error(
                "Admin login succeeded but no admin token was returned."
            );
        }

        adminToken = data.token;

        sessionStorage.setItem(
            "mealaiAdminToken",
            adminToken
        );

        if (data.admin) {
            sessionStorage.setItem(
                "mealaiAdmin",
                JSON.stringify(data.admin)
            );
        }

        $("adminPassword").value = "";

        showPanel();

    } catch (error) {
        message(
            error.message || "Admin login failed.",
            true
        );

    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = "Sign in as Admin";
        }
    }
}

/* =========================
   TABS
========================= */

function switchTab(tabName) {
    $$tabButtons().forEach((btn) => {
        btn.classList.toggle(
            "active",
            btn.dataset.tab === tabName
        );
    });

    ["users", "meals", "recipes"].forEach((name) => {
        const panel = $(`tab-${name}`);
        if (panel) {
            panel.classList.toggle("hidden", name !== tabName);
        }
    });

    if (tabName === "meals") {
        loadMeals();
    } else if (tabName === "recipes") {
        loadRecipes();
    }
}

function $$tabButtons() {
    return Array.from(
        document.querySelectorAll("#adminTabs .tab-btn")
    );
}


/* =========================
   LOAD DASHBOARD
========================= */
async function loadDashboard() {
    if (!adminToken) {
        showLogin();
        return;
    }

    try {
        message(
            "Loading dashboard...",
            false
        );

        const data =
            await api(
                "/admin/stats"
            );

        const stats =
            data.stats || {};

        $("totalUsers").textContent =
            stats.totalUsers ?? 0;

        $("activeUsers").textContent =
            stats.activeUsers ?? 0;

        $("suspendedUsers").textContent =
            stats.suspendedUsers ?? 0;

        $("totalFavorites").textContent =
            stats.totalFavorites ?? 0;

        $("totalEatenMeals").textContent =
            stats.totalEatenMeals ?? 0;

        await loadUsers();

        message(
            "",
            false
        );

    } catch (error) {

        console.error(
            "ADMIN DASHBOARD ERROR:",
            error
        );

        message(
            error.message ||
            "Unable to load dashboard.",
            true
        );
    }
}
/* =========================
   LOAD USERS
========================= */

async function loadUsers() {
    try {
        const search = $("searchInput").value.trim();

        let endpoint = "/admin/users";

        if (search) {
            endpoint +=
                `?search=${encodeURIComponent(search)}`;
        }

        const data = await api(endpoint);

        const users = Array.isArray(data.users)
            ? data.users
            : [];

        if (users.length === 0) {
            $("usersBody").innerHTML = `
                <tr>
                    <td colspan="7">
                        No users found.
                    </td>
                </tr>
            `;

            return;
        }

        $("usersBody").innerHTML = users
            .map((user) => {
                const status =
                    user.status || "active";

                const nextStatus =
                    status === "suspended"
                        ? "active"
                        : "suspended";

                const actionText =
                    status === "suspended"
                        ? "Activate"
                        : "Suspend";

                return `
                    <tr>

                        <td>
                            ${escapeHtml(
                                user.name || "—"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.email || "—"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.goal || "—"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.dietType || "—"
                            )}
                        </td>

                        <td>
                            <span class="badge ${
                                status === "suspended"
                                    ? "suspended"
                                    : ""
                            }">
                                ${escapeHtml(status)}
                            </span>
                        </td>

                        <td>
                            ${
                                user.createdAt
                                    ? new Date(
                                          user.createdAt
                                      ).toLocaleDateString()
                                    : "—"
                            }
                        </td>

                        <td>
                            <div class="actions">

                                <button
                                    data-action="status"
                                    data-id="${escapeHtml(
                                        user.id
                                    )}"
                                    data-status="${nextStatus}"
                                >
                                    ${actionText}
                                </button>

                                <button
                                    class="danger"
                                    data-action="delete"
                                    data-id="${escapeHtml(
                                        user.id
                                    )}"
                                >
                                    Delete
                                </button>

                            </div>
                        </td>

                    </tr>
                `;
            })
            .join("");

    } catch (error) {
        message(
            error.message ||
            "Unable to load users.",
            true
        );
    }
}


/* =========================
   USER ACTIONS
========================= */

async function action(event) {
    const button = event.target.closest(
        "button[data-action]"
    );

    if (!button) return;

    const id = button.dataset.id;
    const actionType = button.dataset.action;

    if (!id) {
        message("Invalid user ID.", true);
        return;
    }

    try {
        button.disabled = true;

        /* SUSPEND / ACTIVATE */

        if (actionType === "status") {
            const newStatus =
                button.dataset.status;

            await api(
                `/admin/users/${encodeURIComponent(id)}/status`,
                {
                    method: "PATCH",

                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );

            message(
                newStatus === "suspended"
                    ? "User suspended successfully."
                    : "User activated successfully.",
                false
            );
        }


        /* DELETE */

        else if (actionType === "delete") {
            const confirmed = confirm(
                "Delete this user permanently?\n\n" +
                "This cannot be undone."
            );

            if (!confirmed) {
                button.disabled = false;
                return;
            }

            await api(
                `/admin/users/${encodeURIComponent(id)}`,
                {
                    method: "DELETE"
                }
            );

            message(
                "User deleted successfully.",
                false
            );
        }

        await loadDashboard();

    } catch (error) {
        message(
            error.message ||
            "Unable to update user.",
            true
        );

    } finally {
        button.disabled = false;
    }
}


/* =========================
   SHARED HELPERS FOR MEALS/RECIPES
========================= */

function parseLines(value) {
    return String(value || "")
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function readEntityForm(prefix) {
    return {
        name: $(`${prefix}Name`).value.trim(),
        description: $(`${prefix}Description`).value.trim(),
        emoji: $(`${prefix}Emoji`).value.trim(),
        type: $(`${prefix}Type`)
            ? $(`${prefix}Type`).value.trim()
            : undefined,
        diet: $(`${prefix}Diet`).value,
        cuisine: $(`${prefix}Cuisine`).value.trim(),
        calories: Number($(`${prefix}Calories`).value) || 0,
        protein: Number($(`${prefix}Protein`).value) || 0,
        carbs: Number($(`${prefix}Carbs`).value) || 0,
        fats: Number($(`${prefix}Fats`).value) || 0,
        time: Number($(`${prefix}Time`).value) || 30,
        ingredients: parseLines($(`${prefix}Ingredients`).value),
        instructions: parseLines($(`${prefix}Instructions`).value)
    };
}


/* =========================
   MEALS: LOAD / ADD / DELETE
========================= */

async function loadMeals() {
    try {
        const data = await api("/admin/meals");

        const meals = Array.isArray(data.meals)
            ? data.meals
            : [];

        if (meals.length === 0) {
            $("mealsBody").innerHTML = `
                <tr><td colspan="7">No custom meals yet.</td></tr>
            `;
            return;
        }

        $("mealsBody").innerHTML = meals
            .map((meal) => `
                <tr>
                    <td>${escapeHtml(meal.emoji || "🍽️")} ${escapeHtml(meal.name || "—")}</td>
                    <td>${escapeHtml(meal.type || "—")}</td>
                    <td>${escapeHtml(meal.diet || "—")}</td>
                    <td>${escapeHtml(meal.cuisine || "—")}</td>
                    <td>${escapeHtml(String(meal.calories ?? "—"))}</td>
                    <td>${escapeHtml(String(meal.time ?? "—"))} min</td>
                    <td>
                        <div class="actions">
                            <button class="danger" data-action="delete-meal" data-id="${escapeHtml(meal._id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `)
            .join("");

    } catch (error) {
        message(error.message || "Unable to load meals.", true);
    }
}

async function addMeal(event) {
    event.preventDefault();

    const submitButton = document.querySelector(
        "#mealForm button[type='submit']"
    );

    const payload = readEntityForm("meal");
    payload.tags = parseLines($("mealTags").value);
    payload.avoid = parseLines($("mealAvoid").value);

    if (!payload.name) {
        formMessage("mealFormMessage", "Meal name is required.", true);
        return;
    }

    try {
        if (submitButton) submitButton.disabled = true;

        await api("/admin/meals", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        formMessage("mealFormMessage", "Meal added successfully.", false);
        $("mealForm").reset();
        $("mealTime").value = 30;
        await loadMeals();

    } catch (error) {
        formMessage(
            "mealFormMessage",
            error.message || "Unable to add meal.",
            true
        );
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

async function deleteMeal(id, button) {
    const confirmed = confirm(
        "Delete this meal permanently?\n\nThis cannot be undone."
    );

    if (!confirmed) return;

    try {
        if (button) button.disabled = true;

        await api(`/admin/meals/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

        await loadMeals();

    } catch (error) {
        message(error.message || "Unable to delete meal.", true);
    } finally {
        if (button) button.disabled = false;
    }
}


/* =========================
   RECIPES: LOAD / ADD / DELETE
========================= */

async function loadRecipes() {
    try {
        const data = await api("/admin/recipes");

        const recipes = Array.isArray(data.recipes)
            ? data.recipes
            : [];

        if (recipes.length === 0) {
            $("recipesBody").innerHTML = `
                <tr><td colspan="6">No custom recipes yet.</td></tr>
            `;
            return;
        }

        $("recipesBody").innerHTML = recipes
            .map((recipe) => `
                <tr>
                    <td>${escapeHtml(recipe.emoji || "📖")} ${escapeHtml(recipe.name || "—")}</td>
                    <td>${escapeHtml(recipe.diet || "—")}</td>
                    <td>${escapeHtml(recipe.cuisine || "—")}</td>
                    <td>${escapeHtml(String(recipe.calories ?? "—"))}</td>
                    <td>${escapeHtml(String(recipe.time ?? "—"))} min</td>
                    <td>
                        <div class="actions">
                            <button class="danger" data-action="delete-recipe" data-id="${escapeHtml(recipe._id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `)
            .join("");

    } catch (error) {
        message(error.message || "Unable to load recipes.", true);
    }
}

async function addRecipe(event) {
    event.preventDefault();

    const submitButton = document.querySelector(
        "#recipeForm button[type='submit']"
    );

    const payload = readEntityForm("recipe");

    if (!payload.name) {
        formMessage("recipeFormMessage", "Recipe name is required.", true);
        return;
    }

    try {
        if (submitButton) submitButton.disabled = true;

        await api("/admin/recipes", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        formMessage("recipeFormMessage", "Recipe added successfully.", false);
        $("recipeForm").reset();
        $("recipeTime").value = 30;
        await loadRecipes();

    } catch (error) {
        formMessage(
            "recipeFormMessage",
            error.message || "Unable to add recipe.",
            true
        );
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

async function deleteRecipe(id, button) {
    const confirmed = confirm(
        "Delete this recipe permanently?\n\nThis cannot be undone."
    );

    if (!confirmed) return;

    try {
        if (button) button.disabled = true;

        await api(`/admin/recipes/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

        await loadRecipes();

    } catch (error) {
        message(error.message || "Unable to delete recipe.", true);
    } finally {
        if (button) button.disabled = false;
    }
}


/* =========================
   ESCAPE HTML
========================= */

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>'"]/g,
        (character) => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#39;",
                '"': "&quot;"
            };

            return entities[character];
        }
    );
}


/* =========================
   EVENT LISTENERS
========================= */

$("adminLoginForm").addEventListener(
    "submit",
    login
);

$("logoutBtn").addEventListener(
    "click",
    () => logout(true)
);

$("refreshBtn").addEventListener(
    "click",
    loadDashboard
);

$("searchBtn").addEventListener(
    "click",
    loadUsers
);

$("searchInput").addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadUsers();
        }
    }
);

$("usersBody").addEventListener(
    "click",
    action
);

$$tabButtons().forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

$("mealForm").addEventListener("submit", addMeal);
$("refreshMealsBtn").addEventListener("click", loadMeals);
$("mealsBody").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-meal']");
    if (button) deleteMeal(button.dataset.id, button);
});

$("recipeForm").addEventListener("submit", addRecipe);
$("refreshRecipesBtn").addEventListener("click", loadRecipes);
$("recipesBody").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='delete-recipe']");
    if (button) deleteRecipe(button.dataset.id, button);
});


/* =========================
   START
========================= */

if (adminToken) {
    showPanel();
} else {
    showLogin();
}
