"use strict";

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = express();

app.set("trust proxy", 1);

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;


// ============================================================
// MIDDLEWARE
// ============================================================

const allowedOrigins = String(
    process.env.FRONTEND_URL || ""
)
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }

            if (!allowedOrigins.length) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error("CORS origin not allowed")
            );
        },

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

app.use(
    express.json({
        limit: "2mb"
    })
);


// ============================================================
// HELPERS
// ============================================================

function hashPassword(password) {
    return crypto
        .createHash("sha256")
        .update(String(password))
        .digest("hex");
}


function slug(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}


function number(value, fallback = 0) {
    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function normalizeList(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => String(item).trim())
            .filter(Boolean);
    }

    if (!value) {
        return [];
    }

    return String(value)
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
}


function cleanText(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}
// ============================================================
// MEAL FILTER HELPERS
// ============================================================

function matchesDiet(meal, requestedDiet) {
    const diet = cleanText(requestedDiet);

    if (!diet) {
        return true;
    }

    const mealDiet = cleanText(
        meal?.diet ||
        meal?.dietType ||
        ""
    );

    // If meal has no diet information, allow it.
    if (!mealDiet) {
        return true;
    }

    // Vegetarian
    if (
        diet.includes("vegetarian") &&
        !diet.includes("non")
    ) {
        return (
            mealDiet.includes("vegetarian") ||
            mealDiet.includes("vegan") ||
            mealDiet === "veg"
        );
    }

    // Vegan
    if (diet.includes("vegan")) {
        return (
            mealDiet.includes("vegan")
        );
    }

    // Eggetarian
    if (
        diet.includes("eggetarian") ||
        diet.includes("egg")
    ) {
        return (
            mealDiet.includes("vegetarian") ||
            mealDiet.includes("eggetarian") ||
            mealDiet.includes("egg") ||
            mealDiet.includes("vegan")
        );
    }

    // Non-vegetarian
    if (
        diet.includes("non vegetarian") ||
        diet.includes("non-vegetarian") ||
        diet.includes("nonveg") ||
        diet.includes("non veg")
    ) {
        return true;
    }

    // Otherwise compare normally.
    return (
        mealDiet === diet ||
        mealDiet.includes(diet) ||
        diet.includes(mealDiet)
    );
}


function matchesAllergies(meal, allergies) {
    const allergyList =
        normalizeList(allergies)
            .map(cleanText)
            .filter(Boolean);

    if (!allergyList.length) {
        return true;
    }

    const mealText = [
        meal?.name,
        meal?.description,
        meal?.diet,
        meal?.cuisine,
        ...(Array.isArray(meal?.ingredients)
            ? meal.ingredients
            : normalizeList(meal?.ingredients)),
        ...(Array.isArray(meal?.tags)
            ? meal.tags
            : normalizeList(meal?.tags))
    ]
        .map(cleanText)
        .join(" ");

    return !allergyList.some(allergy =>
        mealText.includes(allergy)
    );
}


function matchesHealthCondition(
    meal,
    healthCondition
) {
    const condition =
        cleanText(healthCondition);

    // No health condition selected.
    if (
        !condition ||
        condition === "none" ||
        condition === "no"
    ) {
        return true;
    }

    const mealText = [
        meal?.name,
        meal?.description,
        meal?.diet,
        meal?.cuisine,
        ...(Array.isArray(meal?.ingredients)
            ? meal.ingredients
            : normalizeList(meal?.ingredients)),
        ...(Array.isArray(meal?.tags)
            ? meal.tags
            : normalizeList(meal?.tags))
    ]
        .map(cleanText)
        .join(" ");

    // Avoid obviously unsuitable foods for common
    // health-condition selections.
    if (
        condition.includes("diabetes") ||
        condition.includes("diabetic")
    ) {
        const highSugarWords = [
            "sugar",
            "sweet",
            "dessert",
            "candy",
            "syrup"
        ];

        return !highSugarWords.some(word =>
            mealText.includes(word)
        );
    }

    if (
        condition.includes("hypertension") ||
        condition.includes("high blood pressure")
    ) {
        const highSaltWords = [
            "salty",
            "salted",
            "pickle",
            "papad"
        ];

        return !highSaltWords.some(word =>
            mealText.includes(word)
        );
    }

    // For conditions where we do not have a specific
    // meal restriction in the built-in database,
    // allow the meal rather than breaking generation.
    return true;
}


function publicUser(user) {
    return {
        id: String(user._id),
        _id: String(user._id),

        name: user.name,
        email: user.email,

        role: user.role || "user",
        status: user.status || "active",

        age: user.age,
        gender: user.gender,
        height: user.height,
        weight: user.weight,

        goal: user.goal,

        dietType: user.dietType,
        diet: user.diet,

        mealsPerDay: user.mealsPerDay,
        cookingTime: user.cookingTime,
        calorieGoal: user.calorieGoal,

        allergies: user.allergies || [],

        healthCondition:
            user.healthCondition || "",

        preferredCuisine:
            user.preferredCuisine || "Indian",

        groceries:
            user.groceries || [],

        favorites:
            user.favorites || [],

        eatenMeals:
            user.eatenMeals || []
    };
}


// ============================================================
// BUILT-IN MEALS / RECIPES
// ============================================================

const MEALS = [

    {
        id: "vegetable-poha",
        name: "Vegetable Poha",
        description:
            "Light flattened rice cooked with vegetables, peas and mild Indian spices.",
        emoji: "🍚",
        type: "Breakfast",
        diet: "vegetarian",
        cuisine: "Indian",
        calories: 280,
        protein: 7,
        carbs: 48,
        fats: 7,
        time: 20,

        ingredients: [
            "1 cup poha",
            "1/2 cup mixed vegetables",
            "1 tsp oil",
            "Mustard seeds",
            "Turmeric",
            "Lemon"
        ],

        instructions: [
            "Rinse poha and drain well.",
            "Temper mustard seeds in oil and sauté vegetables.",
            "Add poha and turmeric and cook for 4–5 minutes.",
            "Finish with lemon and serve warm."
        ],

        tags: [
            "healthy",
            "quick"
        ]
    },


    {
        id: "moong-dal-chilla",
        name: "Moong Dal Chilla",
        description:
            "Protein-rich savoury lentil pancakes with herbs and vegetables.",
        emoji: "🥞",
        type: "Breakfast",
        diet: "vegetarian",
        cuisine: "Indian",
        calories: 310,
        protein: 17,
        carbs: 38,
        fats: 9,
        time: 25,

        ingredients: [
            "1 cup moong dal",
            "Ginger",
            "Green chilli",
            "Onion",
            "Coriander",
            "Spices"
        ],

        instructions: [
            "Soak and blend moong dal into a smooth batter.",
            "Mix in chopped vegetables and spices.",
            "Spread batter on a hot pan and cook both sides.",
            "Serve hot with chutney."
        ],

        tags: [
            "high protein",
            "healthy"
        ]
    },


    {
        id: "vegetable-oats-upma",
        name: "Vegetable Oats Upma",
        description:
            "A fibre-rich savoury oats breakfast packed with colourful vegetables.",
        emoji: "🥣",
        type: "Breakfast",
        diet: "vegan",
        cuisine: "Indian",
        calories: 300,
        protein: 10,
        carbs: 44,
        fats: 8,
        time: 20,

        ingredients: [
            "1 cup oats",
            "Mixed vegetables",
            "1 tsp oil",
            "Mustard seeds",
            "Curry leaves"
        ],

        instructions: [
            "Dry roast oats lightly.",
            "Sauté spices and vegetables in oil.",
            "Add oats and water.",
            "Cook until soft and serve warm."
        ],

        tags: [
            "fibre",
            "healthy"
        ]
    },


    {
        id: "paneer-vegetable-bowl",
        name: "Paneer Vegetable Bowl",
        description:
            "Grilled paneer served with sautéed vegetables and a fresh lemon-herb dressing.",
        emoji: "🥗",
        type: "Lunch",
        diet: "vegetarian",
        cuisine: "Indian",
        calories: 460,
        protein: 27,
        carbs: 34,
        fats: 22,
        time: 30,

        ingredients: [
            "120 g paneer",
            "Bell pepper",
            "Broccoli",
            "Carrot",
            "Lemon",
            "Herbs"
        ],

        instructions: [
            "Cut paneer and vegetables.",
            "Grill paneer until lightly golden.",
            "Sauté vegetables until tender-crisp.",
            "Combine and finish with lemon and herbs."
        ],

        tags: [
            "high protein",
            "balanced"
        ]
    },


    {
        id: "rajma-rice-bowl",
        name: "Rajma Rice Bowl",
        description:
            "Comforting kidney beans simmered in tomato-spice gravy and served with rice.",
        emoji: "🍛",
        type: "Lunch",
        diet: "vegan",
        cuisine: "Indian",
        calories: 490,
        protein: 18,
        carbs: 78,
        fats: 9,
        time: 35,

        ingredients: [
            "1 cup cooked rajma",
            "1 cup cooked rice",
            "Tomato",
            "Onion",
            "Ginger",
            "Garlic",
            "Spices"
        ],

        instructions: [
            "Prepare a tomato-onion masala.",
            "Add cooked rajma and simmer.",
            "Serve with cooked rice and coriander."
        ],

        tags: [
            "fibre",
            "balanced"
        ]
    },


    {
        id: "chicken-tikka-bowl",
        name: "Chicken Tikka Bowl",
        description:
            "Spiced grilled chicken with vegetables and cooling yogurt.",
        emoji: "🍗",
        type: "Lunch",
        diet: "non-vegetarian",
        cuisine: "Indian",
        calories: 480,
        protein: 42,
        carbs: 32,
        fats: 18,
        time: 30,

        ingredients: [
            "150 g chicken",
            "Yogurt",
            "Bell pepper",
            "Onion",
            "Tikka spices",
            "Lemon"
        ],

        instructions: [
            "Marinate chicken with yogurt and spices.",
            "Grill until fully cooked.",
            "Sauté vegetables.",
            "Assemble and serve with lemon."
        ],

        tags: [
            "high protein",
            "balanced"
        ]
    },


    {
        id: "moong-dal-khichdi",
        name: "Moong Dal Khichdi",
        description:
            "Soft rice and moong dal cooked with vegetables and mild spices.",
        emoji: "🍲",
        type: "Dinner",
        diet: "vegetarian",
        cuisine: "Indian",
        calories: 390,
        protein: 15,
        carbs: 62,
        fats: 8,
        time: 30,

        ingredients: [
            "Rice",
            "Moong dal",
            "Carrot",
            "Peas",
            "Turmeric",
            "Cumin"
        ],

        instructions: [
            "Rinse rice and dal.",
            "Sauté cumin and vegetables.",
            "Add rice, dal, spices and water.",
            "Cook until soft."
        ],

        tags: [
            "comfort food",
            "healthy"
        ]
    },


    {
        id: "tofu-vegetable-stir-fry",
        name: "Tofu Vegetable Stir-Fry",
        description:
            "Crisp tofu tossed with colourful vegetables in a light savoury sauce.",
        emoji: "🥢",
        type: "Dinner",
        diet: "vegan",
        cuisine: "Asian",
        calories: 360,
        protein: 24,
        carbs: 28,
        fats: 16,
        time: 25,

        ingredients: [
            "150 g tofu",
            "Broccoli",
            "Bell pepper",
            "Carrot",
            "Soy sauce",
            "Garlic"
        ],

        instructions: [
            "Press and cube tofu.",
            "Pan-sear tofu until golden.",
            "Stir-fry vegetables with garlic.",
            "Add tofu and sauce and toss."
        ],

        tags: [
            "high protein",
            "quick"
        ]
    },


    {
        id: "masala-egg-bhurji",
        name: "Masala Egg Bhurji",
        description:
            "Soft scrambled eggs cooked with onion, tomato and Indian spices.",
        emoji: "🍳",
        type: "Dinner",
        diet: "eggetarian",
        cuisine: "Indian",
        calories: 330,
        protein: 22,
        carbs: 12,
        fats: 21,
        time: 20,

        ingredients: [
            "3 eggs",
            "Onion",
            "Tomato",
            "Coriander",
            "Turmeric",
            "Cumin"
        ],

        instructions: [
            "Sauté onion, cumin and tomato.",
            "Add beaten eggs.",
            "Stir gently until cooked.",
            "Finish with coriander."
        ],

        tags: [
            "high protein",
            "quick"
        ]
    },


    {
        id: "chickpea-crunch-salad",
        name: "Chickpea Crunch Salad",
        description:
            "Fresh chickpeas, cucumber, tomato and herbs tossed with lemon.",
        emoji: "🥗",
        type: "Snack",
        diet: "vegan",
        cuisine: "Indian",
        calories: 290,
        protein: 13,
        carbs: 43,
        fats: 7,
        time: 15,

        ingredients: [
            "1 cup chickpeas",
            "Cucumber",
            "Tomato",
            "Onion",
            "Coriander",
            "Lemon"
        ],

        instructions: [
            "Combine chickpeas and vegetables.",
            "Add coriander and lemon juice.",
            "Toss well and serve."
        ],

        tags: [
            "fibre",
            "quick"
        ]
    },


    {
        id: "fruit-yogurt-bowl",
        name: "Fruit Yogurt Bowl",
        description:
            "Creamy yogurt topped with seasonal fruit and seeds.",
        emoji: "🍓",
        type: "Snack",
        diet: "vegetarian",
        cuisine: "Indian",
        calories: 240,
        protein: 12,
        carbs: 30,
        fats: 8,
        time: 10,

        ingredients: [
            "1 cup yogurt",
            "Seasonal fruit",
            "1 tbsp seeds"
        ],

        instructions: [
            "Add yogurt to a bowl.",
            "Top with fruit and seeds.",
            "Serve chilled."
        ],

        tags: [
            "quick",
            "healthy"
        ]
    },


    {
        id: "vegetable-lentil-soup",
        name: "Vegetable Lentil Soup",
        description:
            "Warm lentil soup with vegetables and herbs.",
        emoji: "🍵",
        type: "Dinner",
        diet: "vegan",
        cuisine: "Indian",
        calories: 310,
        protein: 16,
        carbs: 42,
        fats: 7,
        time: 30,

        ingredients: [
            "Lentils",
            "Carrot",
            "Tomato",
            "Spinach",
            "Garlic",
            "Herbs"
        ],

        instructions: [
            "Cook lentils until tender.",
            "Sauté vegetables and garlic.",
            "Combine and simmer.",
            "Season and serve hot."
        ],

        tags: [
            "fibre",
            "light"
        ]
    }

];


// ============================================================
// USER SCHEMA
// ============================================================

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: [
                "user",
                "admin"
            ],
            default: "user",
            index: true
        },

        status: {
            type: String,
            enum: [
                "active",
                "suspended"
            ],
            default: "active",
            index: true
        },

        age: {
            type: Number,
            default: null
        },

        gender: {
            type: String,
            default: ""
        },

        height: {
            type: Number,
            default: null
        },

        weight: {
            type: Number,
            default: null
        },

        goal: {
            type: String,
            default: ""
        },

        dietType: {
            type: String,
            default: ""
        },

        diet: {
            type: String,
            default: ""
        },

        mealsPerDay: {
            type: Number,
            default: 3
        },

        cookingTime: {
            type: Number,
            default: 30
        },

        calorieGoal: {
            type: Number,
            default: 2000
        },

        allergies: {
            type: [String],
            default: []
        },

        healthCondition: {
            type: String,
            default: ""
        },

        preferredCuisine: {
            type: String,
            default: "Indian"
        },

        groceries: {
            type: [
                mongoose.Schema.Types.Mixed
            ],
            default: []
        },

        favorites: {
            type: [
                mongoose.Schema.Types.Mixed
            ],
            default: []
        },

        eatenMeals: {
            type: [
                mongoose.Schema.Types.Mixed
            ],
            default: []
        },

        mealPlans: {
            type: [
                mongoose.Schema.Types.Mixed
            ],
            default: []
        },

        settings: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },

    {
        timestamps: true
    }
);

const User =
    mongoose.model(
        "User",
        userSchema
    );


// ============================================================
// ADMIN MEAL SCHEMA
// IMPORTANT: MUST BE BEFORE MEAL GENERATION
// ============================================================

const adminMealSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true
            },

            description: {
                type: String,
                default: ""
            },

            emoji: {
                type: String,
                default: "🍽️"
            },

            type: {
                type: String,
                default: "Meal"
            },

            diet: {
                type: String,
                default: "vegetarian"
            },

            cuisine: {
                type: String,
                default: "Indian"
            },

            calories: {
                type: Number,
                default: 0
            },

            protein: {
                type: Number,
                default: 0
            },

            carbs: {
                type: Number,
                default: 0
            },

            fats: {
                type: Number,
                default: 0
            },

            time: {
                type: Number,
                default: 30
            },

            ingredients: {
                type: [String],
                default: []
            },

            instructions: {
                type: [String],
                default: []
            },

            tags: {
                type: [String],
                default: []
            },

            avoid: {
                type: [String],
                default: []
            }
        },

        {
            timestamps: true
        }
    );

const AdminMeal =
    mongoose.model(
        "AdminMeal",
        adminMealSchema
    );


// ============================================================
// ADMIN RECIPE SCHEMA
// ============================================================

const adminRecipeSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true
            },

            description: {
                type: String,
                default: ""
            },

            emoji: {
                type: String,
                default: "📖"
            },

            type: {
                type: String,
                default: "Recipe"
            },

            diet: {
                type: String,
                default: "vegetarian"
            },

            cuisine: {
                type: String,
                default: "Indian"
            },

            calories: {
                type: Number,
                default: 0
            },

            protein: {
                type: Number,
                default: 0
            },

            carbs: {
                type: Number,
                default: 0
            },

            fats: {
                type: Number,
                default: 0
            },

            time: {
                type: Number,
                default: 30
            },

            ingredients: {
                type: [String],
                default: []
            },

            instructions: {
                type: [String],
                default: []
            }
        },

        {
            timestamps: true
        }
    );

const AdminRecipe =
    mongoose.model(
        "AdminRecipe",
        adminRecipeSchema
    );


// ============================================================
// USER RECIPE SCHEMA
// ============================================================

const userRecipeSchema =
    new mongoose.Schema(
        {
            owner: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true
            },

            name: {
                type: String,
                required: true,
                trim: true
            },

            description: {
                type: String,
                default: ""
            },

            emoji: {
                type: String,
                default: "📖"
            },

            type: {
                type: String,
                default: "Recipe"
            },

            diet: {
                type: String,
                default: "vegetarian"
            },

            cuisine: {
                type: String,
                default: "Indian"
            },

            calories: {
                type: Number,
                default: 0
            },

            protein: {
                type: Number,
                default: 0
            },

            carbs: {
                type: Number,
                default: 0
            },

            fats: {
                type: Number,
                default: 0
            },

            time: {
                type: Number,
                default: 30
            },

            ingredients: {
                type: [String],
                default: []
            },

            instructions: {
                type: [String],
                default: []
            }
        },

        {
            timestamps: true
        }
    );



// ============================================================
// DATABASE
// ============================================================

async function connectDatabase() {

    if (!MONGO_URI) {
        throw new Error(
            "MONGO_URI is missing from backend/.env"
        );
    }

    await mongoose.connect(
        MONGO_URI
    );

    console.log(
        "✅ MongoDB connected successfully"
    );
}


// ============================================================
// BASIC HEALTH CHECK
// ============================================================

app.get(
    "/api",
    (req, res) => {

        res.json({
            success: true,
            message: "MealAI API is running",
            endpoints: [
                "/api/meals/generate",
                "/api/recipes",
                "/api/chat",
                "/api/login",
                "/api/admin/login"
            ]
        });

    }
);


// ============================================================
// REGISTER
// ============================================================

app.post(
    "/api/register",
    async (req, res) => {

        try {

            const {
                name,
                email,
                password
            } = req.body || {};

            if (
                !name ||
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Name, email and password are required"
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const existing =
                await User.findOne({
                    email: normalizedEmail
                });

            if (existing) {
                return res.status(409).json({
                    success: false,
                    message:
                        "An account with this email already exists"
                });
            }

            const user =
                await User.create({
                    name:
                        String(name).trim(),

                    email:
                        normalizedEmail,

                    password:
                        hashPassword(password),

                    role: "user",

                    status: "active"
                });

            return res.status(201).json({
                success: true,
                message:
                    "Registration successful",
                user:
                    publicUser(user)
            });

        } catch (error) {

            console.error(
                "REGISTER ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Registration failed",
                error:
                    error.message
            });
        }
    }
);


// ============================================================
// USER LOGIN
// ADMINS CANNOT LOGIN THROUGH THIS ENDPOINT
// ============================================================

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body || {};

            if (
                !email ||
                !password
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Email and password are required"
                });
            }

            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const user =
                await User.findOne({
                    email:
                        normalizedEmail,

                    role: "user"
                });

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password"
                });
            }

            if (
                user.status ===
                "suspended"
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Your account has been suspended."
                });
            }

            if (
                hashPassword(password) !==
                user.password
            ) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password"
                });
            }

            return res.json({
                success: true,
                message:
                    "Login successful",
                user:
                    publicUser(user)
            });

        } catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Login failed",
                error:
                    error.message
            });
        }
    }
);


// ============================================================
// GET USER
// ============================================================

app.get(
    "/api/users/:id",
    async (req, res) => {

        try {

            const user =
                await User.findById(
                    req.params.id
                ).select("-password");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User not found"
                });
            }

            return res.json({
                success: true,
                user:
                    publicUser(user)
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch user"
            });
        }
    }
);


app.get(
    "/api/profile/:id",
    async (req, res) => {

        try {

            const user =
                await User.findById(
                    req.params.id
                ).select("-password");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message:
                        "User not found"
                });
            }

            return res.json({
                success: true,
                user:
                    publicUser(user)
            });

        } catch (error) {

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch profile"
            });
        }
    }
);


// ============================================================
// UPDATE USER PROFILE
// ============================================================

async function updateUser(
    req,
    res
) {

    try {

        const allowed = [
            "name",
            "age",
            "gender",
            "height",
            "weight",
            "goal",
            "diet",
            "dietType",
            "mealsPerDay",
            "cookingTime",
            "calorieGoal",
            "allergies",
            "healthCondition",
            "preferredCuisine"
        ];

        const updates = {};

        for (
            const field of allowed
        ) {

            if (
                req.body[field] !==
                undefined
            ) {
                updates[field] =
                    req.body[field];
            }
        }

        if (
            updates.diet &&
            !updates.dietType
        ) {
            updates.dietType =
                updates.diet;
        }

        if (
            updates.dietType &&
            !updates.diet
        ) {
            updates.diet =
                updates.dietType;
        }

        if (
            updates.allergies !==
            undefined
        ) {
            updates.allergies =
                normalizeList(
                    updates.allergies
                );
        }

        const user =
            await User.findByIdAndUpdate(
                req.params.id,
                updates,
                {
                    new: true,
                    runValidators: true
                }
            ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    "User not found"
            });
        }

        return res.json({
            success: true,
            message:
                "Profile updated successfully",
            user:
                publicUser(user)
        });

    } catch (error) {

        console.error(
            "UPDATE USER ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to update profile",
            error:
                error.message
        });
    }
}


app.put(
    "/api/users/:id",
    updateUser
);

app.put(
    "/api/profile/:id",
    updateUser
);

// ============================================================
// USER REGISTRATION
// ============================================================

app.post("/api/register", async (req, res) => {
    try {
        const body = req.body || {};

        const name = String(body.name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const existingUser = await User.findOne({
            email
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        const user = await User.create({
            name,
            email,
            password: hashPassword(password),
            role: "user",
            status: "active"
        });

        return res.status(201).json({
            success: true,
            message: "Registration successful",
            user: {
                id: String(user._id),
                _id: String(user._id),
                name: user.name,
                email: user.email,
                role: "user",
                status: user.status
            }
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Registration failed",
            error: error.message
        });
    }
});


// ============================================================
// USER LOGIN
// USERS AND ADMINS ARE COMPLETELY SEPARATE
// ============================================================

app.post("/api/login", async (req, res) => {
    try {
        const email = String(
            req.body?.email || ""
        ).trim().toLowerCase();

        const password = String(
            req.body?.password || ""
        );

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const user = await User.findOne({
            email,
            role: "user"
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (user.status === "suspended") {
            return res.status(403).json({
                success: false,
                message: "Your account has been suspended"
            });
        }

        const passwordHash = hashPassword(password);

        if (user.password !== passwordHash) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        return res.json({
            success: true,
            message: "Login successful",
            user: {
                id: String(user._id),
                _id: String(user._id),
                name: user.name,
                email: user.email,
                role: "user",
                status: user.status,
                age: user.age,
                gender: user.gender,
                height: user.height,
                weight: user.weight,
                goal: user.goal,
                dietType: user.dietType,
                diet: user.diet,
                mealsPerDay: user.mealsPerDay,
                cookingTime: user.cookingTime,
                calorieGoal: user.calorieGoal,
                allergies: user.allergies || [],
                healthCondition: user.healthCondition,
                preferredCuisine: user.preferredCuisine,
                groceries: user.groceries || [],
                favorites: user.favorites || [],
                eatenMeals: user.eatenMeals || [],
                mealPlans: user.mealPlans || [],
                settings: user.settings || {}
            }
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed",
            error: error.message
        });
    }
});


// ============================================================
// GET USER
// ============================================================

app.get("/api/users/:id", async (req, res) => {
    try {
        const user = await User.findById(
            req.params.id
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error("GET USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch user"
        });
    }
});


// ============================================================
// PROFILE
// ============================================================

app.get("/api/profile/:id", async (req, res) => {
    try {
        const user = await User.findById(
            req.params.id
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error("PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch profile"
        });
    }
});


// ============================================================
// UPDATE USER PROFILE
// ============================================================

async function updateUser(req, res) {
    try {
       const allowedFields = [
    "name",
    "age",
    "gender",
    "height",
    "weight",
    "goal",
    "diet",
    "dietType",
    "mealsPerDay",
    "cookingTime",
    "calorieGoal",
    "allergies",
    "healthCondition",
    "preferredCuisine",
    "mealPlans",
    "settings"

        ];

        const update = {};

        for (const field of allowedFields) {
            if (
                Object.prototype.hasOwnProperty.call(
                    req.body || {},
                    field
                )
            ) {
                update[field] = req.body[field];
            }
        }

        if (update.name !== undefined) {
            update.name = String(update.name).trim();
        }

        if (update.age !== undefined) {
            update.age = number(update.age, null);
        }

        if (update.height !== undefined) {
            update.height = number(update.height, null);
        }

        if (update.weight !== undefined) {
            update.weight = number(update.weight, null);
        }

        if (update.mealsPerDay !== undefined) {
            update.mealsPerDay = Math.max(
                1,
                Math.min(
                    8,
                    number(update.mealsPerDay, 3)
                )
            );
        }

        if (update.cookingTime !== undefined) {
            update.cookingTime = Math.max(
                5,
                number(update.cookingTime, 30)
            );
        }

        if (update.calorieGoal !== undefined) {
            update.calorieGoal = Math.max(
                500,
                number(update.calorieGoal, 2000)
            );
        }

        if (update.allergies !== undefined) {
            update.allergies =
                normalizeList(update.allergies);
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            update,
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            message: "Profile updated successfully",
            user
        });

    } catch (error) {
        console.error("UPDATE USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update profile",
            error: error.message
        });
    }
}

app.put("/api/users/:id", updateUser);
app.patch("/api/users/:id", updateUser);
app.put("/api/profile/:id", updateUser);
app.patch("/api/profile/:id", updateUser);


// ============================================================
// PUBLIC MEALS
// ============================================================

app.get("/api/meals", async (req, res) => {
    try {
        const customMeals = await AdminMeal
            .find()
            .sort({ createdAt: -1 })
            .lean();

        const meals = [
            ...customMeals.map(meal => ({
                ...meal,
                id: String(meal._id)
            })),
            ...MEALS
        ];

        return res.json({
            success: true,
            count: meals.length,
            meals
        });

    } catch (error) {
        console.error("GET MEALS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load meals"
        });
    }
});


// ============================================================
// PUBLIC RECIPES
// THIS FIXES /api/recipes NOT FOUND
// ============================================================

    app.get("/api/recipes", async (req, res) => {
    try {
        const customRecipes = await AdminRecipe
            .find()
            .sort({ createdAt: -1 })
            .lean();

        const builtInRecipes = MEALS.map(meal => ({
            id: slug(meal.name),
            name: meal.name,
            description: meal.description || "",
            emoji: meal.emoji || "🍽️",
            type: meal.type || "Meal",
            diet: meal.diet || "",
            cuisine: meal.cuisine || "Indian",
            calories: Number(meal.calories) || 0,
            protein: Number(meal.protein) || 0,
            carbs: Number(meal.carbs) || 0,
            fats: Number(meal.fats) || 0,
            time: Number(meal.time) || 30,
            ingredients: Array.isArray(meal.ingredients)
                ? meal.ingredients
                : [],
            instructions: Array.isArray(meal.instructions)
                ? meal.instructions
                : []
        }));

        const adminRecipes = customRecipes.map(recipe => ({
            ...recipe,
            id: String(recipe._id),
            _id: String(recipe._id)
        }));

        const recipes = [
            ...adminRecipes,
            ...builtInRecipes
        ];

        return res.json({
            success: true,
            count: recipes.length,
            recipes
        });

    } catch (error) {
        console.error("GET RECIPES ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load recipes",
            recipes: []
        });
    }
});

// ============================================================
// GET SINGLE PUBLIC RECIPE
// ============================================================

app.get("/api/recipes/:id", async (req, res) => {
    try {
        const id = String(req.params.id);

        let recipe = null;

        if (mongoose.Types.ObjectId.isValid(id)) {
            recipe = await AdminRecipe
                .findById(id)
                .lean();
        }

        if (!recipe) {
            const publicRecipes = await AdminRecipe
                .find()
                .lean();

            recipe = publicRecipes.find(
                item =>
                    slug(item.name) === id
            );
        }

        if (!recipe) {
            return res.status(404).json({
                success: false,
                message: "Recipe not found"
            });
        }

        return res.json({
            success: true,
            recipe: {
                ...recipe,
                id: String(recipe._id),
                _id: String(recipe._id)
            }
        });

    } catch (error) {
        console.error("GET RECIPE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load recipe"
        });
    }
});


// ============================================================
// AI MEAL GENERATOR
// ============================================================

async function generateMeals(req, res) {
    try {
        const {
            goal = "",
            diet = "",
            dietType = "",
            allergies = "",
            healthCondition = "",
            mealCount = 3,
            mealsPerDay = 3,
            cookingTime = 30,
            cuisine = "Indian"
        } = req.body || {};

        const requestedDiet = cleanText(
            diet || dietType
        );

       const count = Math.max(
    1,
    Math.min(
        6,
        Math.round(
            number(
                mealCount || mealsPerDay,
                3
            )
        )
    )
);

        const maxCookingTime = Math.max(
            5,
            number(cookingTime, 30)
        );

        const allergyList =
            normalizeList(allergies);

        // --------------------------------------------------------
        // GET ADMIN CREATED MEALS
        // IMPORTANT: AdminMeal is defined before this function.
        // --------------------------------------------------------

        const customMeals = await AdminMeal
            .find()
            .sort({ createdAt: -1 })
            .lean();

        // --------------------------------------------------------
        // COMBINE ADMIN + BUILT-IN MEALS
        // --------------------------------------------------------

        const allMeals = [
            ...customMeals.map(meal => ({
                ...meal,
                id: String(meal._id)
            })),
            ...MEALS
        ];

        // --------------------------------------------------------
        // FILTER
        // --------------------------------------------------------

        let candidates = allMeals.filter(meal => {

            if (
                !matchesDiet(
                    meal,
                    requestedDiet
                )
            ) {
                return false;
            }

            if (
                number(meal.time, 30) >
                maxCookingTime
            ) {
                return false;
            }

            if (
                !matchesAllergies(
                    meal,
                    allergyList
                )
            ) {
                return false;
            }

            if (
                !matchesHealthCondition(
                    meal,
                    healthCondition
                )
            ) {
                return false;
            }

            return true;
        });

        // --------------------------------------------------------
        // FALLBACK
        // If strict filtering returns nothing, do not show an
        // endpoint error. Use built-in meals that still satisfy
        // the basic diet requirement.
        // --------------------------------------------------------

        if (!candidates.length) {
            candidates = MEALS.filter(meal =>
                matchesDiet(
                    meal,
                    requestedDiet
                )
            );
        }

        if (!candidates.length) {
            candidates = MEALS.slice();
        }

        // --------------------------------------------------------
        // SCORE
        // --------------------------------------------------------

        const g = cleanText(goal);

        const scored = candidates
            .map(meal => {

                let score = 0;

                if (
                    g.includes("muscle") ||
                    g.includes("protein") ||
                    g.includes("gain")
                ) {
                    score +=
                        number(meal.protein) * 2;

                    if (
                        Array.isArray(meal.tags) &&
                        meal.tags.some(tag =>
                            cleanText(tag)
                                .includes("high protein")
                        )
                    ) {
                        score += 25;
                    }
                }

                if (
                    g.includes("weight") ||
                    g.includes("lose") ||
                    g.includes("fat")
                ) {
                    if (
                        Array.isArray(meal.tags) &&
                        meal.tags.some(tag =>
                            cleanText(tag)
                                .includes("weight loss")
                        )
                    ) {
                        score += 25;
                    }

                    score -=
                        number(meal.calories) / 50;
                }

                if (
                    g.includes("healthy") ||
                    g.includes("maintain")
                ) {
                    score += 10;
                }

                if (
                    cuisine &&
                    cleanText(meal.cuisine) ===
                    cleanText(cuisine)
                ) {
                    score += 8;
                }

                return {
                    meal,
                    score
                };
            })
            .sort(
                (a, b) =>
                    b.score - a.score
            );

        // --------------------------------------------------------
        // SELECT DIFFERENT MEAL TYPES
        // --------------------------------------------------------

        const selected = [];
        const usedTypes = new Set();

        for (const item of scored) {
            if (selected.length >= count) {
                break;
            }

            const type =
                String(
                    item.meal.type || "Meal"
                ).toLowerCase();

            if (!usedTypes.has(type)) {
                selected.push(item.meal);
                usedTypes.add(type);
            }
        }

        // --------------------------------------------------------
        // FILL REMAINING SLOTS
        // --------------------------------------------------------

        for (const item of scored) {
            if (selected.length >= count) {
                break;
            }

            const alreadySelected =
                selected.some(
                    meal =>
                        String(
                            meal.id ||
                            meal._id
                        ) ===
                        String(
                            item.meal.id ||
                            item.meal._id
                        )
                );

            if (!alreadySelected) {
                selected.push(item.meal);
            }
        }

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        const meals = selected.map(meal => ({
            id:
                meal.id ||
                slug(meal.name),

            _id:
                meal._id
                    ? String(meal._id)
                    : undefined,

            name:
                meal.name,

            description:
                meal.description ||
                `${meal.name} selected for your ${
                    goal || "healthy"
                } goal.`,

            emoji:
                meal.emoji ||
                "🍽️",

            type:
                meal.type ||
                "Meal",

            diet:
                meal.diet ||
                "vegetarian",

            cuisine:
                meal.cuisine ||
                "Indian",

            calories:
                number(meal.calories),

            protein:
                number(meal.protein),

            carbs:
                number(meal.carbs),

            fats:
                number(meal.fats),

            time:
                number(meal.time, 30),

            ingredients:
                Array.isArray(meal.ingredients)
                    ? meal.ingredients
                    : normalizeList(
                        meal.ingredients
                    ),

            instructions:
                Array.isArray(meal.instructions)
                    ? meal.instructions
                    : normalizeList(
                        meal.instructions
                    ),

            tags:
                Array.isArray(meal.tags)
                    ? meal.tags
                    : [],

            goal,

            allergies:
                allergyList,

            healthCondition
        }));

        return res.json({
            success: true,
            count: meals.length,
            requestedCount: count,
            meals
        });

    } catch (error) {
        console.error(
            "MEAL GENERATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to generate meal plan",
            error:
                error.message
        });
    }
}

// ============================================================
// FRONTEND MEAL PLANNER ROUTE
// ============================================================

app.post(
    "/api/meals/plan",
    generateMeals
);


app.post(
    "/api/meals/generate",
    generateMeals
);

app.post(
    "/api/ai/generate",
    generateMeals
);

app.post(
    "/api/ai/generate-meal",
    generateMeals
);

app.post(
    "/api/ai/generate-meals",
    generateMeals
);

app.post(
    "/api/generate-meals",
    generateMeals
);


// ============================================================
// USER FAVORITES
// ============================================================

app.get(
    "/api/favorites/:id",
    async (req, res) => {
        try {
            const user =
                await User.findById(
                    req.params.id
                ).select("favorites");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.json({
                success: true,
                favorites:
                    user.favorites || []
            });

        } catch (error) {
            console.error(
                "GET FAVORITES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch favorites"
            });
        }
    }
);


app.put(
    "/api/favorites/:id",
    async (req, res) => {
        try {
            const favorites =
                Array.isArray(
                    req.body?.favorites
                )
                    ? req.body.favorites
                    : [];

            const user =
                await User.findByIdAndUpdate(
                    req.params.id,
                    {
                        favorites
                    },
                    {
                        new: true
                    }
                ).select("favorites");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.json({
                success: true,
                message:
                    "Favorites saved successfully",
                favorites:
                    user.favorites || []
            });

        } catch (error) {
            console.error(
                "SAVE FAVORITES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to save favorites"
            });
        }
    }
);


app.post(
    "/api/favorites/:id",
    async (req, res) => {
        try {
            const meal = req.body?.meal;

            if (!meal) {
                return res.status(400).json({
                    success: false,
                    message: "Meal is required"
                });
            }

            const user =
                await User.findById(
                    req.params.id
                );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            if (!Array.isArray(user.favorites)) {
                user.favorites = [];
            }

            const mealId = String(
                meal.id ||
                meal._id ||
                slug(meal.name)
            );

            const exists =
                user.favorites.some(
                    item =>
                        String(
                            item.id ||
                            item._id ||
                            slug(item.name)
                        ) === mealId
                );

            if (!exists) {
                user.favorites.push({
                    ...meal,
                    id: mealId
                });
            }

            await user.save();

            return res.json({
                success: true,
                message: "Meal saved to favorites",
                favorites:
                    user.favorites
            });

        } catch (error) {
            console.error(
                "ADD FAVORITE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to save favorite"
            });
        }
    }
);


app.delete(
    "/api/favorites/:id/:mealId",
    async (req, res) => {
        try {
            const user =
                await User.findById(
                    req.params.id
                );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const mealId =
                String(req.params.mealId);

            user.favorites =
                (user.favorites || []).filter(
                    meal =>
                        String(
                            meal.id ||
                            meal._id ||
                            slug(meal.name)
                        ) !== mealId
                );

            await user.save();

            return res.json({
                success: true,
                message:
                    "Favorite removed",
                favorites:
                    user.favorites
            });

        } catch (error) {
            console.error(
                "DELETE FAVORITE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to remove favorite"
            });
        }
    }
);


// ============================================================
// GROCERIES
// ============================================================

app.get(
    "/api/groceries/:id",
    async (req, res) => {
        try {
            const user =
                await User.findById(
                    req.params.id
                ).select("groceries");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.json({
                success: true,
                groceries:
                    user.groceries || []
            });

        } catch (error) {
            console.error(
                "GET GROCERIES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to fetch groceries"
            });
        }
    }
);


app.put(
    "/api/groceries/:id",
    async (req, res) => {
        try {
            const groceries =
                Array.isArray(
                    req.body?.groceries
                )
                    ? req.body.groceries
                    : [];

            const user =
                await User.findByIdAndUpdate(
                    req.params.id,
                    {
                        groceries
                    },
                    {
                        new: true
                    }
                ).select("groceries");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.json({
                success: true,
                groceries:
                    user.groceries || []
            });

        } catch (error) {
            console.error(
                "SAVE GROCERIES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to save groceries"
            });
        }
    }
);


// ============================================================
// USER RECIPES
// ============================================================

const UserRecipe =
    mongoose.models.UserRecipe ||
    mongoose.model(
        "UserRecipe",
        new mongoose.Schema(
            {
                owner: {
                    type:
                        mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                    index: true
                },

                name: {
                    type: String,
                    required: true,
                    trim: true
                },

                description: {
                    type: String,
                    default: "",
                    trim: true
                },

                emoji: {
                    type: String,
                    default: "📖"
                },

                type: {
                    type: String,
                    default: "Recipe",
                    trim: true
                },

                diet: {
                    type: String,
                    default: "vegetarian",
                    trim: true
                },

                cuisine: {
                    type: String,
                    default: "Indian",
                    trim: true
                },

                calories: {
                    type: Number,
                    default: 0
                },

                protein: {
                    type: Number,
                    default: 0
                },

                carbs: {
                    type: Number,
                    default: 0
                },

                fats: {
                    type: Number,
                    default: 0
                },

                time: {
                    type: Number,
                    default: 30
                },

                ingredients: {
                    type: [String],
                    default: []
                },

                instructions: {
                    type: [String],
                    default: []
                }
            },
            {
                timestamps: true
            }
        )
    );


function userRecipePayload(body) {
    const b = body || {};

    return {
        name:
            String(b.name || "").trim(),

        description:
            String(
                b.description || ""
            ).trim(),

        emoji:
            String(
                b.emoji || "📖"
            ),

        type:
            String(
                b.type || "Recipe"
            ).trim(),

        diet:
            String(
                b.diet || "vegetarian"
            )
                .trim()
                .toLowerCase(),

        cuisine:
            String(
                b.cuisine || "Indian"
            ).trim(),

        calories:
            number(b.calories),

        protein:
            number(b.protein),

        carbs:
            number(b.carbs),

        fats:
            number(b.fats),

        time:
            Math.max(
                1,
                number(
                    b.time,
                    30
                )
            ),

        ingredients:
            normalizeList(
                b.ingredients
            ),

        instructions:
            normalizeList(
                b.instructions
            )
    };
}


app.get(
    "/api/user-recipes/:userId",
    async (req, res) => {
        try {
            const user =
                await User.findById(
                    req.params.userId
                ).select("_id");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const recipes =
                await UserRecipe
                    .find({
                        owner: user._id
                    })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            const formatted =
                recipes.map(recipe => ({
                    ...recipe,
                    id: String(
                        recipe._id
                    ),
                    _id: String(
                        recipe._id
                    ),
                    owner:
                        String(
                            recipe.owner
                        )
                }));

            return res.json({
                success: true,
                count:
                    formatted.length,
                recipes:
                    formatted
            });

        } catch (error) {
            console.error(
                "GET USER RECIPES ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load your recipes",
                recipes: []
            });
        }
    }
);


app.post(
    "/api/user-recipes/:userId",
    async (req, res) => {
        try {
            const user =
                await User.findById(
                    req.params.userId
                ).select("_id");

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const payload =
                userRecipePayload(
                    req.body
                );

            if (!payload.name) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Recipe name is required"
                });
            }

            const recipe =
                await UserRecipe.create({
                    owner:
                        user._id,
                    ...payload
                });

            return res.status(201).json({
                success: true,
                message:
                    "Recipe added successfully",
                recipe: {
                    ...recipe.toObject(),
                    id: String(
                        recipe._id
                    ),
                    _id: String(
                        recipe._id
                    )
                }
            });

        } catch (error) {
            console.error(
                "ADD USER RECIPE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to add recipe",
                error:
                    error.message
            });
        }
    }
);


app.put(
    "/api/user-recipes/:userId/:recipeId",
    async (req, res) => {
        try {
            const payload =
                userRecipePayload(
                    req.body
                );

            if (!payload.name) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Recipe name is required"
                });
            }

            const recipe =
                await UserRecipe.findOneAndUpdate(
                    {
                        _id:
                            req.params.recipeId,
                        owner:
                            req.params.userId
                    },
                    payload,
                    {
                        new: true,
                        runValidators: true
                    }
                ).lean();

            if (!recipe) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Recipe not found"
                });
            }

            return res.json({
                success: true,
                message:
                    "Recipe updated successfully",
                recipe: {
                    ...recipe,
                    id: String(
                        recipe._id
                    ),
                    _id: String(
                        recipe._id
                    )
                }
            });

        } catch (error) {
            console.error(
                "UPDATE USER RECIPE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to update recipe"
            });
        }
    }
);


app.delete(
    "/api/user-recipes/:userId/:recipeId",
    async (req, res) => {
        try {
            const recipe =
                await UserRecipe.findOneAndDelete({
                    _id:
                        req.params.recipeId,
                    owner:
                        req.params.userId
                });

            if (!recipe) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Recipe not found"
                });
            }

            return res.json({
                success: true,
                message:
                    "Recipe deleted successfully"
            });

        } catch (error) {
            console.error(
                "DELETE USER RECIPE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to delete recipe"
            });
        }
    }
);

// ------------------------------------------------------------
// MEAL PLANNER
// Frontend calls: POST /api/meals/plan
// ------------------------------------------------------------

app.post("/api/meals/plan", generateMeals);


// ------------------------------------------------------------
// EATEN MEALS / CALENDAR
// ------------------------------------------------------------

// Get all eaten meals for a user
app.get("/api/meals/eaten/:id", async (req, res) => {
    try {
        const user = await User.findById(
            req.params.id
        ).select("eatenMeals");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            eatenMeals: user.eatenMeals || []
        });

    } catch (error) {
        console.error(
            "GET EATEN MEALS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to fetch eaten meals"
        });
    }
});


// Mark a meal as eaten
app.post("/api/meals/eaten/:id", async (req, res) => {
    try {
        const user = await User.findById(
            req.params.id
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const meal = req.body?.meal;
        const date = String(
            req.body?.date || ""
        ).trim();

        if (!meal || !date) {
            return res.status(400).json({
                success: false,
                message: "Date and meal are required"
            });
        }

        if (!Array.isArray(user.eatenMeals)) {
            user.eatenMeals = [];
        }

        const mealId = String(
            meal.id ||
            meal._id ||
            slug(meal.name)
        );

        const alreadyEaten =
            user.eatenMeals.some(entry => {
                const entryMealId = String(
                    entry.mealId ||
                    entry.meal?.id ||
                    entry.id ||
                    ""
                );

                return (
                    String(entry.date || "") === date &&
                    entryMealId === mealId
                );
            });

        if (!alreadyEaten) {
            user.eatenMeals.push({
                date: date,
                mealId: mealId,
                meal: {
                    ...meal,
                    id: mealId
                }
            });
        }

        await user.save();

        return res.json({
            success: true,
            message: "Meal marked as eaten",
            eatenMeals: user.eatenMeals
        });

    } catch (error) {
        console.error(
            "MARK EATEN ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to mark meal as eaten"
        });
    }
});


// Unmark a meal as eaten
app.delete("/api/eaten/:mealId", async (req, res) => {
    try {
        const userId = String(
            req.query?.userId || ""
        ).trim();

        const date = String(
            req.query?.date || ""
        ).trim();

        if (!userId || !date) {
            return res.status(400).json({
                success: false,
                message: "userId and date are required"
            });
        }

        const user = await User.findById(
            userId
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const mealId = String(
            req.params.mealId
        );

        user.eatenMeals =
            (user.eatenMeals || []).filter(
                entry => {
                    const entryMealId = String(
                        entry.mealId ||
                        entry.meal?.id ||
                        entry.id ||
                        ""
                    );

                    return !(
                        String(entry.date || "") === date &&
                        entryMealId === mealId
                    );
                }
            );

        await user.save();

        return res.json({
            success: true,
            message: "Meal unmarked",
            eatenMeals: user.eatenMeals
        });

    } catch (error) {
        console.error(
            "UNMARK EATEN ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to update meal status"
        });
    }
});


// ------------------------------------------------------------
// FAVORITES
// Frontend uses POST /api/favorites
// ------------------------------------------------------------

app.post("/api/favorites", async (req, res) => {
    try {
        const userId = String(
            req.body?.userId || ""
        ).trim();

        const meal = req.body?.meal;

        if (!userId || !meal) {
            return res.status(400).json({
                success: false,
                message: "userId and meal are required"
            });
        }

        const user = await User.findById(
            userId
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (!Array.isArray(user.favorites)) {
            user.favorites = [];
        }

        const mealId = String(
            meal.id ||
            meal._id ||
            slug(meal.name)
        );

        const exists =
            user.favorites.some(item => {
                return String(
                    item.id ||
                    item._id ||
                    slug(item.name)
                ) === mealId;
            });

        if (!exists) {
            user.favorites.push({
                ...meal,
                id: mealId
            });
        }

        await user.save();

        return res.json({
            success: true,
            message: "Meal saved to favorites",
            favorites: user.favorites
        });

    } catch (error) {
        console.error(
            "ADD FAVORITE ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to save favorite"
        });
    }
});


// Frontend uses:
// DELETE /api/favorites/:mealId?userId=...
app.delete(
    "/api/favorites/:mealId",
    async (req, res) => {
        try {
            const userId = String(
                req.query?.userId || ""
            ).trim();

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: "userId is required"
                });
            }

            const user = await User.findById(
                userId
            );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            const mealId = String(
                req.params.mealId
            );

            user.favorites =
                (user.favorites || []).filter(
                    item => {
                        const id = String(
                            item.id ||
                            item._id ||
                            slug(item.name)
                        );

                        return id !== mealId;
                    }
                );

            await user.save();

            return res.json({
                success: true,
                message: "Favorite removed",
                favorites: user.favorites
            });

        } catch (error) {
            console.error(
                "DELETE FAVORITE ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to remove favorite"
            });
        }
    }
);


// ------------------------------------------------------------
// AI ASSISTANT
// Frontend calls: POST /api/assistant
// ------------------------------------------------------------

app.post("/api/assistant", async (req, res) => {
    try {
        const message = String(
            req.body?.message || ""
        ).trim();

        const profile =
            req.body?.profile || {};

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Message is required"
            });
        }

        const diet = String(
            profile.dietType ||
            "Vegetarian"
        );

        const goal = String(
            profile.goal ||
            "Healthy Lifestyle"
        );

        const allergies =
            normalizeList(
                profile.allergies
            );

        const healthCondition =
            String(
                profile.healthCondition ||
                ""
            ).trim();

        const lower =
            message.toLowerCase();

        let reply = "";

        // Breakfast
        if (lower.includes("breakfast")) {

            const breakfast =
                MEALS.filter(meal => {

                    return (
                        String(
                            meal.type || ""
                        )
                            .toLowerCase()
                            .includes("breakfast") &&

                        matchesDiet(
                            meal,
                            cleanText(diet)
                        ) &&

                        matchesAllergies(
                            meal,
                            allergies
                        )
                    );

                }).slice(0, 3);

            if (breakfast.length) {
                reply =
                    `For breakfast, try ` +
                    breakfast
                        .map(meal => meal.name)
                        .join(", ") +
                    `. These fit your ${diet} preference.`;
            } else {
                reply =
                    "For breakfast, choose a balanced meal with protein, whole grains, fruit or vegetables.";
            }

        }

        // Lunch
        else if (lower.includes("lunch")) {

            const lunch =
                MEALS.filter(meal => {

                    return (
                        String(
                            meal.type || ""
                        )
                            .toLowerCase()
                            .includes("lunch") &&

                        matchesDiet(
                            meal,
                            cleanText(diet)
                        ) &&

                        matchesAllergies(
                            meal,
                            allergies
                        )
                    );

                }).slice(0, 3);

            if (lunch.length) {
                reply =
                    "For lunch, consider " +
                    lunch
                        .map(meal => meal.name)
                        .join(", ") +
                    ".";
            } else {
                reply =
                    "For lunch, aim for vegetables, a protein source and a moderate portion of whole grains.";
            }

        }

        // Dinner
        else if (lower.includes("dinner")) {

            const dinner =
                MEALS.filter(meal => {

                    return (
                        String(
                            meal.type || ""
                        )
                            .toLowerCase()
                            .includes("dinner") &&

                        matchesDiet(
                            meal,
                            cleanText(diet)
                        ) &&

                        matchesAllergies(
                            meal,
                            allergies
                        )
                    );

                }).slice(0, 3);

            if (dinner.length) {
                reply =
                    "For dinner, consider " +
                    dinner
                        .map(meal => meal.name)
                        .join(", ") +
                    ".";
            } else {
                reply =
                    "For dinner, keep the portion balanced and include vegetables plus a suitable protein source.";
            }

        }

        // Protein
        else if (
            lower.includes("protein") ||
            lower.includes("muscle")
        ) {

            reply =
                `For your ${goal.toLowerCase()} goal, prioritize protein-rich foods such as lentils, beans, paneer, tofu, yogurt or eggs that fit your diet.`;

            if (allergies.length) {
                reply +=
                    ` Remember your allergies: ${allergies.join(", ")}.`;
            }

        }

        // Weight / calories
        else if (
            lower.includes("weight") ||
            lower.includes("calorie")
        ) {

            const calorieGoal =
                Number(
                    profile.calorieGoal
                ) || 2000;

            reply =
                `For your ${goal.toLowerCase()} goal, focus on nutrient-dense foods, vegetables, adequate protein and sensible portions. Your current calorie target is about ${calorieGoal} kcal per day.`;

        }

        // Grocery
        else if (
            lower.includes("grocery") ||
            lower.includes("shopping")
        ) {

            reply =
                "Open Grocery List from the MealAI sidebar to manage your groceries. You can add, check and delete items there.";

        }

        // Recipe / meal
        else if (
            lower.includes("recipe") ||
            lower.includes("meal")
        ) {

            reply =
                `I can help with meals for your ${diet} preference and ${goal.toLowerCase()} goal. Ask me for breakfast, lunch, dinner, protein-rich meals or recipe ideas.`;

        }

        // Default
        else {

            reply =
                `I can help you with meal ideas, nutrition, recipes and groceries. Your current goal is ${goal} and your diet preference is ${diet}. What would you like to plan?`;

            if (healthCondition) {
                reply +=
                    ` I will also keep your health condition (${healthCondition}) in mind.`;
            }
        }

        return res.json({
            success: true,
            reply
        });

    } catch (error) {

        console.error(
            "ASSISTANT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to process assistant request"
        });
    }
});


// Optional compatibility alias
app.post(
    "/api/chat",
    async (req, res) => {

        req.body = {
            ...req.body,
            message:
                req.body?.message ||
                req.body?.prompt ||
                ""
        };

        return app._router.handle(
            req,
            res,
            () => {}
        );
    }
);
// ============================================================
// ADMIN TOKEN AUTHENTICATION
// ============================================================

const ADMIN_EMAIL = String(
    process.env.ADMIN_EMAIL || "admin@example.com"
).trim().toLowerCase();

const ADMIN_PASSWORD = String(
    process.env.ADMIN_PASSWORD || ""
);

const ADMIN_TOKEN_SECRET = String(
    process.env.ADMIN_TOKEN_SECRET ||
    "MealAI_Admin_Secret_2026"
);

function createAdminToken() {
    const payload = JSON.stringify({
        type: "admin",
        email: ADMIN_EMAIL,
        issuedAt: Date.now()
    });

    const encoded = Buffer
        .from(payload)
        .toString("base64url");

    const signature = crypto
        .createHmac("sha256", ADMIN_TOKEN_SECRET)
        .update(encoded)
        .digest("base64url");

    return `${encoded}.${signature}`;
}

function verifyAdminToken(token) {
    try {
        if (!token) return false;

        const parts = token.split(".");

        if (parts.length !== 2) {
            return false;
        }

        const [encoded, signature] = parts;

        const expectedSignature = crypto
            .createHmac("sha256", ADMIN_TOKEN_SECRET)
            .update(encoded)
            .digest("base64url");

        if (signature !== expectedSignature) {
            return false;
        }

        const payload = JSON.parse(
            Buffer
                .from(encoded, "base64url")
                .toString("utf8")
        );

        return (
            payload.type === "admin" &&
            payload.email === ADMIN_EMAIL
        );

    } catch (error) {
        return false;
    }
}

function requireAdmin(req, res, next) {

    const authHeader =
        req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Admin authentication required"
        });
    }

    const token = authHeader.substring(7);

    if (!verifyAdminToken(token)) {
        return res.status(401).json({
            success: false,
            message: "Invalid admin token"
        });
    }

    req.admin = {
        email: ADMIN_EMAIL,
        role: "admin"
    };

    next();
}
// ============================================================
// ADMIN LOGIN
// USERS AND ADMINS ARE COMPLETELY SEPARATE
// ============================================================

app.post("/api/admin/login", async (req, res) => {
    try {
        const email = String(
            req.body?.email || ""
        ).trim().toLowerCase();

        const password = String(
            req.body?.password || ""
        );

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Admin email and password are required"
            });
        }

        const adminEmail = String(
            process.env.ADMIN_EMAIL || ""
        ).trim().toLowerCase();

        const adminPassword = String(
            process.env.ADMIN_PASSWORD || ""
        );

        if (!adminEmail || !adminPassword) {
            return res.status(500).json({
                success: false,
                message: "Admin credentials are not configured"
            });
        }

        if (
            email !== adminEmail ||
            password !== adminPassword
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin email or password"
            });
        }

        return res.json({
            success: true,
            message: "Admin login successful",

            admin: {
                email: adminEmail,
                role: "admin"
            },

            token: crypto
                .createHash("sha256")
                .update(
                    adminEmail +
                    ":" +
                    process.env.ADMIN_TOKEN_SECRET
                )
                .digest("hex")
        });

    } catch (error) {
        console.error(
            "ADMIN LOGIN ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Admin login failed"
        });
    }
});
// ============================================================
// ADMIN AUTH MIDDLEWARE
// MUST MATCH THE TOKEN CREATED IN /api/admin/login
// ============================================================

function requireAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization || "";

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Admin authentication required"
            });
        }

        const token = authHeader.substring(7);

        const adminEmail = String(
            process.env.ADMIN_EMAIL || ""
        ).trim().toLowerCase();

        const secret = String(
            process.env.ADMIN_TOKEN_SECRET || ""
        );

        if (!adminEmail || !secret) {
            return res.status(500).json({
                success: false,
                message: "Admin token configuration missing"
            });
        }

        // Generate the EXACT same token used during admin login
        const expectedToken = crypto
            .createHash("sha256")
            .update(
                adminEmail +
                ":" +
                secret
            )
            .digest("hex");

        if (token !== expectedToken) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin token"
            });
        }

        req.admin = {
            email: adminEmail,
            role: "admin"
        };

        next();

    } catch (error) {
        console.error("ADMIN AUTH ERROR:", error);

        return res.status(401).json({
            success: false,
            message: "Invalid admin token"
        });
    }
}
// ============================================================
// ADMIN STATS
// ============================================================

app.get(
    "/api/admin/stats",
    requireAdmin,
    async (req, res) => {
        try {
            const [
                totalUsers,
                activeUsers,
                suspendedUsers,
                customMeals,
                customRecipes
            ] = await Promise.all([
                User.countDocuments({
                    role: {
                        $ne: "admin"
                    }
                }),

                User.countDocuments({
                    role: {
                        $ne: "admin"
                    },
                    status: "active"
                }),

                User.countDocuments({
                    role: {
                        $ne: "admin"
                    },
                    status: "suspended"
                }),

                AdminMeal.countDocuments(),

                AdminRecipe.countDocuments()
            ]);

            const users = await User.find({
                role: {
                    $ne: "admin"
                }
            }).select("favorites eatenMeals");

            let totalFavorites = 0;
            let totalEatenMeals = 0;

            users.forEach((user) => {
                if (Array.isArray(user.favorites)) {
                    totalFavorites += user.favorites.length;
                }

                if (Array.isArray(user.eatenMeals)) {
                    totalEatenMeals += user.eatenMeals.length;
                }
            });

            res.json({
                success: true,
                stats: {
                    totalUsers,
                    activeUsers,
                    suspendedUsers,
                    totalFavorites,
                    totalEatenMeals,
                    customMeals,
                    customRecipes
                }
            });

        } catch (error) {
            console.error("ADMIN STATS ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Unable to load admin statistics"
            });
        }
    }
);
// ============================================================
// FRONTEND
// ============================================================

const FRONTEND_DIR = path.resolve(__dirname, "..");

app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(FRONTEND_DIR, "index.html")
    );
});

app.get("/login.html", (req, res) => {
    res.sendFile(
        path.join(FRONTEND_DIR, "login.html")
    );
});

app.get("/admin-login.html", (req, res) => {
    res.sendFile(
        path.join(FRONTEND_DIR, "admin-login.html")
    );
});

app.get("/admin.html", (req, res) => {
    res.sendFile(
        path.join(FRONTEND_DIR, "admin.html")
    );
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    try {
        await connectDatabase();

        app.listen(PORT, "0.0.0.0", () => {
            console.log("========================================");
            console.log("?? MealAI server started successfully");
            console.log(`?? http://localhost:${PORT}`);
            console.log("========================================");
        });
    } catch (error) {
        console.error("? Server startup failed:");
        console.error(error);
        process.exit(1);
    }
}

startServer();