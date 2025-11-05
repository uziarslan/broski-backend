if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const app = express();
const session = require("express-session");
const mongoose = require("mongoose");
const MongoDBStore = require("connect-mongo");
const bodyParser = require("body-parser");
const ExpressError = require("./utils/ExpressError");
const cors = require("cors");
const config = require("./config");

// Variables
const PORT = config.PORT;
const mongoURi = config.MONGODB_URI;
const secret = "thisisnotagoodsecret";

const store = MongoDBStore.create({
    mongoUrl: mongoURi,
    secret,
    touchAfter: 24 * 60 * 60,
});

const sessionConfig = {
    store,
    secret,
    name: "session",
    resave: false,
    saveUninitialized: false,
};

const allowedOrigins = [config.ADMIN_PANEL_URL, config.DOMAIN_FRONTEND, 'http://localhost:3000'].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Mobile apps (iOS/Android from Play Store/Apple Store) don't send Origin header
        // This automatically allows all mobile app requests
        if (!origin) return callback(null, true);

        // Allow if origin is in the allowed list (admin panel, web frontend)
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }

        // Log blocked origins for debugging
        console.log('CORS blocked origin:', origin);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Trust proxy to get correct client IP (important for rate limiting)
app.set('trust proxy', 1);

// Using the app
app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session(sessionConfig));

// Basic health check route
app.get("/", (req, res) => {
    res.json({ message: "Broski Backend API is running!", port: PORT });
});

// API health check
app.get("/api/health", (req, res) => {
    res.json({ status: "OK", message: "Backend is healthy" });
});

// API endpoint for application connection test
app.get("/api/connection", (req, res) => {
    res.json({
        status: "connected",
        message: "Application successfully connected to backend",
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Import routes
const aiRoutes = require('./routes/ai-routes');
const userRoutes = require('./routes/user-routes');
const authRoutes = require('./routes/auth-routes');
const tvRoutes = require('./routes/tv-routes');
const revenueCatRoutes = require('./routes/revenueCat-routes');

// Use routes
app.use('/api/ai', aiRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes); // Add this for admin panel compatibility
app.use('/api/auth', authRoutes);
app.use('/api/tv', tvRoutes);
app.use('/api/revenuecat', revenueCatRoutes);

// CORS is handled by the cors middleware above

// initializing Mongoose
mongoose
    .connect(mongoURi, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log("Mongoose is connected");
    })
    .catch((e) => {
        console.log(e);
    });

// handling the error message - catch all route for 404s
app.use((req, res, next) => {
    next(new ExpressError("Page not found", 404));
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    const { status = 500 } = err;
    if (!err.message) err.message = "Oh No, Something Went Wrong!";
    res.status(status).json({ message: err.message });
});

// Listen for the port Number
app.listen(PORT, () => {
    console.log(`App is listening on http://localhost:${PORT}`);
});