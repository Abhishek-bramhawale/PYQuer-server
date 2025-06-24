const mongoose = require('mongoose');

const analysisHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  papersInfo: [
    {
      originalName: { type: String, required: true },
      subject: { type: String },
      year: { type: Number },
      needsOCR: { type: Boolean },
    },
  ],
  prompt: {
    type: String,
    required: true,
  },
  papersText: {
    type: String,
    required: false,
  },
  analysis: {
    type: String,
    required: true,
  },
  modelUsed: {
    type: String,
    enum: ['gemini', 'mistral', 'cohere'],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('AnalysisHistory', analysisHistorySchema, 'pyquer_analysis_history'); 