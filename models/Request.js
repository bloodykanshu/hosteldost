const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  destination: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  mode: {
    type: String,
    required: true
  },
  spots: {
    type: Number,
    required: true,
    min: 1
  },
  fare: {
    type: Number,
    required: true
  },
  hostName: {
    type: String,
    required: true
  },
  room: {
    type: String,
    required: true
  },
  hostAvatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
  },
  coverImage: {
    type: String,
    default: 'https://images.unsplash.com/photo-1515165562839-97840135d070?w=600'
  },
  contact: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Request', requestSchema);
