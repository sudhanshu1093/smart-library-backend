const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["student", "librarian"], required: true },
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);