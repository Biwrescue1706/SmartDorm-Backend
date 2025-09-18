"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
const MONGO_URI = process.env.MONGO_URI;
mongoose_1.default.connect(MONGO_URI, {
    dbName: "SmartDormDB",
})
    .then(() => {
    console.log(" Connected to MongoDB database ");
})
    .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
});
// routes
const auth_1 = __importDefault(require("./routes/auth"));
app.get("/", (req, res) => {
    res.send("🚀 ระบบ Backend ของ SmartDorm ");
});
app.use("/auth", auth_1.default);
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
