"use strict";

const API_URL = "/api";

let currentUser = null;
let favorites = [];
let groceryItems = [];
let eatenMeals = [];
let todayPlanMeals = [];
let recipes = [];
let myRecipes = [];
let recipeCache = {};

let currentCalendarDate = new Date();
let currentPage = "dashboard";
let toastTimer = null;
let chatBusy = false;

const $ = (id) => document.getElementById(id);
const $$ = (selector) => [
  ...document.querySelectorAll(selector)
];

const pageInfo = {
  dashboard: [
    "Dashboard",
    "Here's your healthy plan for today."
  ],

  mealPlanner: [
    "AI Meal Planner",
    "Create a personalized meal plan."
  ],

  calendar: [
    "Meal Calendar",
    "Plan and review meals by date."
  ],

  nutrition: [
    "Nutrition",
    "Track your daily nutrition."
  ],

  grocery: [
    "Grocery List",
    "Everything you need for your meal plan."
  ],

  favorites: [
    "Favorite Meals",
    "Your saved meals."
  ],

  recipes: [
    "Recipes",
    "Browse recipes and add your own."
  ],

  aiAssistant: [
    "AI Assistant",
    "Get helpful meal and nutrition suggestions."
  ],

  profile: [
    "My Profile",
    "Manage your account and dietary preferences."
  ]
};

document.addEventListener(
  "DOMContentLoaded",
  init
);

async function init() {
  bindEvents();

  if (
    window.location.protocol ===
    "file:"
  ) {
    showAuth("login");

    toast(
      "Please run MealAI using npm start, not by opening index.html directly.",
      "error",
      7000
    );

    return;
  }

  currentUser =
    readStorage("mealaiUser");

  if (
    currentUser?.id ||
    currentUser?._id
  ) {
    await openApp();
  } else {
    showAuth("login");
  }
}


/* ============================================================
   EVENTS
   ============================================================ */

function bindEvents() {

  $("showRegisterBtn")
    ?.addEventListener(
      "click",
      () => showAuth("register")
    );

  $("showLoginBtn")
    ?.addEventListener(
      "click",
      () => showAuth("login")
    );

  $("loginForm")
    ?.addEventListener(
      "submit",
      login
    );

  $("registerForm")
    ?.addEventListener(
      "submit",
      register
    );

  $("logoutBtn")
    ?.addEventListener(
      "click",
      logout
    );

  $("menuBtn")
    ?.addEventListener(
      "click",
      toggleSidebar
    );

  $("userAvatar")
    ?.addEventListener(
      "click",
      () => showPage("profile")
    );

  $$(".nav-item").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          showPage(
            button.dataset.page
          )
      );
    }
  );

  $("generatePlanBtn")
    ?.addEventListener(
      "click",
      generatePlan
    );

  $("waterMinusBtn")
    ?.addEventListener(
      "click",
      () => adjustWater(-1)
    );

  $("waterPlusBtn")
    ?.addEventListener(
      "click",
      () => adjustWater(1)
    );

  $("previousMonthBtn")
    ?.addEventListener(
      "click",
      () => {
        currentCalendarDate.setMonth(
          currentCalendarDate.getMonth() - 1
        );

        renderCalendar();
      }
    );

  $("nextMonthBtn")
    ?.addEventListener(
      "click",
      () => {
        currentCalendarDate.setMonth(
          currentCalendarDate.getMonth() + 1
        );

        renderCalendar();
      }
    );

  $("closeCalendarDetailsBtn")
    ?.addEventListener(
      "click",
      () => {
        $("calendarDayDetails")
          ?.classList.add("hidden");
      }
    );

  $("addGroceryBtn")
    ?.addEventListener(
      "click",
      addGrocery
    );

  $("profileForm")
    ?.addEventListener(
      "submit",
      saveProfile
    );

  $("chatForm")
    ?.addEventListener(
      "submit",
      sendChat
    );

  $("addRecipeBtn")
    ?.addEventListener(
      "click",
      () => openUserRecipeForm()
    );

  $("userRecipeForm")
    ?.addEventListener(
      "submit",
      saveUserRecipe
    );

  $("myRecipeSearch")
    ?.addEventListener(
      "input",
      renderMyRecipes
    );

  $("recipeSearch")
    ?.addEventListener(
      "input",
      renderPublicRecipes
    );

  document.addEventListener(
    "click",
    delegatedClick
  );

  document.addEventListener(
    "change",
    handleChange
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        closeSidebar();
        closeUserRecipeForm();
      }
    }
  );
}


/* ============================================================
   API
   ============================================================ */

async function request(
  path,
  options = {}
) {
  let response;

  try {
    response = await fetch(
      `${API_URL}${path}`,
      {
        ...options,

        headers: {
          "Content-Type":
            "application/json",

          ...(options.headers || {})
        }
      }
    );
  } catch (error) {

    console.error(
      "NETWORK ERROR:",
      error
    );

    throw new Error(
      "Cannot connect to the MealAI server. Make sure npm start is running."
    );
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  const rawText =
    await response.text();

  let data = {};

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      data = rawText
        ? JSON.parse(rawText)
        : {};
    } catch (error) {

      console.error(
        "INVALID JSON:",
        rawText
      );

      throw new Error(
        "Server returned invalid JSON."
      );
    }
  } else {

    console.error(
      "UNEXPECTED SERVER RESPONSE:",
      rawText.slice(0, 1000)
    );

    if (
      response.status === 404
    ) {
      throw new Error(
        "API endpoint not found. Check that the correct MealAI server is running."
      );
    }

    throw new Error(
      "Server returned an invalid response."
    );
  }

  if (
    !response.ok ||
    data.success === false
  ) {
    throw new Error(
      data.message ||
      `Server error (${response.status})`
    );
  }

  return data;
}


/* ============================================================
   AUTH
   ============================================================ */

function showAuth(which) {

  $("loginScreen")
    ?.classList.toggle(
      "hidden",
      which !== "login"
    );

  $("registerScreen")
    ?.classList.toggle(
      "hidden",
      which !== "register"
    );

  $("app")
    ?.classList.add("hidden");

  closeSidebar();
}


async function login(event) {

  event.preventDefault();

  const email =
    $("loginEmail")
      ?.value
      .trim();

  const password =
    $("loginPassword")
      ?.value;

  if (!email || !password) {

    toast(
      "Please enter your email and password.",
      "error"
    );

    return;
  }

  try {

    const data =
      await request(
        "/login",
        {
          method: "POST",

          body: JSON.stringify({
            email,
            password
          })
        }
      );

    currentUser =
      data.user;

    persistUser();

    await openApp();

    toast(
      "Welcome back! 👋",
      "success"
    );

  } catch (error) {

    console.error(
      "LOGIN:",
      error
    );

    toast(
      error.message ||
      "Login failed.",
      "error"
    );
  }
}


async function register(event) {

  event.preventDefault();

  const username =
    $("registerName")
      ?.value
      .trim();

  const email =
    $("registerEmail")
      ?.value
      .trim();

  const password =
    $("registerPassword")
      ?.value;

  if (
    !username ||
    !email ||
    !password
  ) {

    toast(
      "Please complete all registration fields.",
      "error"
    );

    return;
  }

  try {

    const data =
      await request(
        "/register",
        {
          method: "POST",

          body: JSON.stringify({
            username,
            email,
            password
          })
        }
      );

    currentUser =
      data.user;

    persistUser();

    await openApp();

    toast(
      "Account created successfully! 🎉",
      "success"
    );

  } catch (error) {

    console.error(
      "REGISTER:",
      error
    );

    toast(
      error.message ||
      "Registration failed.",
      "error"
    );
  }
}


function logout() {

  currentUser = null;
  favorites = [];
  groceryItems = [];
  eatenMeals = [];
  todayPlanMeals = [];
  recipes = [];
  myRecipes = [];
  recipeCache = {};

  localStorage.removeItem(
    "mealaiUser"
  );

  $("loginForm")
    ?.reset();

  showAuth("login");

  toast(
    "You have been logged out.",
    "success"
  );
}


async function openApp() {

  $("loginScreen")
    ?.classList.add("hidden");

  $("registerScreen")
    ?.classList.add("hidden");

  $("app")
    ?.classList.remove("hidden");

  const id = userId();

  if (!id) {
    showAuth("login");
    return;
  }

  loadSavedTodayPlan();

  try {

    const results =
      await Promise.allSettled([
        request(
          `/profile/${encodeURIComponent(id)}`
        ),

        request(
          `/favorites/${encodeURIComponent(id)}`
        ),

        request(
          `/groceries/${encodeURIComponent(id)}`
        ),

        request(
          `/meals/eaten/${encodeURIComponent(id)}`
        )
      ]);

    if (
      results[0].status ===
      "fulfilled" &&
      results[0].value.user
    ) {
      currentUser =
        results[0].value.user;

      persistUser();
    }

    if (
      results[1].status ===
      "fulfilled"
    ) {
      favorites =
        results[1]
          .value
          .favorites || [];
    }

    if (
      results[2].status ===
      "fulfilled"
    ) {
      groceryItems =
        results[2]
          .value
          .groceries || [];
    }

    if (
      results[3].status ===
      "fulfilled"
    ) {
      eatenMeals =
        results[3]
          .value
          .eatenMeals || [];
    }

  } catch (error) {

    console.error(
      "SYNC ERROR:",
      error
    );
  }

  updateUserUi();

  renderAll();

  showPage(
    currentPage
  );
}


function userId() {

  return String(
    currentUser?.id ||
    currentUser?._id ||
    ""
  );
}


function persistUser() {

  if (currentUser) {

    localStorage.setItem(
      "mealaiUser",
      JSON.stringify(
        currentUser
      )
    );
  }
}


function readStorage(key) {

  try {

    const value =
      localStorage.getItem(
        key
      );

    return value
      ? JSON.parse(value)
      : null;

  } catch {

    return null;
  }
}


function updateUserUi() {

  const name =
    currentUser?.username ||
    currentUser?.name ||
    "User";

  const initial =
    name
      .trim()
      .charAt(0)
      .toUpperCase() ||
    "U";

  if ($("welcomeName")) {

    $("welcomeName")
      .textContent =
      `Welcome, ${name}!`;
  }

  if ($("userAvatar")) {

    $("userAvatar")
      .textContent =
      initial;
  }

  if ($("profileAvatar")) {

    $("profileAvatar")
      .textContent =
      initial;
  }

  if ($("profileName")) {

    $("profileName")
      .textContent =
      name;
  }

  if ($("profileEmail")) {

    $("profileEmail")
      .textContent =
      currentUser?.email ||
      "";
  }
}


/* ============================================================
   NAVIGATION
   ============================================================ */

function toggleSidebar() {

  const sidebar =
    $("sidebar");

  if (!sidebar) return;

  const open =
    sidebar.classList.toggle(
      "open"
    );

  $("menuBtn")
    ?.setAttribute(
      "aria-expanded",
      String(open)
    );
}


function closeSidebar() {

  $("sidebar")
    ?.classList.remove(
      "open"
    );

  $("menuBtn")
    ?.setAttribute(
      "aria-expanded",
      "false"
    );
}


function showPage(pageId) {

  const page =
    $(pageId);

  if (
    !page ||
    !pageInfo[pageId]
  ) {

    console.warn(
      "Invalid page:",
      pageId
    );

    return;
  }

  currentPage =
    pageId;

  $$(".page").forEach(
    (section) => {

      section.classList.toggle(
        "active-page",
        section.id === pageId
      );
    }
  );

  $$(".nav-item").forEach(
    (button) => {

      const active =
        button.dataset.page ===
        pageId;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-current",
        active
          ? "page"
          : "false"
      );
    }
  );

  const [
    title,
    subtitle
  ] =
    pageInfo[pageId];

  setText(
    "pageTitle",
    title
  );

  setText(
    "pageSubtitle",
    subtitle
  );

  closeSidebar();

  if (
    pageId ===
    "dashboard"
  ) {
    renderDashboard();
  }

  if (
    pageId ===
    "calendar"
  ) {
    renderCalendar();
  }

  if (
    pageId ===
    "nutrition"
  ) {
    renderNutrition();
  }

  if (
    pageId ===
    "favorites"
  ) {
    renderFavorites();
  }

  if (
    pageId ===
    "grocery"
  ) {
    renderGroceries();
  }

  if (
    pageId ===
    "profile"
  ) {
    renderProfile();
  }

  if (
    pageId ===
    "recipes"
  ) {
    loadRecipes();
  }
}


function renderAll() {

  renderDashboard();
  renderNutrition();
  renderFavorites();
  renderGroceries();
  renderProfile();
  renderCalendar();

  syncEatenCheckboxes();
}


/* ============================================================
   MEAL EMOJIS
   ============================================================ */

function getMealEmoji(meal) {

  if (meal?.emoji) {
    return meal.emoji;
  }

  const text =
    String(
      meal?.name || ""
    ).toLowerCase();

  if (
    text.includes("poha") ||
    text.includes("rice") ||
    text.includes("oats") ||
    text.includes("idli") ||
    text.includes("dosa") ||
    text.includes("biryani")
  ) {
    return "🍚";
  }

  if (
    text.includes("paneer") ||
    text.includes("dal") ||
    text.includes("tofu") ||
    text.includes("lentil") ||
    text.includes("curry")
  ) {
    return "🥘";
  }

  if (
    text.includes("chicken") ||
    text.includes("fish") ||
    text.includes("egg") ||
    text.includes("seafood")
  ) {
    return "🍗";
  }

  if (
    text.includes("salad") ||
    text.includes("vegetable") ||
    text.includes("veggie")
  ) {
    return "🥗";
  }

  if (
    text.includes("roti") ||
    text.includes("chapati") ||
    text.includes("naan")
  ) {
    return "🫓";
  }

  if (
    text.includes("pasta") ||
    text.includes("noodle")
  ) {
    return "🍝";
  }

  if (
    text.includes("soup")
  ) {
    return "🍲";
  }

  if (
    text.includes("fruit") ||
    text.includes("smoothie")
  ) {
    return "🍎";
  }

  if (
    text.includes("sandwich") ||
    text.includes("burger")
  ) {
    return "🥪";
  }

  return "🍽️";
}


/* ============================================================
   TODAY'S PLAN
   ============================================================ */

function todayPlanKey() {

  return `mealaiTodayPlan:${userId()}:${today()}`;
}


function loadSavedTodayPlan() {

  try {

    const saved =
      localStorage.getItem(
        todayPlanKey()
      );

    todayPlanMeals =
      saved
        ? JSON.parse(saved)
        : [];

  } catch {

    todayPlanMeals = [];
  }
}


function saveTodayPlan() {

  localStorage.setItem(
    todayPlanKey(),
    JSON.stringify(
      todayPlanMeals
    )
  );
}


/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard() {

  const grid =
    $("todayMealsGrid");

  if (!grid) return;

  grid.innerHTML = "";

  if (
    !todayPlanMeals.length
  ) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "empty-state";

    empty.textContent =
      "No meal plan for today yet. Generate your meal plan first.";

    grid.appendChild(
      empty
    );

  } else {

    todayPlanMeals.forEach(
      (meal) => {

        grid.appendChild(
          createMealCard(
            meal
          )
        );
      }
    );
  }

  const eatenToday =
    new Set(
      mealsOn(today()).map(
        (entry) =>
          String(
            entry.mealId ||
            entry.meal?.id ||
            entry.id ||
            ""
          )
      )
    );

  let calories = 0;

  todayPlanMeals.forEach(
    (meal) => {

      const id =
        String(
          meal.id ||
          meal._id ||
          slug(
            meal.name
          )
        );

      if (
        eatenToday.has(id)
      ) {

        calories +=
          Number(
            meal.calories
          ) || 0;
      }
    }
  );

  const count =
    eatenToday.size;

  const total =
    todayPlanMeals.length ||
    1;

  const score =
    Math.min(
      100,
      Math.round(
        (count / total) *
        100
      )
    );

  /*
   * Support both the older IDs
   * and the current HTML IDs.
   */

  setText(
    "todayCalories",
    calories
  );

  setText(
    "caloriesValue",
    calories
  );

  setText(
    "completedMeals",
    count
  );

  setText(
    "mealsValue",
    count
  );

  setText(
    "healthyScoreValue",
    `${score}%`
  );

  setText(
    "waterCount",
    getWater()
  );

  setText(
    "waterValue",
    getWater()
  );

  syncEatenCheckboxes();
}


/* ============================================================
   MEAL CARD
   ============================================================ */

function createMealCard(meal) {

  const id =
    String(
      meal.id ||
      meal._id ||
      slug(meal.name)
    );

  const article =
    document.createElement(
      "article"
    );

  article.className =
    "meal-card";

  article.dataset.meal = "";

  article.dataset.id =
    id;

  article.dataset.name =
    meal.name || "Meal";

  article.dataset.description =
    meal.description || "";

  article.dataset.type =
    meal.category ||
    meal.type ||
    "";

  article.dataset.calories =
    meal.calories || 0;

  article.dataset.protein =
    meal.protein || 0;

  article.dataset.carbs =
    meal.carbs || 0;

  article.dataset.fats =
    meal.fat ??
    meal.fats ??
    0;

  article.dataset.time =
    meal.cookingTime ??
    meal.time ??
    0;

  article.dataset.emoji =
    getMealEmoji(meal);


  /*
   * EMOJI INSTEAD OF IMAGE
   */

  const emoji =
    document.createElement(
      "div"
    );

  emoji.className =
    "meal-card-emoji";

  emoji.textContent =
    getMealEmoji(meal);

  emoji.setAttribute(
    "aria-label",
    meal.name ||
    "Meal"
  );


  const content =
    document.createElement(
      "div"
    );

  content.className =
    "meal-card-content";


  const h3 =
    document.createElement(
      "h3"
    );

  h3.textContent =
    meal.name ||
    "Meal";


  const p =
    document.createElement(
      "p"
    );

  p.textContent =
    meal.description ||
    "";


  const small =
    document.createElement(
      "small"
    );

  const category =
    meal.category ||
    meal.type ||
    "Meal";

  const time =
    meal.cookingTime ??
    meal.time ??
    0;

  small.textContent =
    `${category} · ${
      meal.calories || 0
    } kcal · ${
      time
    } min`;


  const actions =
    document.createElement(
      "div"
    );

  actions.className =
    "meal-actions";


  const favorite =
    document.createElement(
      "button"
    );

  favorite.type =
    "button";

  favorite.className =
    "favorite-btn";

  favorite.dataset.favorite =
    "";

  favorite.textContent =
    "🤍 Save Favorite";


  const label =
    document.createElement(
      "label"
    );

  label.className =
    "meal-eaten-check";


  const checkbox =
    document.createElement(
      "input"
    );

  checkbox.type =
    "checkbox";

  checkbox.dataset.mealEaten =
    "";


  const span =
    document.createElement(
      "span"
    );

  span.textContent =
    "Mark as eaten";


  label.append(
    checkbox,
    span
  );

  actions.append(
    favorite,
    label
  );

  content.append(
    h3,
    p,
    small,
    actions
  );

  /*
   * IMPORTANT:
   * emoji first, NOT image.
   */
  article.append(
    emoji,
    content
  );

  updateFavoriteButton(
    favorite,
    id
  );

  return article;
}


/* ============================================================
   MEAL DATA FROM CARD
   ============================================================ */

function mealFromCard(card) {

  return {

    id:
      String(
        card.dataset.id ||
        ""
      ),

    name:
      card.dataset.name ||
      card.querySelector(
        "h3"
      )?.textContent.trim() ||
      "Meal",

    description:
      card.dataset.description ||
      card.querySelector(
        "p"
      )?.textContent.trim() ||
      "",

    category:
      card.dataset.type ||
      "",

    calories:
      Number(
        card.dataset.calories
      ) || 0,

    protein:
      Number(
        card.dataset.protein
      ) || 0,

    carbs:
      Number(
        card.dataset.carbs
      ) || 0,

    fat:
      Number(
        card.dataset.fats
      ) || 0,

    cookingTime:
      Number(
        card.dataset.time
      ) || 0,

    emoji:
      card.dataset.emoji ||
      "🍽️"
  };
}


function getTodayMealCards() {

  return $$("#todayMealsGrid [data-meal]");
}


function getTodayMealIds() {

  return getTodayMealCards()
    .map(
      (card) =>
        String(
          card.dataset.id ||
          ""
        )
    )
    .filter(Boolean);
}


/* ============================================================
   GENERATE MEAL PLAN
   ============================================================ */

async function generatePlan() {

  const button =
    $("generatePlanBtn");

  if (!button) return;

  const payload = {

    userId:
      userId(),

    goal:
      $("goal")
        ?.value ||
      currentUser?.goal ||
      "Healthy Lifestyle",

    dietType:
      $("diet")
        ?.value ||
      currentUser?.dietType ||
      currentUser?.diet ||
      "Vegetarian",

    mealsPerDay:
      Number(
        $("mealCount")
          ?.value ||
        currentUser?.mealsPerDay ||
        3
      ),

    cookingTime:
      $("cookingTime")
        ?.value ||
      currentUser?.cookingTime ||
      "30",

    healthCondition:
      $("plannerHealthCondition")
        ?.value ||
      currentUser?.healthCondition ||
      "",

    allergies:
      getCheckedValues(
        "plannerAllergiesOptions"
      )
  };

  button.disabled =
    true;

  button.textContent =
    "Generating…";

  try {

    const data =
      await request(
        "/meals/plan",
        {
          method: "POST",

          body:
            JSON.stringify(
              payload
            )
        }
      );

    const meals =
      Array.isArray(
        data.meals
      )
        ? data.meals
        : [];

    if (!meals.length) {

      throw new Error(
        "No meals were generated. Please check your diet and allergy selections."
      );
    }

    todayPlanMeals =
      meals.map(
        (meal) => {

          const normalized = {
            ...meal
          };

          normalized.id =
            String(
              meal.id ||
              meal._id ||
              slug(
                meal.name
              )
            );

          normalized.emoji =
            meal.emoji ||
            getMealEmoji(
              meal
            );

          return normalized;
        }
      );

    saveTodayPlan();

    renderGeneratedPlan(
      todayPlanMeals
    );

    renderDashboard();

    await addGeneratedGroceries(
      todayPlanMeals
    );

    toast(
      "Your personalized meal plan is ready! 🎉",
      "success"
    );

  } catch (error) {

    console.error(
      "GENERATE PLAN:",
      error
    );

    toast(
      error.message ||
      "Unable to generate your meal plan.",
      "error"
    );

  } finally {

    button.disabled =
      false;

    button.textContent =
      "✨ Generate My Meal Plan";
  }
}


function renderGeneratedPlan(
  meals
) {

  const container =
    $("generatedPlan");

  if (!container) return;

  container.innerHTML =
    "";

  if (
    !Array.isArray(meals) ||
    !meals.length
  ) {

    container.classList.add(
      "hidden"
    );

    return;
  }

  meals.forEach(
    (meal) => {

      container.appendChild(
        createMealCard(
          meal
        )
      );
    }
  );

  container.classList.remove(
    "hidden"
  );
}


/* ============================================================
   GENERATED GROCERIES
   ============================================================ */

async function addGeneratedGroceries(
  meals
) {

  if (
    !Array.isArray(meals) ||
    !meals.length
  ) {
    return;
  }

  const existing =
    new Set(
      groceryItems.map(
        (item) =>
          String(
            item.name || ""
          )
            .trim()
            .toLowerCase()
      )
    );

  meals.forEach(
    (meal) => {

      const ingredients =
        Array.isArray(
          meal.ingredients
        )
          ? meal.ingredients
          : [];

      ingredients.forEach(
        (ingredient) => {

          let name = "";

          if (
            typeof ingredient ===
            "string"
          ) {

            name =
              ingredient.trim();

          } else if (
            ingredient &&
            typeof ingredient ===
              "object"
          ) {

            name =
              String(
                ingredient.name ||
                ingredient.item ||
                ""
              ).trim();
          }

          if (!name) {
            return;
          }

          const key =
            name.toLowerCase();

          if (
            existing.has(key)
          ) {
            return;
          }

          groceryItems.push({
            id:
              `generated-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,

            name,

            quantity:
              "",

            checked:
              false
          });

          existing.add(key);
        }
      );
    }
  );

  await persistGroceries(
    false
  );
}


/* ============================================================
   EATEN MEALS
   ============================================================ */

function mealsOn(date) {

  return eatenMeals.filter(
    (entry) =>
      String(
        entry.date
      ) ===
      String(date)
  );
}


function areAllTodayMealsEaten() {

  const ids =
    getTodayMealIds();

  if (!ids.length) {
    return false;
  }

  const eatenIds =
    new Set(
      mealsOn(today()).map(
        (entry) =>
          String(
            entry.mealId ||
            entry.meal?.id ||
            entry.id ||
            ""
          )
      )
    );

  return ids.every(
    (id) =>
      eatenIds.has(id)
  );
}


async function handleMealCheckbox(
  event
) {

  const input =
    event.target;

  if (
    !input.matches(
      "[data-meal-eaten]"
    )
  ) {
    return;
  }

  const card =
    input.closest(
      "[data-meal]"
    );

  if (!card) {
    return;
  }

  const meal =
    mealFromCard(
      card
    );

  if (
    input.checked
  ) {

    await markEaten(
      meal
    );

  } else {

    await unmarkEaten(
      meal.id,
      today()
    );
  }
}


async function markEaten(
  meal
) {

  const wasComplete =
    areAllTodayMealsEaten();

  try {

    const data =
      await request(
        `/meals/eaten/${encodeURIComponent(
          userId()
        )}`,
        {
          method: "POST",

          body:
            JSON.stringify({
              date:
                today(),

              meal
            })
        }
      );

    eatenMeals =
      data.eatenMeals ||
      [];

    renderAll();

    toast(
      `${meal.name} marked as eaten. ✓`,
      "success"
    );

    if (
      !wasComplete &&
      areAllTodayMealsEaten()
    ) {

      showMealCompletion();
    }

  } catch (error) {

    console.error(
      "MARK EATEN:",
      error
    );

    renderAll();

    toast(
      error.message ||
      "Could not mark meal as eaten.",
      "error"
    );
  }
}


async function unmarkEaten(
  mealId,
  date
) {

  try {

    const data =
      await request(
        `/eaten/${encodeURIComponent(
          mealId
        )}?userId=${encodeURIComponent(
          userId()
        )}&date=${encodeURIComponent(
          date
        )}`,
        {
          method:
            "DELETE"
        }
      );

    eatenMeals =
      data.eatenMeals ||
      [];

    renderAll();

  } catch (error) {

    console.error(
      "UNMARK EATEN:",
      error
    );

    renderAll();

    toast(
      error.message ||
      "Could not update meal status.",
      "error"
    );
  }
}


function syncEatenCheckboxes() {

  const eatenIds =
    new Set(
      mealsOn(today()).map(
        (entry) =>
          String(
            entry.mealId ||
            entry.meal?.id ||
            entry.id ||
            ""
          )
      )
    );

  $$(
    "[data-meal]"
  ).forEach(
    (card) => {

      const id =
        String(
          card.dataset.id ||
          ""
        );

      const checkbox =
        card.querySelector(
          "[data-meal-eaten]"
        );

      if (checkbox) {

        checkbox.checked =
          eatenIds.has(id);
      }

      const favorite =
        card.querySelector(
          "[data-favorite]"
        );

      if (favorite) {

        updateFavoriteButton(
          favorite,
          id
        );
      }
    }
  );
}


/* ============================================================
   FAVORITES
   ============================================================ */

async function toggleFavorite(
  button
) {

  const card =
    button.closest(
      "[data-meal]"
    );

  if (!card) return;

  const meal =
    mealFromCard(
      card
    );

  const exists =
    favorites.some(
      (item) => {

        const itemMeal =
          item.meal ||
          item;

        return String(
          itemMeal.id ||
          itemMeal._id ||
          ""
        ) ===
        String(
          meal.id
        );
      }
    );

  try {

    if (exists) {

      const data =
        await request(
          `/favorites/${encodeURIComponent(
            meal.id
          )}?userId=${encodeURIComponent(
            userId()
          )}`,
          {
            method:
              "DELETE"
          }
        );

      favorites =
        data.favorites ||
        [];

      toast(
        `${meal.name} removed from favorites.`,
        "success"
      );

    } else {

      const data =
        await request(
          "/favorites",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId:
                  userId(),

                meal
              })
          }
        );

      favorites =
        data.favorites ||
        [];

      toast(
        `${meal.name} saved to favorites. ❤️`,
        "success"
      );
    }

    renderFavorites();
    syncEatenCheckboxes();

  } catch (error) {

    console.error(
      "FAVORITE:",
      error
    );

    toast(
      error.message ||
      "Could not update favorite.",
      "error"
    );
  }
}


function updateFavoriteButton(
  button,
  mealId
) {

  const id =
    String(
      mealId || ""
    );

  const saved =
    favorites.some(
      (item) => {

        const meal =
          item.meal ||
          item;

        return String(
          meal.id ||
          meal._id ||
          ""
        ) === id;
      }
    );

  button.textContent =
    saved
      ? "❤️ Saved Favorite"
      : "🤍 Save Favorite";

  button.setAttribute(
    "aria-pressed",
    String(saved)
  );
}


function renderFavorites() {

  const grid =
    $("favoritesGrid");

  const empty =
    $("favoritesEmpty");

  if (!grid) {
    return;
  }

  grid.innerHTML =
    "";

  if (
    !favorites.length
  ) {

    empty
      ?.classList.remove(
        "hidden"
      );

    return;
  }

  empty
    ?.classList.add(
      "hidden"
    );

  favorites.forEach(
    (item) => {

      const meal =
        item.meal ||
        item;

      grid.appendChild(
        createMealCard(
          meal
        )
      );
    }
  );

  grid
    .querySelectorAll(
      "[data-favorite]"
    )
    .forEach(
      (button) => {

        updateFavoriteButton(
          button,
          button.closest(
            "[data-meal]"
          )?.dataset.id
        );
      }
    );
}


/* ============================================================
   GROCERY LIST
   ============================================================ */

function addGrocery() {

  const name =
    window.prompt(
      "What grocery item would you like to add?"
    );

  if (
    !name ||
    !name.trim()
  ) {
    return;
  }

  const quantity =
    window.prompt(
      "Quantity (optional):",
      "1"
    ) || "";

  groceryItems.push({
    id:
      `grocery-${Date.now()}`,

    name:
      name.trim(),

    quantity:
      quantity.trim(),

    checked:
      false
  });

  persistGroceries();
}


async function persistGroceries(
  showMessage = true
) {

  try {

    const data =
      await request(
        `/groceries/${encodeURIComponent(
          userId()
        )}`,
        {
          method:
            "PUT",

          body:
            JSON.stringify({
              groceries:
                groceryItems
            })
        }
      );

    groceryItems =
      data.groceries ||
      groceryItems;

    renderGroceries();

    if (showMessage) {

      toast(
        "Grocery list updated.",
        "success"
      );
    }

  } catch (error) {

    console.error(
      "GROCERY SAVE:",
      error
    );

    toast(
      error.message ||
      "Could not save grocery list.",
      "error"
    );
  }
}


function renderGroceries() {

  const list =
    $("groceryList");

  if (!list) {
    return;
  }

  list.innerHTML =
    "";

  if (
    !groceryItems.length
  ) {

    const li =
      document.createElement(
        "li"
      );

    li.textContent =
      "Your grocery list is empty. Add an item or generate a meal plan.";

    list.appendChild(
      li
    );

    return;
  }

  groceryItems.forEach(
    (item) => {

      const li =
        document.createElement(
          "li"
        );

      if (
        item.checked
      ) {

        li.classList.add(
          "completed"
        );
      }

      const left =
        document.createElement(
          "div"
        );

      left.className =
        "grocery-item-left";

      const checkbox =
        document.createElement(
          "input"
        );

      checkbox.type =
        "checkbox";

      checkbox.checked =
        Boolean(
          item.checked
        );

      checkbox.dataset.groceryToggle =
        item.id;

      const text =
        document.createElement(
          "span"
        );

      text.textContent =
        `${item.name}${
          item.quantity
            ? ` — ${item.quantity}`
            : ""
        }`;

      const remove =
        document.createElement(
          "button"
        );

      remove.type =
        "button";

      remove.className =
        "grocery-delete";

      remove.dataset.groceryDelete =
        item.id;

      remove.textContent =
        "Delete";

      left.append(
        checkbox,
        text
      );

      li.append(
        left,
        remove
      );

      list.appendChild(
        li
      );
    }
  );
}


function updateGroceryCheck(
  id,
  checked
) {

  const item =
    groceryItems.find(
      (entry) =>
        String(
          entry.id
        ) ===
        String(id)
    );

  if (!item) {
    return;
  }

  item.checked =
    Boolean(
      checked
    );

  persistGroceries();
}


function deleteGrocery(id) {

  groceryItems =
    groceryItems.filter(
      (item) =>
        String(
          item.id
        ) !==
        String(id)
    );

  persistGroceries();
}
/* ============================================================
   NUTRITION
   ============================================================ */

function renderNutrition() {

  const totals =
    totalsForDate(
      today()
    );

  const calorieGoal =
    Number(
      currentUser?.calorieGoal
    ) || 2000;

  const proteinGoal =
    Math.max(
      50,
      Math.round(
        calorieGoal *
        0.16 /
        4
      )
    );

  const carbsGoal =
    Math.max(
      100,
      Math.round(
        calorieGoal *
        0.50 /
        4
      )
    );

  const fatsGoal =
    Math.max(
      35,
      Math.round(
        calorieGoal *
        0.30 /
        9
      )
    );

  setText(
    "nutritionCalories",
    `${totals.calories} kcal`
  );

  setText(
    "nutritionCaloriesGoal",
    `${calorieGoal} kcal`
  );

  setText(
    "nutritionProtein",
    `${totals.protein} g`
  );

  setText(
    "nutritionProteinGoal",
    `${proteinGoal} g`
  );

  setText(
    "nutritionCarbs",
    `${totals.carbs} g`
  );

  setText(
    "nutritionCarbsGoal",
    `${carbsGoal} g`
  );

  setText(
    "nutritionFats",
    `${totals.fats} g`
  );

  setText(
    "nutritionFatsGoal",
    `${fatsGoal} g`
  );

  setProgress(
    "caloriesProgress",
    totals.calories,
    calorieGoal
  );

  setProgress(
    "proteinProgress",
    totals.protein,
    proteinGoal
  );

  setProgress(
    "carbsProgress",
    totals.carbs,
    carbsGoal
  );

  setProgress(
    "fatsProgress",
    totals.fats,
    fatsGoal
  );
}


function totalsForDate(
  date
) {

  return mealsOn(
    date
  ).reduce(
    (sum, entry) => {

      const meal =
        entry.meal ||
        entry;

      sum.calories +=
        Number(
          meal.calories
        ) || 0;

      sum.protein +=
        Number(
          meal.protein
        ) || 0;

      sum.carbs +=
        Number(
          meal.carbs
        ) || 0;

      sum.fats +=
        Number(
          meal.fat ??
          meal.fats
        ) || 0;

      return sum;

    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0
    }
  );
}


/* ============================================================
   CALENDAR
   ============================================================ */

function renderCalendar() {
  const grid =
    $("calendarGrid");

  const monthTitle =
    $("calendarMonthTitle");

  if (
    !grid ||
    !monthTitle
  ) {
    return;
  }

  const year =
    currentCalendarDate.getFullYear();

  const month =
    currentCalendarDate.getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      year,
      month + 1,
      0
    ).getDate();

  const previousDays =
    new Date(
      year,
      month,
      0
    ).getDate();

  monthTitle.textContent =
    new Intl.DateTimeFormat(
      undefined,
      {
        month: "long",
        year: "numeric"
      }
    ).format(
      currentCalendarDate
    );

  grid.innerHTML = "";

  /*
   * Always show a complete 6-row calendar.
   * This keeps the calendar height consistent
   * when changing between months.
   */
  const totalCells = 42;

  for (
    let index = 0;
    index < totalCells;
    index++
  ) {

    let dayNumber;
    let cellDate;
    let otherMonth = false;

    if (
      index < firstDay
    ) {

      dayNumber =
        previousDays -
        firstDay +
        index +
        1;

      cellDate =
        new Date(
          year,
          month - 1,
          dayNumber
        );

      otherMonth = true;

    } else if (
      index >=
      firstDay +
      daysInMonth
    ) {

      dayNumber =
        index -
        firstDay -
        daysInMonth +
        1;

      cellDate =
        new Date(
          year,
          month + 1,
          dayNumber
        );

      otherMonth = true;

    } else {

      dayNumber =
        index -
        firstDay +
        1;

      cellDate =
        new Date(
          year,
          month,
          dayNumber
        );
    }

    const dateString =
      formatDate(
        cellDate
      );

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "calendar-day";

    button.dataset.calendarDate =
      dateString;

    if (
      otherMonth
    ) {
      button.classList.add(
        "other-month"
      );
    }

    if (
      dateString ===
      today()
    ) {
      button.classList.add(
        "today"
      );
    }

    if (
      dateString ===
      formatDate(
        currentCalendarDate
      )
    ) {
      button.classList.add(
        "selected"
      );
    }

    /*
     * Show a green dot when meals
     * were eaten on that date.
     */
    const meals =
      mealsOn(
        dateString
      );

    if (
      meals.length > 0
    ) {
      button.classList.add(
        "has-meals"
      );
    }

    button.innerHTML = `
      <span class="calendar-day-number">
        ${dayNumber}
      </span>

      ${
        meals.length
          ? `
            <small class="calendar-meal-count">
              ${meals.length}
              ${meals.length === 1 ? "meal" : "meals"}
            </small>
          `
          : ""
      }
    `;

    grid.appendChild(
      button
    );
  }
}

function renderCalendarDetails(
  date
) {

  const details =
    $("calendarDayDetails");

  if (!details) {
    return;
  }

  const totals =
    totalsForDate(
      date
    );

  const entries =
    mealsOn(
      date
    );

  const calorieGoal =
    Number(
      currentUser?.calorieGoal
    ) || 2000;

  const proteinGoal =
    Math.max(
      50,
      Math.round(
        calorieGoal *
        0.16 /
        4
      )
    );

  const carbsGoal =
    Math.max(
      100,
      Math.round(
        calorieGoal *
        0.50 /
        4
      )
    );

  const fatsGoal =
    Math.max(
      35,
      Math.round(
        calorieGoal *
        0.30 /
        9
      )
    );

  setText(
    "selectedDateTitle",
    formatHumanDate(
      date
    )
  );

  setText(
    "selectedDateCalories",
    `${totals.calories} kcal`
  );

  setText(
    "selectedDateProtein",
    `${totals.protein} g`
  );

  setText(
    "selectedDateCarbs",
    `${totals.carbs} g`
  );

  setText(
    "selectedDateFats",
    `${totals.fats} g`
  );

  setText(
    "selectedDateMeals",
    `${entries.length} meals`
  );

  setText(
    "dayCaloriesText",
    `${totals.calories} / ${calorieGoal} kcal`
  );

  setText(
    "dayProteinText",
    `${totals.protein} / ${proteinGoal} g`
  );

  setText(
    "dayCarbsText",
    `${totals.carbs} / ${carbsGoal} g`
  );

  setText(
    "dayFatsText",
    `${totals.fats} / ${fatsGoal} g`
  );

  setProgress(
    "dayCaloriesProgress",
    totals.calories,
    calorieGoal
  );

  setProgress(
    "dayProteinProgress",
    totals.protein,
    proteinGoal
  );

  setProgress(
    "dayCarbsProgress",
    totals.carbs,
    carbsGoal
  );

  setProgress(
    "dayFatsProgress",
    totals.fats,
    fatsGoal
  );

 const list =
  $("calendarDetailsList");

  if (list) {

    list.innerHTML =
      "";

    if (
      !entries.length
    ) {

      const empty =
        document.createElement(
          "p"
        );

      empty.className =
        "empty-state";

      empty.textContent =
        "No meals marked as eaten on this date.";

      list.appendChild(
        empty
      );

    } else {

      entries.forEach(
        (entry) => {

          const meal =
            entry.meal ||
            entry;

          const item =
            document.createElement(
              "div"
            );

          item.className =
            "selected-date-meal";

          item.textContent =
            `${getMealEmoji(
              meal
            )} ${
              meal.name ||
              "Meal"
            } · ${
              meal.calories ||
              0
            } kcal`;

          list.appendChild(
            item
          );
        }
      );
    }
  }

  details.classList.remove(
    "hidden"
  );
}


/* ============================================================
   PROFILE
   ============================================================ */

function renderProfile() {

  if (!currentUser) {
    return;
  }

  const name =
    currentUser.username ||
    currentUser.name ||
    "User";

  setValue(
    "profileNameInput",
    name
  );

  setValue(
    "profileEmailInput",
    currentUser.email ||
    ""
  );

  setValue(
    "profileDiet",
    currentUser.dietType ||
    currentUser.diet ||
    "Vegetarian"
  );

  setValue(
    "calorieGoal",
    currentUser.calorieGoal ||
    2000
  );

  setValue(
    "profileHealthCondition",
    currentUser.healthCondition ||
    ""
  );

  setCheckedValues(
    "profileAllergiesOptions",
    currentUser.allergies ||
    []
  );

  updateUserUi();
}


async function saveProfile(
  event
) {

  event.preventDefault();

  const data = {

    userId:
      userId(),

    username:
      $("profileNameInput")
        ?.value
        .trim() ||
      "User",

    dietType:
      $("profileDiet")
        ?.value ||
      "Vegetarian",

    calorieGoal:
      Math.max(
        1,
        Number(
          $("calorieGoal")
            ?.value
        ) || 2000
      ),

    healthCondition:
      $("profileHealthCondition")
        ?.value ||
      "",

    allergies:
      getCheckedValues(
        "profileAllergiesOptions"
      )
  };

  try {

    const response =
      await request(
        `/profile/${encodeURIComponent(
          userId()
        )}`,
        {
          method:
            "PUT",

          body:
            JSON.stringify(
              data
            )
        }
      );

    currentUser =
      response.user ||
      {
        ...currentUser,
        ...data
      };

    persistUser();

    updateUserUi();

    renderAll();

    toast(
      "Profile saved successfully. ✓",
      "success"
    );

  } catch (error) {

    console.error(
      "PROFILE SAVE:",
      error
    );

    toast(
      error.message ||
      "Unable to save profile.",
      "error"
    );
  }
}


/* ============================================================
   RECIPES
   ============================================================ */

async function loadRecipes() {

  try {

    const data =
      await request(
        "/recipes"
      );

    recipes =
      data.recipes ||
      [];

    recipes.forEach(
      (recipe) => {

        const id =
          String(
            recipe.id ||
            recipe._id ||
            ""
          );

        if (id) {

          recipe.id =
            id;

          recipeCache[id] =
            {
              ...recipeCache[id],
              ...recipe
            };
        }
      }
    );

    renderPublicRecipes();

  } catch (error) {

    console.error(
      "RECIPES:",
      error
    );

    const grid =
      $("recipesGrid");

    if (grid) {

      grid.innerHTML =
        "";

      const errorBox =
        document.createElement(
          "div"
        );

      errorBox.className =
        "empty-state";

      errorBox.textContent =
        error.message ||
        "Unable to load recipes.";

      grid.appendChild(
        errorBox
      );
    }
  }

  await loadMyRecipes();
}


async function loadMyRecipes() {

  const id =
    userId();

  if (!id) {
    return;
  }

  try {

    const data =
      await request(
        `/user-recipes/${encodeURIComponent(
          id
        )}`
      );

    myRecipes =
      data.recipes ||
      [];

    myRecipes.forEach(
      (recipe) => {

        const recipeId =
          String(
            recipe.id ||
            recipe._id ||
            ""
          );

        if (recipeId) {

          recipe.id =
            recipeId;

          recipeCache[
            recipeId
          ] = {
            ...recipeCache[
              recipeId
            ],

            ...recipe
          };
        }
      }
    );

    renderMyRecipes();

  } catch (error) {

    console.error(
      "MY RECIPES:",
      error
    );

    myRecipes =
      [];

    renderMyRecipes();
  }
}


function renderPublicRecipes() {

  const grid =
    $("recipesGrid");

  if (!grid) {
    return;
  }

  const search =
    String(
      $("recipeSearch")
        ?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const filtered =
    recipes.filter(
      (recipe) => {

        if (!search) {
          return true;
        }

        return [
          recipe.name,
          recipe.description,
          recipe.cuisine,
          recipe.type,
          recipe.diet
        ]
          .map(
            (value) =>
              String(
                value || ""
              ).toLowerCase()
          )
          .join(" ")
          .includes(search);
      }
    );

  grid.innerHTML =
    "";

  if (!filtered.length) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "empty-state";

    empty.textContent =
      "No MealAI recipes available yet.";

    grid.appendChild(
      empty
    );

    return;
  }

  filtered.forEach(
    (recipe) => {

      grid.appendChild(
        createRecipeCard(
          recipe,
          false
        )
      );
    }
  );
}


function renderMyRecipes() {

  const grid =
    $("myRecipesGrid");

  const empty =
    $("myRecipesEmpty");

  if (!grid) {
    return;
  }

  const search =
    String(
      $("myRecipeSearch")
        ?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const filtered =
    myRecipes.filter(
      (recipe) => {

        if (!search) {
          return true;
        }

        return [
          recipe.name,
          recipe.description,
          recipe.cuisine,
          recipe.type,
          recipe.diet
        ]
          .map(
            (value) =>
              String(
                value || ""
              ).toLowerCase()
          )
          .join(" ")
          .includes(search);
      }
    );

  grid.innerHTML =
    "";

  if (!filtered.length) {

    empty
      ?.classList.remove(
        "hidden"
      );

    return;
  }

  empty
    ?.classList.add(
      "hidden"
    );

  filtered.forEach(
    (recipe) => {

      grid.appendChild(
        createRecipeCard(
          recipe,
          true
        )
      );
    }
  );
}


function createRecipeCard(
  recipe,
  mine
) {
  const article =
    document.createElement(
      "article"
    );

  /*
   * Use the SAME card class as
   * generated/dashboard meals.
   */
  article.className =
    "meal-card recipe-meal-card";

  article.dataset.recipeId =
    recipe.id ||
    recipe._id ||
    "";

  /*
   * Large emoji section
   * — same as generated meals
   */
  const emoji =
    document.createElement(
      "div"
    );

  emoji.className =
    "meal-card-emoji";

  emoji.textContent =
    recipe.emoji ||
    "🍽️";

  article.appendChild(
    emoji
  );

  /*
   * Main card content
   */
  const content =
    document.createElement(
      "div"
    );

  content.className =
    "meal-card-content";

  /*
   * Title
   */
  const title =
    document.createElement(
      "h3"
    );

  title.textContent =
    recipe.name ||
    "Untitled Recipe";

  content.appendChild(
    title
  );

  /*
   * Description
   */
  const description =
    document.createElement(
      "p"
    );

  description.textContent =
    recipe.description ||
    "A delicious MealAI recipe.";

  content.appendChild(
    description
  );

  /*
   * Meal information
   * — same style as generated meals
   */
  const meta =
    document.createElement(
      "small"
    );

  meta.textContent =
    `🔥 ${
      recipe.calories ||
      0
    } kcal · ⏱️ ${
      recipe.time ||
      30
    } min · 💪 ${
      recipe.protein ||
      0
    }g`;

  content.appendChild(
    meta
  );

  /*
   * Buttons
   */
  const actions =
    document.createElement(
      "div"
    );

  actions.className =
    "meal-actions";

  /*
   * View Recipe
   */
  const view =
    document.createElement(
      "button"
    );

  view.type =
    "button";

  view.className =
    "secondary-btn";

  view.dataset.action =
    "view-recipe";

  view.dataset.recipeId =
    recipe.id ||
    recipe._id ||
    "";

  view.textContent =
    "View Recipe";

  actions.appendChild(
    view
  );

  /*
   * My Recipe controls
   */
  if (mine) {

    const edit =
      document.createElement(
        "button"
      );

    edit.type =
      "button";

    edit.className =
      "secondary-btn";

    edit.dataset.action =
      "edit-user-recipe";

    edit.dataset.id =
      recipe.id ||
      recipe._id ||
      "";

    edit.textContent =
      "Edit";

    actions.appendChild(
      edit
    );

    const remove =
      document.createElement(
        "button"
      );

    remove.type =
      "button";

    remove.className =
      "danger-btn";

    remove.dataset.action =
      "delete-user-recipe";

    remove.dataset.id =
      recipe.id ||
      recipe._id ||
      "";

    remove.textContent =
      "Delete";

    actions.appendChild(
      remove
    );
  }

  content.appendChild(
    actions
  );

  article.appendChild(
    content
  );

  return article;
}

function openRecipe(
  recipe
) {

  if (!recipe) {
    return;
  }

  const modal =
    $("recipeModal");

  if (!modal) {

    /*
     * If your HTML has no recipe
     * detail modal, show the recipe
     * in a simple alert instead.
     */

    window.alert(
      `${recipe.name || "Recipe"}\n\n` +
      `Ingredients:\n${
        (
          recipe.ingredients ||
          []
        ).join("\n")
      }\n\n` +
      `Instructions:\n${
        (
          recipe.instructions ||
          []
        ).join("\n")
      }`
    );

    return;
  }

  setText(
    "recipeModalTitle",
    `${recipe.emoji || "📖"} ${
      recipe.name ||
      "Recipe"
    }`
  );

  setText(
    "recipeModalMeta",
    `${recipe.calories || 0} kcal · ${
      recipe.time || 30
    } min · ${
      recipe.protein || 0
    }g protein`
  );

  const ingredients =
    $("recipeModalIngredients");

  if (ingredients) {

    ingredients.innerHTML =
      "";

    (
      recipe.ingredients ||
      []
    ).forEach(
      (ingredient) => {

        const li =
          document.createElement(
            "li"
          );

        li.textContent =
          ingredient;

        ingredients.appendChild(
          li
        );
      }
    );
  }

  const instructions =
    $("recipeModalInstructions");

  if (instructions) {

    instructions.innerHTML =
      "";

    (
      recipe.instructions ||
      []
    ).forEach(
      (instruction) => {

        const li =
          document.createElement(
            "li"
          );

        li.textContent =
          instruction;

        instructions.appendChild(
          li
        );
      }
    );
  }

  modal.classList.remove(
    "hidden"
  );
}


function openUserRecipeForm(
  recipe = null
) {

  const modal =
    $("addRecipeModal");

  if (!modal) {
    return;
  }

  setText(
    "addRecipeModalTitle",
    recipe
      ? "Edit Recipe"
      : "Add Your Recipe"
  );

  setValue(
    "userRecipeId",
    recipe
      ? String(
          recipe.id ||
          recipe._id ||
          ""
        )
      : ""
  );

  setValue(
    "userRecipeName",
    recipe?.name ||
    ""
  );

  setValue(
    "userRecipeEmoji",
    recipe?.emoji ||
    "📖"
  );

  setValue(
    "userRecipeDescription",
    recipe?.description ||
    ""
  );

  setValue(
    "userRecipeType",
    recipe?.type ||
    "Recipe"
  );

  setValue(
    "userRecipeDiet",
    recipe?.diet ||
    "vegetarian"
  );

  setValue(
    "userRecipeCuisine",
    recipe?.cuisine ||
    "Indian"
  );

  setValue(
    "userRecipeTime",
    recipe?.time ||
    30
  );

  setValue(
    "userRecipeCalories",
    recipe?.calories ||
    0
  );

  setValue(
    "userRecipeProtein",
    recipe?.protein ||
    0
  );

  setValue(
    "userRecipeCarbs",
    recipe?.carbs ||
    0
  );

  setValue(
    "userRecipeFats",
    recipe?.fats ??
    recipe?.fat ??
    0
  );

  setValue(
    "userRecipeIngredients",
    (
      recipe?.ingredients ||
      []
    ).join("\n")
  );

  setValue(
    "userRecipeInstructions",
    (
      recipe?.instructions ||
      []
    ).join("\n")
  );

  const saveButton =
    $("saveUserRecipeBtn");

  if (saveButton) {

    saveButton.textContent =
      recipe
        ? "Update Recipe"
        : "Save Recipe";
  }

  modal.classList.remove(
    "hidden"
  );
}


function closeUserRecipeForm() {

  $("addRecipeModal")
    ?.classList.add(
      "hidden"
    );
}


async function saveUserRecipe(
  event
) {

  event.preventDefault();

  const id =
    $("userRecipeId")
      ?.value
      .trim();

  const payload = {

    name:
      $("userRecipeName")
        ?.value
        .trim(),

    description:
      $("userRecipeDescription")
        ?.value
        .trim(),

    emoji:
      $("userRecipeEmoji")
        ?.value
        .trim() ||
      "📖",

    type:
      $("userRecipeType")
        ?.value ||
      "Recipe",

    diet:
      $("userRecipeDiet")
        ?.value ||
      "vegetarian",

    cuisine:
      $("userRecipeCuisine")
        ?.value
        .trim() ||
      "Indian",

    time:
      Number(
        $("userRecipeTime")
          ?.value
      ) || 30,

    calories:
      Number(
        $("userRecipeCalories")
          ?.value
      ) || 0,

    protein:
      Number(
        $("userRecipeProtein")
          ?.value
      ) || 0,

    carbs:
      Number(
        $("userRecipeCarbs")
          ?.value
      ) || 0,

    fats:
      Number(
        $("userRecipeFats")
          ?.value
      ) || 0,

    ingredients:
      recipeFormList(
        $("userRecipeIngredients")
          ?.value
      ),

    instructions:
      recipeFormList(
        $("userRecipeInstructions")
          ?.value
      )
  };

  if (!payload.name) {

    toast(
      "Recipe name is required.",
      "error"
    );

    return;
  }

  if (
    !payload.ingredients.length
  ) {

    toast(
      "Add at least one ingredient.",
      "error"
    );

    return;
  }

  if (
    !payload.instructions.length
  ) {

    toast(
      "Add at least one instruction.",
      "error"
    );

    return;
  }

  const button =
    $("saveUserRecipeBtn");

  if (button) {

    button.disabled =
      true;

    button.textContent =
      id
        ? "Updating..."
        : "Saving...";
  }

  try {

    const path =
      id
        ? `/user-recipes/${encodeURIComponent(
            userId()
          )}/${encodeURIComponent(
            id
          )}`
        : `/user-recipes/${encodeURIComponent(
            userId()
          )}`;

    const data =
      await request(
        path,
        {
          method:
            id
              ? "PUT"
              : "POST",

          body:
            JSON.stringify(
              payload
            )
        }
      );

    const saved =
      data.recipe;

    if (saved) {

      const savedId =
        String(
          saved.id ||
          saved._id ||
          ""
        );

      if (id) {

        myRecipes =
          myRecipes.map(
            (recipe) =>
              String(
                recipe.id ||
                recipe._id
              ) === id
                ? saved
                : recipe
          );

      } else {

        myRecipes.unshift(
          saved
        );
      }

      if (savedId) {

        recipeCache[
          savedId
        ] =
          saved;
      }
    }

    closeUserRecipeForm();

    renderMyRecipes();

    toast(
      id
        ? "Recipe updated successfully. ✓"
        : "Recipe added successfully. ✓",
      "success"
    );

  } catch (error) {

    console.error(
      "SAVE RECIPE:",
      error
    );

    toast(
      error.message ||
      "Unable to save recipe.",
      "error"
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        id
          ? "Update Recipe"
          : "Save Recipe";
    }
  }
}


async function deleteUserRecipe(
  id
) {

  if (!id) {
    return;
  }

  const confirmed =
    window.confirm(
      "Delete this recipe?"
    );

  if (!confirmed) {
    return;
  }

  try {

    await request(
      `/user-recipes/${encodeURIComponent(
        userId()
      )}/${encodeURIComponent(
        id
      )}`,
      {
        method:
          "DELETE"
      }
    );

    myRecipes =
      myRecipes.filter(
        (recipe) =>
          String(
            recipe.id ||
            recipe._id
          ) !==
          String(id)
      );

    delete recipeCache[
      id
    ];

    renderMyRecipes();

    toast(
      "Recipe deleted.",
      "success"
    );

  } catch (error) {

    console.error(
      "DELETE RECIPE:",
      error
    );

    toast(
      error.message ||
      "Unable to delete recipe.",
      "error"
    );
  }
}


function recipeFormList(
  value
) {

  return String(
    value || ""
  )
    .split(/\r?\n/)
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean);
}


/* ============================================================
   AI ASSISTANT
   ============================================================ */

async function sendChat(
  event
) {

  event.preventDefault();

  if (chatBusy) {
    return;
  }

  const input =
    $("chatInput");

  const message =
    input
      ?.value
      .trim();

  if (!message) {
    return;
  }

  appendChatMessage(
    message,
    "user"
  );

  input.value =
    "";

  chatBusy =
    true;

  const typing =
    appendChatMessage(
      "Thinking…",
      "assistant"
    );

  try {

    const data =
      await request(
        "/assistant",
        {
          method:
            "POST",

          body:
            JSON.stringify({
              message,

              userId:
                userId(),

              profile: {

                name:
                  currentUser?.username ||
                  currentUser?.name ||
                  "User",

                dietType:
                  currentUser?.dietType ||
                  currentUser?.diet ||
                  "Vegetarian",

                goal:
                  currentUser?.goal ||
                  "Healthy Lifestyle",

                allergies:
                  currentUser?.allergies ||
                  [],

                healthCondition:
                  currentUser?.healthCondition ||
                  "",

                calorieGoal:
                  Number(
                    currentUser?.calorieGoal
                  ) || 2000
              }
            })
        }
      );

    typing.remove();

    appendChatMessage(
      data.reply ||
      data.message ||
      "I couldn't generate a response right now.",
      "assistant"
    );

  } catch (error) {

    console.error(
      "ASSISTANT:",
      error
    );

    typing.remove();

    appendChatMessage(
      `I couldn't reach the assistant. ${
        error.message ||
        "Please try again."
      }`,
      "assistant"
    );

  } finally {

    chatBusy =
      false;

    input
      ?.focus();
  }
}


function appendChatMessage(
  text,
  role
) {

  const container =
    $("chatMessages");

  const message =
    document.createElement(
      "div"
    );

  message.className =
    `chat-message ${role}`;

  message.textContent =
    text;

  container
    ?.appendChild(
      message
    );

  if (container) {

    container.scrollTop =
      container.scrollHeight;
  }

  return message;
}


/* ============================================================
   WATER
   ============================================================ */

function adjustWater(
  delta
) {

  const key =
    waterStorageKey();

  const next =
    Math.max(
      0,
      Math.min(
        20,
        getWater() +
        delta
      )
    );

  localStorage.setItem(
    key,
    String(next)
  );

  renderDashboard();
}


function getWater() {

  return Number(
    localStorage.getItem(
      waterStorageKey()
    )
  ) || 0;
}


function waterStorageKey() {

  return `mealaiWater:${userId()}:${today()}`;
}


/* ============================================================
   DELEGATED EVENTS
   ============================================================ */

function delegatedClick(
  event
) {

  const favoriteButton =
    event.target.closest(
      "[data-favorite]"
    );

  if (
    favoriteButton
  ) {

    event.preventDefault();

    toggleFavorite(
      favoriteButton
    );

    return;
  }


  const calendarDay =
    event.target.closest(
      "[data-calendar-date]"
    );

  if (
    calendarDay
  ) {

    renderCalendarDetails(
      calendarDay.dataset
        .calendarDate
    );

    return;
  }


  const groceryDelete =
    event.target.closest(
      "[data-grocery-delete]"
    );

  if (
    groceryDelete
  ) {

    deleteGrocery(
      groceryDelete.dataset
        .groceryDelete
    );

    return;
  }


  const groceryToggle =
    event.target.closest(
      "[data-grocery-toggle]"
    );

  if (
    groceryToggle
  ) {

    updateGroceryCheck(
      groceryToggle.dataset
        .groceryToggle,
      groceryToggle.checked
    );

    return;
  }


  const action =
    event.target.closest(
      "[data-action]"
    );

  if (!action) {
    return;
  }

  const actionName =
    action.dataset.action;


  if (
    actionName ===
    "view-recipe"
  ) {

    const id =
      action.dataset.recipeId ||
      action.dataset.mealId;

    const recipe =
      recipeCache[id] ||
      recipes.find(
        (item) =>
          String(
            item.id ||
            item._id
          ) ===
          String(id)
      ) ||
      myRecipes.find(
        (item) =>
          String(
            item.id ||
            item._id
          ) ===
          String(id)
      );

    openRecipe(
      recipe
    );

    return;
  }


  if (
    actionName ===
    "edit-user-recipe"
  ) {

    const id =
      action.dataset.id;

    const recipe =
      myRecipes.find(
        (item) =>
          String(
            item.id ||
            item._id
          ) ===
          String(id)
      );

    if (recipe) {

      openUserRecipeForm(
        recipe
      );
    }

    return;
  }


  if (
    actionName ===
    "delete-user-recipe"
  ) {

    deleteUserRecipe(
      action.dataset.id
    );

    return;
  }


  if (
    actionName ===
    "close-user-recipe"
  ) {

    closeUserRecipeForm();

    return;
  }
}


function handleChange(
  event
) {

  if (
    event.target.matches(
      "[data-meal-eaten]"
    )
  ) {

    handleMealCheckbox(
      event
    );

    return;
  }

  if (
    event.target.matches(
      "[data-grocery-toggle]"
    )
  ) {

    updateGroceryCheck(
      event.target.dataset
        .groceryToggle,

      event.target.checked
    );
  }
}


/* ============================================================
   UTILITIES
   ============================================================ */

function getCheckedValues(
  containerId
) {

  return $$(
    `#${containerId} input[type="checkbox"]:checked`
  ).map(
    (input) =>
      input.value
  );
}


function setCheckedValues(
  containerId,
  values
) {

  const selected =
    new Set(
      (
        values ||
        []
      ).map(
        (value) =>
          String(value)
      )
    );

  $$(
    `#${containerId} input[type="checkbox"]`
  ).forEach(
    (input) => {

      input.checked =
        selected.has(
          String(
            input.value
          )
        );
    }
  );
}


function setText(
  id,
  value
) {

  const element =
    $(id);

  if (element) {

    element.textContent =
      String(
        value ?? ""
      );
  }
}


function setValue(
  id,
  value
) {

  const element =
    $(id);

  if (element) {

    element.value =
      value ??
      "";
  }
}


function setProgress(
  id,
  value,
  goal
) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  const percent =
    goal > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (
              Number(value) /
              Number(goal)
            ) *
            100
          )
        )
      : 0;

  element.style.width =
    `${percent}%`;
}


function today() {

  return formatDate(
    new Date()
  );
}


function formatDate(
  date
) {

  const d =
    new Date(
      date
    );

  const year =
    d.getFullYear();

  const month =
    String(
      d.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      d.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}


function formatHumanDate(
  date
) {

  return new Intl.DateTimeFormat(
    undefined,
    {
      weekday:
        "long",

      month:
        "long",

      day:
        "numeric",

      year:
        "numeric"
    }
  ).format(
    new Date(
      `${date}T12:00:00`
    )
  );
}


function slug(
  value
) {

  return String(
    value ||
    "meal"
  )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    ) ||
    "meal";
}


function showMealCompletion() {

  toast(
    "🎉 Great job! You've completed all of today's meals!",
    "success",
    5000
  );
}


function toast(
  message,
  type = "success",
  duration = 3500
) {

  const element =
    $("toast");

  if (!element) {
    return;
  }

  clearTimeout(
    toastTimer
  );

  element.textContent =
    message;

  element.className =
    `toast ${type}`;

  element.classList.remove(
    "hidden"
  );

  toastTimer =
    setTimeout(
      () => {

        element.classList.add(
          "hidden"
        );

      },
      duration
    );
}


