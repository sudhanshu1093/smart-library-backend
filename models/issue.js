const mongoose = require("mongoose");

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

module.exports = mongoose.model("Issue", issueSchema);