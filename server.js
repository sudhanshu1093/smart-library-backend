require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// CORS Fix for browser requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// User Schema
const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["student", "librarian"],
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
});

const User = mongoose.model("User", userSchema);
// ✅ Book Schema
const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);
const Book = mongoose.model("Book", bookSchema);

// ✅ Issue Schema
const issueSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    username: { type: String, required: true, trim: true },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returned: { type: Boolean, default: false },
    returnDate: { type: Date },
    fine: { type: Number, default: 0 }
  },
  { timestamps: true }
);
const Issue = mongoose.model("Issue", issueSchema);

// ✅ Fixed fine for all books
const FINE_PER_DAY = 2;

// Test Route
app.get("/", (req, res) => {
  res.send("Smart Library Backend Running 🚀");
});

// 🔹 REGISTER ROUTE
app.post("/register", async (req, res) => {
  try {
    const { role, username, password } = req.body;

    if (!role || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required"
      });
    }

    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      role,
      username,
      password: hashedPassword
    });

    await newUser.save();

    res.json({
      success: true,
      message: "Registered successfully"
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// 🔹 LOGIN ROUTE
app.post("/login", async (req, res) => {
  try {
    const { role, username, password } = req.body;

    if (!role || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required"
      });
    }

    // ✅ ADD BOOK (Librarian)
app.post("/books", async (req, res) => {
  try {
    const { title, author, quantity } = req.body;

    if (!title || !author || quantity === undefined) {
      return res.status(400).json({ success: false, message: "title, author, quantity required" });
    }

    const q = Number(quantity);
    if (Number.isNaN(q) || q < 0) {
      return res.status(400).json({ success: false, message: "quantity must be a valid number" });
    }

    const book = await Book.create({ title, author, quantity: q });
    return res.json({ success: true, message: "Book added", book });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ GET ALL BOOKS (Everyone)
app.get("/books", async (req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 });
    return res.json({ success: true, books });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ ISSUE BOOK (Student)
app.post("/issues/issue", async (req, res) => {
  try {
    const { bookId, username } = req.body;

    if (!bookId || !username) {
      return res.status(400).json({ success: false, message: "bookId and username required" });
    }

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });

    if (book.quantity <= 0) {
      return res.status(400).json({ success: false, message: "Book not available" });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7 days later

    const issue = await Issue.create({ bookId, username, dueDate });

    book.quantity -= 1;
    await book.save();

    return res.json({ success: true, message: "Book issued", issue });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ RETURN BOOK + AUTO FINE (₹2/day)
app.post("/issues/return", async (req, res) => {
  try {
    const { issueId } = req.body;

    if (!issueId) {
      return res.status(400).json({ success: false, message: "issueId required" });
    }

    const issue = await Issue.findById(issueId);
    if (!issue) return res.status(404).json({ success: false, message: "Issue record not found" });

    if (issue.returned) {
      return res.status(400).json({ success: false, message: "Already returned" });
    }

    const now = new Date();
    const due = new Date(issue.dueDate);

    const diffMs = now - due;
    const daysLate = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
    const fine = daysLate * FINE_PER_DAY;

    issue.returned = true;
    issue.returnDate = now;
    issue.fine = fine;
    await issue.save();

    const book = await Book.findById(issue.bookId);
    if (book) {
      book.quantity += 1;
      await book.save();
    }

    return res.json({ success: true, message: "Book returned", daysLate, fine, issue });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ LIST ALL ISSUES (optional)
app.get("/issues", async (req, res) => {
  try {
    const issues = await Issue.find().populate("bookId").sort({ createdAt: -1 });
    return res.json({ success: true, issues });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

    const user = await User.findOne({ username, role });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});