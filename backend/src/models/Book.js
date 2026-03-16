import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    author: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    category: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 800 },

   cover: {
  filename: { type: String },
  mime: { type: String },
  size: { type: Number },
},
    file: {
      filename: { type: String, required: true },
      mime: { type: String, required: true },
      size: { type: Number, required: true },
      sha256: { type: String, required: true },
    },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    downloads: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "removed"], default: "active" },
  },
  { timestamps: true }
);

bookSchema.index({ title: "text", author: "text", category: "text" });

export default mongoose.model("Book", bookSchema);