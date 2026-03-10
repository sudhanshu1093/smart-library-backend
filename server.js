require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* ================= DATABASE ================= */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

/* ================= USER ================= */

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

/* ================= BOOK ================= */

const bookSchema = new mongoose.Schema(
  {
    title: String,
    author: String,
    quantity: Number,
  },
  { timestamps: true }
);

const Book = mongoose.model("Book", bookSchema);

/* ================= ISSUE ================= */

const issueSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
    username: String,
    issueDate: { type: Date, default: Date.now },
    dueDate: Date,
    returned: { type: Boolean, default: false },
    returnDate: Date,
    fine: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Issue = mongoose.model("Issue", issueSchema);

const FINE_PER_DAY = 1;
const MAX_BOOK_LIMIT = 3;

/* ================= TEST ================= */

app.get("/", (req, res) => {
  res.send("Smart Library Backend Running 🚀");
});

/* ================= REGISTER ================= */

app.post("/register", async (req, res) => {
  try {
    const { role, username, password } = req.body;

    const existing = await User.findOne({ username });

    if (existing) {
      return res.json({ success: false, message: "Username exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      role,
      username,
      password: hash,
    });

    res.json({
      success: true,
      message: "Registered",
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
  try {
    const { role, username, password } = req.body;

    const user = await User.findOne({ username, role });

    if (!user) {
      return res.json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      username,
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= BOOK ROUTES ================= */

// Add Book
app.post("/books", async (req, res) => {
  const { title, author, quantity } = req.body;

  const book = await Book.create({
    title,
    author,
    quantity,
  });

  res.json({ success: true, book });
});

// Get Books
app.get("/books", async (req, res) => {
  const books = await Book.find().sort({ createdAt: -1 });

  res.json({
    success: true,
    books,
  });
});

/* ================= ISSUE BOOK ================= */

app.post("/issues/issue", async (req, res) => {
  try {
    const { bookId, username } = req.body;

    const book = await Book.findById(bookId);

    if (!book || book.quantity <= 0) {
      return res.json({
        success: false,
        message: "Book not available",
      });
    }

    const issuedCount = await Issue.countDocuments({
      username,
      returned: false,
    });

    if (issuedCount >= MAX_BOOK_LIMIT) {
      return res.json({
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
      issue,
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= GET STUDENT ISSUED BOOKS ================= */

app.get("/issues/user/:username", async (req, res) => {
  try {

    const username = req.params.username;

    const issues = await Issue.find({
      username: username,
      returned: false
    }).populate("bookId");

    res.json({
      success: true,
      issues
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Server error"
    });

  }
});
/* ================= RETURN BOOK ================= */

app.post("/issues/return", async (req, res) => {
  try {
    const { issueId } = req.body;

    const issue = await Issue.findById(issueId);

    if (!issue || issue.returned) {
      return res.json({
        success: false,
        message: "Invalid return",
      });
    }

    const now = new Date();
    const due = new Date(issue.dueDate);

    const diff = now - due;

    const lateDays =
      diff > 0
        ? Math.ceil(diff / (1000 * 60 * 60 * 24))
        : 0;

    const fine = lateDays * FINE_PER_DAY;

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
      fine,
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= STUDENT FINE ================= */

app.get("/issues/fine/:username", async (req, res) => {
  const issues = await Issue.find({
    username: req.params.username,
    returned: false,
  });

  let fine = 0;

  const today = new Date();

  issues.forEach((issue) => {
    const diff = today - new Date(issue.dueDate);

    const lateDays =
      diff > 0
        ? Math.ceil(diff / (1000 * 60 * 60 * 24))
        : 0;

    fine += lateDays * FINE_PER_DAY;
  });

  res.json({
    success: true,
    fine,
  });
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});