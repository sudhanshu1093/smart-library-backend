require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());

// CORS Fix
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

/* ================= USER SCHEMA ================= */

const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["student", "librarian"],
    required: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});

const User = mongoose.model("User", userSchema);

/* ================= BOOK SCHEMA ================= */

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const Book = mongoose.model("Book", bookSchema);

/* ================= ISSUE SCHEMA ================= */

const issueSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    username: { type: String, required: true },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returned: { type: Boolean, default: false },
    returnDate: { type: Date },
    fine: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Issue = mongoose.model("Issue", issueSchema);

const FINE_PER_DAY = 1;
const MAX_BOOK_LIMIT = 3;

/* ================= TEST ROUTE ================= */

app.get("/", (req, res) => {
  res.send("Smart Library Backend Running 🚀");
});

/* ================= REGISTER ================= */

app.post("/register", async (req, res) => {
  try {
    const { role, username, password } = req.body;

    if (!role || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    const existingUser = await User.findOne({ username });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      role,
      username,
      password: hashedPassword,
    });

    await newUser.save();

    res.json({
      success: true,
      message: "Registered successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
  try {
    const { role, username, password } = req.body;

    if (!role || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    const user = await User.findOne({ username, role });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
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
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= BOOK ROUTES ================= */

// Add Book
app.post("/books", async (req, res) => {
  try {
    const { title, author, quantity } = req.body;

    const book = await Book.create({
      title,
      author,
      quantity: Number(quantity),
    });

    res.json({
      success: true,
      message: "Book added",
      book,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Get Books
app.get("/books", async (req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      books,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= ISSUE ROUTES ================= */

// Issue Book
app.post("/issues/issue", async (req, res) => {
  try {
    const { bookId, username } = req.body;

    const book = await Book.findById(bookId);

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    if (book.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Book not available",
      });
    }

    // Student limit check
    const issuedCount = await Issue.countDocuments({
      username,
      returned: false,
    });

    if (issuedCount >= MAX_BOOK_LIMIT) {
      return res.status(400).json({
        success: false,
        message: "Maximum 3 books allowed",
      });
    }

    const issueDate = new Date();

    const dueDate = new Date();
    dueDate.setDate(issueDate.getDate() + 15);

    const issue = await Issue.create({
      bookId,
      username,
      issueDate,
      dueDate,
    });

    book.quantity -= 1;
    await book.save();

    res.json({
      success: true,
      message: "Book issued",
      issue,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Return Book
app.post("/issues/return", async (req, res) => {
  try {
    const { issueId } = req.body;

    const issue = await Issue.findById(issueId);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue not found",
      });
    }

    if (issue.returned) {
      return res.status(400).json({
        success: false,
        message: "Already returned",
      });
    }

    const now = new Date();
    const due = new Date(issue.dueDate);

    const diff = now - due;
    const daysLate = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;

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

    res.json({
      success: true,
      message: "Book returned",
      fine,
      daysLate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= STUDENT FINE ROUTE ================= */

app.get("/issues/fine/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const issues = await Issue.find({
      username,
      returned: false,
    });

    let fine = 0;

    const today = new Date();

    issues.forEach((issue) => {
      const diff = today - new Date(issue.dueDate);
      const lateDays = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
      fine += lateDays * FINE_PER_DAY;
    });

    res.json({
      success: true,
      fine,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= ALL ISSUES ================= */

app.get("/issues", async (req, res) => {
  try {
    const issues = await Issue.find()
      .populate("bookId")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      issues,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});