const express = require("express");
const router = express.Router();

const Book = require("../models/Book");   // (agar file name Books.js hai to ../models/Books)
const Issue = require("../models/issue");

const FINE_PER_DAY = 2;

// ISSUE a book
router.post("/issue", async (req, res) => {
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

    // due date = 7 days from now (change if you want)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const issue = await Issue.create({
      bookId,
      username,
      dueDate
    });

    // decrease quantity
    book.quantity -= 1;
    await book.save();

    return res.json({ success: true, message: "Book issued", issue });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// RETURN a book  ✅ (THIS IS WHAT YOU NEED)
router.post("/return", async (req, res) => {
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

    // days late
    const diffMs = now - due;
    const daysLate = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
    const fine = daysLate * FINE_PER_DAY;

    issue.returned = true;
    issue.returnDate = now;
    issue.fine = fine;
    await issue.save();

    // increase quantity back
    const book = await Book.findById(issue.bookId);
    if (book) {
      book.quantity += 1;
      await book.save();
    }

    return res.json({
      success: true,
      message: "Book returned",
      daysLate,
      fine,
      issue
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// list all issues (optional but useful)
router.get("/", async (req, res) => {
  try {
    const issues = await Issue.find().populate("bookId");
    return res.json({ success: true, issues });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;