require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB connection (abhi temporary blank)
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/test")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// Simple test route
app.get("/", (req, res) => {
  res.send("Smart Library Backend Running 🚀");
});

app.post("/login", (req, res) => {
  const { role, username, password } = req.body;

  if (!role || !username || !password) {
    return res.json({ success: false, message: "All fields required" });
  }

  // Dummy user check (temporary)
  if (username === "admin" && password === "1234") {
    return res.json({ success: true });
  }

  res.json({ success: false, message: "Invalid Credentials" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});